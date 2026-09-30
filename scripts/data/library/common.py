"""Shared utilities for the Philosophew library pipeline.

Owned by the library agent. Keep this dependency-light (stdlib + requests/pandas/pyarrow,
all already available) so `README.md`'s "how to rerun" stays simple.
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path
from typing import Any, Iterable, Optional

import requests

# ---------------------------------------------------------------------------
# Console / IO setup
# ---------------------------------------------------------------------------

def setup_utf8_console() -> None:
    """Windows consoles default to cp1252; our author names contain Thai,
    Vietnamese, Chinese, Greek etc. Reconfigure stdout/stderr so print()
    never crashes on them."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name)
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


setup_utf8_console()

ROOT = Path(__file__).resolve().parents[3]  # C:\dev\philosophew
LIB_SCRIPTS_DIR = Path(__file__).resolve().parent  # scripts/data/library
DATA_LIBRARY_DIR = ROOT / "data" / "library"
RAW_DIR = DATA_LIBRARY_DIR / "raw"
PUBLIC_LIBRARY_DIR = ROOT / "public" / "data" / "library"

USER_AGENT = "PhilosophewBot/0.1 (https://philosophew.lol)"
HEADERS = {"User-Agent": USER_AGENT}

# ---------------------------------------------------------------------------
# JSON / JSONL IO -- always UTF-8, never \uXXXX escapes
# ---------------------------------------------------------------------------

def load_json(path: Path | str, default: Any = None) -> Any:
    p = Path(path)
    if not p.exists():
        return default
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path | str, obj: Any, indent: Optional[int] = 2) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent)
        f.write("\n")


def load_jsonl(path: Path | str) -> list[dict]:
    p = Path(path)
    if not p.exists():
        return []
    rows = []
    with open(p, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def save_jsonl(path: Path | str, rows: Iterable[dict]) -> int:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False))
            f.write("\n")
            n += 1
    return n


# ---------------------------------------------------------------------------
# Polite HTTP
# ---------------------------------------------------------------------------

_last_wikimedia_call = 0.0
WIKIMEDIA_DELAY_S = 0.3


def wikimedia_get(params: dict, host: str = "en.wikiquote.org", timeout: int = 25) -> dict:
    """Sequential, ~300ms-spaced GET against a Wikimedia action API. Retries
    transient errors a couple of times with backoff."""
    global _last_wikimedia_call
    url = f"https://{host}/w/api.php"
    last_exc = None
    for attempt in range(3):
        elapsed = time.monotonic() - _last_wikimedia_call
        if elapsed < WIKIMEDIA_DELAY_S:
            time.sleep(WIKIMEDIA_DELAY_S - elapsed)
        try:
            resp = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
            _last_wikimedia_call = time.monotonic()
            resp.raise_for_status()
            return resp.json()
        except Exception as e:  # noqa: BLE001
            last_exc = e
            _last_wikimedia_call = time.monotonic()
            time.sleep(1.0 * (attempt + 1))
    raise RuntimeError(f"wikimedia_get failed for {params}: {last_exc}")


def polite_get(url: str, timeout: int = 30, retries: int = 3, headers: Optional[dict] = None) -> requests.Response:
    hdrs = dict(HEADERS)
    if headers:
        hdrs.update(headers)
    last_exc = None
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=hdrs, timeout=timeout)
            resp.raise_for_status()
            return resp
        except Exception as e:  # noqa: BLE001
            last_exc = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"polite_get failed for {url}: {last_exc}")


# ---------------------------------------------------------------------------
# Alias table / author matching
# ---------------------------------------------------------------------------

def _strip_accents(s: str) -> str:
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def normalize_author_key(s: str) -> str:
    """Normalize an author string for alias lookup: strip accents, lowercase,
    drop periods/commas-as-noise, collapse whitespace, drop common honorifics."""
    if not s:
        return ""
    s = _strip_accents(s)
    s = s.lower()
    s = re.sub(r"\b(dr|sir|st|saint|prof)\.?\b", " ", s)
    s = s.replace(".", " ")
    s = re.sub(r"[^a-z0-9,\s-]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


class AliasTable:
    def __init__(self, path: Path | str):
        data = load_json(path)
        self.raw = data
        self.reverse: dict[str, str] = {}
        for roster_id, names in data["aliases"].items():
            for name in names:
                key = normalize_author_key(name)
                if key:
                    self.reverse[key] = roster_id
        self.wikiquote_titles: dict[str, str] = data.get("wikiquote_titles", {})
        self.drop_keywords: dict[str, list[str]] = data.get("drop_keywords", {})

    def match(self, raw_author: str) -> Optional[str]:
        if not raw_author or not isinstance(raw_author, str):
            return None
        key = normalize_author_key(raw_author)
        if not key:
            return None
        if key in self.reverse:
            return self.reverse[key]
        # try text before a comma ("Marcus Aurelius, Meditations" -> "Marcus Aurelius")
        if "," in key:
            head = key.split(",")[0].strip()
            if head in self.reverse:
                return self.reverse[head]
        # try stripping a trailing parenthetical already removed by normalize; try
        # collapsing "firstname lastname jr" style suffixes
        for suffix in (" jr", " sr", " the younger", " the elder"):
            if key.endswith(suffix):
                trimmed = key[: -len(suffix)].strip()
                if trimmed in self.reverse:
                    return self.reverse[trimmed]
        return None

    def should_drop_for_keywords(self, roster_id: str, text: str) -> bool:
        kws = self.drop_keywords.get(roster_id)
        if not kws:
            return False
        low = text.lower()
        return any(kw.lower() in low for kw in kws)


# ---------------------------------------------------------------------------
# Text cleaning (Processing step 2)
# ---------------------------------------------------------------------------

_MOJIBAKE_MARKERS = ("Ã", "Â", "â€", "€™", "€œ", "€\x9d", "Ã©", "Ã¨")


def repair_mojibake(s: str) -> str:
    """Repair common UTF-8-decoded-as-Latin-1/cp1252 mojibake (e.g. 'â€™' for
    a right single quote). Only applies the fix if it round-trips cleanly and
    the marker was actually present, to avoid mangling clean text."""
    if not s or not any(m in s for m in _MOJIBAKE_MARKERS):
        return s
    try:
        candidate = s.encode("cp1252").decode("utf-8")
    except (UnicodeDecodeError, UnicodeEncodeError):
        return s
    # Heuristic: candidate should have fewer "suspicious" marker bytes than original
    if sum(candidate.count(m) for m in _MOJIBAKE_MARKERS) < sum(s.count(m) for m in _MOJIBAKE_MARKERS):
        return candidate
    return s


_CURLY_MAP = {
    "\u2018": "'", "\u2019": "'", "\u201a": "'", "\u201b": "'",
    "\u201c": '"', "\u201d": '"', "\u201e": '"', "\u201f": '"',
    "\u2013": "-", "\u2014": "-", "\u2026": "...",
    "\u00a0": " ", "\u200b": "",
}


def normalize_whitespace_and_quotes(s: str) -> str:
    for k, v in _CURLY_MAP.items():
        s = s.replace(k, v)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\s*\n\s*", " ", s)
    # collapse artifacts left behind when a template/link was stripped out
    # (e.g. "p. 32, , Beacon Press" after an {{ISBN|..}} template is dropped)
    s = re.sub(r"(,\s*){2,}", ", ", s)
    s = re.sub(r"\(\s*\)", "", s)
    s = re.sub(r"\s+([,.;:])", r"\1", s)
    s = re.sub(r"^[\s,;:-]+", "", s)
    s = re.sub(r"[\s,;:-]+$", "", s)
    s = s.strip()
    return s


_WRAPPING_QUOTE_RE = re.compile(r'^["\'\u201c\u2018](.*)["\'\u201d\u2019]$', re.DOTALL)


def strip_wrapping_quotes(s: str) -> str:
    s = s.strip()
    # iterate in case of doubled wrapping
    for _ in range(2):
        m = _WRAPPING_QUOTE_RE.match(s)
        if m and len(m.group(1)) > 0:
            inner = m.group(1)
            # don't strip if it would remove a quote that's part of a nested quotation
            # (heuristic: only strip if the outer chars are actually matched wrapping)
            s = inner.strip()
        else:
            break
    return s


_URL_RE = re.compile(r"(https?://|www\.)\S+", re.IGNORECASE)


# Windows-1252 punctuation decoded as C1 control characters, PDF ligatures, odd hyphens and bars, bidi marks,
# and Pali niggahita written with a dot above (the app's serif draws the dot-below form, the modern standard)
_CHAR_FIX = {
    "\x91": "'", "\x92": "'", "\x93": '"', "\x94": '"', "\x96": "-", "\x97": "-", "\x85": "...",
    "\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl", "\ufb03": "ffi", "\ufb04": "ffl",
    "\u2010": "-", "\u2011": "-", "\u2015": "-", "\u02d0": ":", "\u200e": "", "\u200f": "",
    "\u1e41": "\u1e43", "\u1e40": "\u1e42",
    # the Greek raised stop (ano teleia, which NFC turns into a middle dot): a comma, as the curators write it
    "\u0387": ",", "\u00b7": ",",
}

# Wikiquote page furniture that rides into a citation from its sub-bullets, and the variant translations listed
# after it (a citation says where a line comes from, not every other way to say it)
_CITE_JUNK = [
    (re.compile(r"\bframeless\b", re.IGNORECASE), ""),
    (re.compile(r"\bQOTD\s+\d{4}\W\d{1,2}\W\d{1,2}\b"), ""),
    (re.compile(r"\bSound file\b", re.IGNORECASE), ""),
    (re.compile(r"\s*[\u00b7|]?\s*Full text online\b", re.IGNORECASE), ""),
    (re.compile(r"\s*\bVariant translations?.*$", re.IGNORECASE | re.DOTALL), ""),  # another rendering and its source ("translationː" too)
]


def clean_citation(raw: Optional[str]) -> Optional[str]:
    """A citation without page furniture, variant lists or middle dots; None when nothing is left."""
    if not raw:
        return None
    s = raw
    for rx, rep in _CITE_JUNK:
        s = rx.sub(rep, s)
    s = "".join(_CHAR_FIX.get(c, c) for c in s)
    s = re.sub(r"\s+", " ", s).strip(" ,;")
    return s or None


# scraped page furniture, and scripts no author in the roster writes in (the app cannot set them)
_JUNK_RE = re.compile(r"my quotes|sort by|showing \d+\s*-\s*\d+ of|goodreads|upvote", re.IGNORECASE)
_ALIEN_RE = re.compile(r"[԰-֏Ⴀ-ჿ֐-׿؀-ۿऀ-ॿ]")


_CITE_TAIL = re.compile(r"\s+Ch\. \d+(?:, sect\. \d+)?\s*(?:\S+\s*)?\(tr\. [^)]*\).*$", re.DOTALL)
_ONLY_CITE = re.compile(r"^.{0,45}?\(?\b(?:[Tt]ranslated by|tr\.)\s")


def clean_quote_text(raw: str) -> Optional[str]:
    """Processing step 2. Returns cleaned text, or None if the row should be dropped."""
    if not raw or not isinstance(raw, str):
        return None
    s = raw
    if "&" in s:
        s = html.unescape(s)
    s = repair_mojibake(s)
    s = "".join(_CHAR_FIX.get(c, c) for c in s)
    if _JUNK_RE.search(s) or _ALIEN_RE.search(s):
        return None
    # a citation is not a quote: a line that is only one goes, and one pasted after the quote is cut off
    # ("... lathe of Heaven. Ch. 23, sect. 7 (tr. James Legge, 1891) <another translation and an editor's note>")
    s = _CITE_TAIL.sub("", s)
    s = re.sub(r"\s*\bVariant translations?\s*$", "", s)  # a Wikiquote sub-heading left on the line
    if _ONLY_CITE.match(s):
        return None
    s = normalize_whitespace_and_quotes(s)
    s = strip_wrapping_quotes(s)
    s = normalize_whitespace_and_quotes(s)
    if not s:
        return None
    if _URL_RE.search(s):
        return None
    if len(s) > 600 or len(s) < 12:
        return None
    letters = sum(1 for c in s if c.isalpha())
    if letters < max(6, len(s) * 0.4):
        return None
    # obviously-not-a-quote heuristics
    low = s.lower()
    if low.startswith(("see also", "external link", "isbn ", "chapter ", "retrieved from")):
        return None
    if re.fullmatch(r"[\d\s.,:;\-–—]+", s):
        return None
    return s


# ---------------------------------------------------------------------------
# Near-duplicate detection (Processing step 3)
# ---------------------------------------------------------------------------

_PUNCT_RE = re.compile(r"[^\w\s]", re.UNICODE)


def norm_match_text(s: str) -> str:
    s = _strip_accents(s.lower())
    s = _PUNCT_RE.sub(" ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def word_shingles(s: str, k: int = 3) -> set[tuple[str, ...]]:
    words = s.split()
    if len(words) == 0:
        return set()
    if len(words) < k:
        return {tuple(words)}
    return {tuple(words[i:i + k]) for i in range(len(words) - k + 1)}


def jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def is_near_duplicate(text_a: str, text_b: str, threshold: float = 0.8) -> bool:
    na, nb = norm_match_text(text_a), norm_match_text(text_b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    if (na in nb or nb in na) and min(len(na), len(nb)) >= 20:
        return True
    sa, sb = word_shingles(na), word_shingles(nb)
    return jaccard(sa, sb) >= threshold


def is_fuzzy_match(text_a: str, text_b: str, threshold: float = 0.6) -> bool:
    """Looser than is_near_duplicate; used to match a dataset/collected quote
    against a Wikiquote entry that may be a different translation/OCR pass."""
    na, nb = norm_match_text(text_a), norm_match_text(text_b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    if (na in nb or nb in na) and min(len(na), len(nb)) >= 20:
        return True
    sa, sb = word_shingles(na), word_shingles(nb)
    return jaccard(sa, sb) >= threshold


# ---------------------------------------------------------------------------
# misc
# ---------------------------------------------------------------------------

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)


if __name__ == "__main__":  # python common.py: the cleaners on lines they once let through
    assert clean_citation("I and Thou (1923), All real life is meeting. Variant translationː All actual life is encounter.") == "I and Thou (1923), All real life is meeting."
    assert clean_citation("General, As quoted in Kierkegaard, the Melancholy Dane (1950) by Harold Victor Martin. Variant translation. Last Notebook") == "General, As quoted in Kierkegaard, the Melancholy Dane (1950) by Harold Victor Martin."
    assert clean_citation("Letters frameless QOTD 2011-05-02") == "Letters"
    assert clean_citation("frameless") is None
    assert clean_quote_text("A journey of a thousand li starts with a single step. Variant translations") == "A journey of a thousand li starts with a single step."
    print("common.py: cleaners ok")
