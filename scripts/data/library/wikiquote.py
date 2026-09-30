"""Wikiquote wikitext fetch + parse.

Fetches an author's English Wikiquote page (following redirects) and splits
it into:
  - main:  quotes from the "Sourced"-style sections (the page's real content,
           whatever it's titled -- Quotes, Pali Canon, Mahayana, chapter/book
           subsections, etc.) with a best-effort citation built from the
           heading path + the quote's own sub-bullet(s).
  - disputed: entries under a literal "==Disputed==" heading.
  - misattributed: entries under a literal "==Misattributed==" heading.
"""
from __future__ import annotations

import html
import re
from typing import Optional

from common import wikimedia_get, normalize_whitespace_and_quotes

HEADING_RE = re.compile(r"^(={2,6})\s*(.*?)\s*\1\s*$")
BULLET_RE = re.compile(r"^(\*+)\s*(.*)$")
SECTION_TITLE_RE = re.compile(r"^(chapter|book|passage|part|sutta|verse|section|episode)\s+", re.IGNORECASE)

SKIP_TITLE_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in [
        r"^external links?$",
        r"^see also$",
        r"^references?$",
        r"^sources?$",
        r"^further reading$",
        r"^notes?$",
        r"^bibliography$",
        r"^quotes? about\b",
    ]
]
DISPUTED_PATTERNS = [re.compile(r"^disputed$", re.IGNORECASE)]
MISATTRIBUTED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in [r"^misattributed$", r"^attributed and disputed$"]]
GENERIC_L2_TITLES = {"quotes", "sourced", "attributed", "quotations"}


def classify_l2_title(title_clean: str) -> str:
    t = title_clean.strip()
    for p in DISPUTED_PATTERNS:
        if p.match(t):
            return "disputed"
    for p in MISATTRIBUTED_PATTERNS:
        if p.match(t):
            return "misattributed"
    for p in SKIP_TITLE_PATTERNS:
        if p.match(t):
            return "skip"
    return "main"


def strip_wiki_markup(s: str) -> str:
    if not s:
        return ""
    # refs
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.DOTALL | re.IGNORECASE)
    s = re.sub(r"<ref[^/>]*/>", "", s, flags=re.IGNORECASE)
    # br -> space
    s = re.sub(r"<br\s*/?>", " ", s, flags=re.IGNORECASE)
    # strip simple wrapper html tags, keep inner text
    s = re.sub(r"</?(small|big|poem|span|div|center|sup|sub|nowiki|blockquote|font|u)[^>]*>", "", s, flags=re.IGNORECASE)

    s = s.replace("{{'}}", "'")

    def _lang_sub(m: re.Match) -> str:
        parts = m.group(1).split("|")
        return parts[-1] if parts else ""

    s = re.sub(r"\{\{\s*lang\|([^{}]*)\}\}", _lang_sub, s, flags=re.IGNORECASE)

    def _template_sub(m: re.Match) -> str:
        inner = m.group(1)
        parts = inner.split("|")
        name = parts[0].strip().lower()
        if name in ("w", "wikipedia", "wq"):
            return parts[-1] if len(parts) > 1 else parts[0]
        if name in ("sic",):
            return parts[1] if len(parts) > 1 else ""
        return ""

    for _ in range(3):
        new_s = re.sub(r"\{\{([^{}]*)\}\}", _template_sub, s)
        if new_s == s:
            break
        s = new_s

    def _link_sub(m: re.Match) -> str:
        parts = m.group(1).split("|")
        return parts[-1]

    s = re.sub(r"\[\[([^\[\]]*)\]\]", _link_sub, s)

    def _extlink_sub(m: re.Match) -> str:
        inner = m.group(1).strip()
        parts = inner.split(None, 1)
        return parts[1] if len(parts) > 1 else ""

    s = re.sub(r"\[([^\[\]]*)\]", _extlink_sub, s)

    s = s.replace("'''", "")
    s = s.replace("''", "")
    s = re.sub(r"<[^>]+>", "", s)
    # Defensive: if any [[...]] / {{...}} survived (unbalanced/nested markup
    # our regexes didn't anticipate), strip just the bracket punctuation
    # rather than ship raw wikitext syntax to readers.
    if "[[" in s or "]]" in s:
        s = s.replace("[[", "").replace("]]", "")
    if "{{" in s or "}}" in s:
        s = s.replace("{{", "").replace("}}", "")
    # HTML entities decoded LAST: some editors write &#91;/&#93; specifically
    # to *show* a literal bracket without it being parsed as a link -- decoding
    # earlier would feed literal "[" back into the link/extlink regexes above.
    if "&" in s:
        s = html.unescape(s)
    return s


def clean_wikitext_inline(s: str) -> str:
    s = strip_wiki_markup(s)
    s = normalize_whitespace_and_quotes(s)
    return s.strip(" \t-—")


# Some Wikiquote entries append the locator to the *same* bullet as the quote
# instead of a "**" sub-bullet, e.g. "...is normal behavior. p. 32 in the 1992
# edition, Beacon Press". Split that off into the citation instead of letting
# it pollute the quote text.
_TRAILING_LOCATOR_RE = re.compile(
    r"\s*[,;]?\s*(p\.?\s*\d{1,4}(?:[-–]\d{1,4})?\s+in the \d{4}[^,.]*(?:edition|printing)[^,.]*(?:,[^,.]*)?)\s*$",
    re.IGNORECASE,
)


def extract_trailing_locator(text: str) -> tuple[str, Optional[str]]:
    m = _TRAILING_LOCATOR_RE.search(text)
    if not m:
        return text, None
    locator = m.group(1).strip()
    remainder = text[: m.start()].strip()
    if len(remainder) < 12:
        return text, None
    return remainder, locator


# A few Chan/Zen and Taoist pages (koan collections especially) give the
# original-language line as the "*" bullet and an English translation as the
# "**" sub-bullet -- the reverse of the usual quote/locator shape. Detect that
# and swap, since a CJK-only "text" field is useless to this English-source
# pipeline while the translation is exactly what we want.
_CJK_RE = re.compile(r"[㐀-䶿一-鿿]")
_TRAILING_CASE_TITLE_RE = re.compile(r"\.\s+(\d{1,3}\.\s+[A-Z][A-Za-z' -]{3,80})$")


def _is_mostly_cjk(s: str) -> bool:
    if not s:
        return False
    letters = sum(1 for c in s if c.isalpha())
    if not letters:
        return False
    cjk = len(_CJK_RE.findall(s))
    return cjk / letters > 0.3


def resolve_original_language_swap(text: str, note: str) -> tuple[str, Optional[str]]:
    """Returns (text, extra_citation_fragment)."""
    if not (_is_mostly_cjk(text) and note and len(note.split()) > 10 and not _is_mostly_cjk(note)):
        return text, None
    translation = note
    extra = None
    m = _TRAILING_CASE_TITLE_RE.search(translation)
    if m:
        extra = m.group(1).strip()
        translation = translation[: m.start() + 1].strip()  # keep the sentence-ending period
    return translation, extra


def fetch_wikitext(title: str) -> Optional[tuple[str, str]]:
    """Returns (resolved_title, wikitext) or None if the page doesn't exist."""
    data = wikimedia_get({
        "action": "parse",
        "page": title,
        "redirects": 1,
        "prop": "wikitext",
        "format": "json",
        "formatversion": 2,
    })
    if "error" in data:
        return None
    parse = data.get("parse")
    if not parse:
        return None
    return parse["title"], parse["wikitext"]


def parse_author_wikitext(wikitext: str) -> dict:
    lines = wikitext.splitlines()
    bucket = "main"
    work: Optional[str] = None
    section: Optional[str] = None

    results = {"main": [], "disputed": [], "misattributed": []}

    cur_text_lines: list[str] = []
    cur_note_lines: list[str] = []
    cur_active = False
    cur_stage: Optional[str] = None
    cur_work = None
    cur_section = None
    cur_bucket = "main"

    def flush():
        nonlocal cur_text_lines, cur_note_lines, cur_active, cur_stage
        if cur_active:
            text = clean_wikitext_inline(" ".join(cur_text_lines))
            note = clean_wikitext_inline(" ".join(cur_note_lines))
            if text:
                if cur_bucket == "main":
                    swapped_text, extra_case_title = resolve_original_language_swap(text, note)
                    if swapped_text != text:
                        text = swapped_text
                        note = extra_case_title or ""
                    elif not note:
                        text, extra = extract_trailing_locator(text)
                        if extra:
                            note = extra
                    path_str = ", ".join(p for p in (cur_work, cur_section) if p)
                    citation = ", ".join(p for p in (path_str, note) if p) or None
                    results["main"].append({"text": text, "citation": citation})
                elif cur_bucket in ("disputed", "misattributed"):
                    results[cur_bucket].append({"text": text, "note": note or None})
        cur_text_lines = []
        cur_note_lines = []
        cur_active = False
        cur_stage = None

    for raw_line in lines:
        line = raw_line.rstrip("\n")
        hm = HEADING_RE.match(line.strip())
        if hm:
            flush()
            level = len(hm.group(1))
            title_clean = clean_wikitext_inline(hm.group(2))
            if level == 2:
                bucket = classify_l2_title(title_clean)
                title_l = title_clean.strip().lower()
                work = None if (title_l in GENERIC_L2_TITLES or not title_clean) else title_clean
                section = None
            elif level == 3:
                if SECTION_TITLE_RE.match(title_clean) and work:
                    section = title_clean
                else:
                    work = title_clean
                    section = None
            else:  # level 4+
                section = title_clean
            continue

        bm = BULLET_RE.match(line)
        if bm:
            stars = bm.group(1)
            content = bm.group(2)
            if len(stars) == 1:
                flush()
                cur_active = True
                cur_stage = "text"
                cur_work = work
                cur_section = section
                cur_bucket = bucket
                cur_text_lines.append(content)
            else:
                if not cur_active:
                    continue
                cur_stage = "note"
                cur_note_lines.append(content)
            continue

        stripped = line.strip()
        if not stripped:
            continue
        if cur_active:
            if cur_stage == "text":
                cur_text_lines.append(stripped)
            else:
                cur_note_lines.append(stripped)

    flush()
    return results
