"""Fetch fakebuddhaquotes.com's index of quotes falsely attributed to the Buddha.

One polite GET (this is not a Wikimedia host, but we still identify ourselves
and go easy -- a single request to one index page is already everything we
need, listed alphabetically).

Writes data/library/raw/fakebuddha/list.json:
  { "fake": ["quote text", ...], "fakeish": ["quote text", ...],
    "source_url": "..." }

"fake" is the site's own "Fake Quotes" section (mistranslations and
misattributions) and is what build.py uses to flag Buddha misattributions.
"fakeish" (borderline/uncertain per the site) is captured for transparency
but NOT used to auto-label anything -- too uncertain to move a quote out of
the main library on its own.
"""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import polite_get, save_json, RAW_DIR, normalize_whitespace_and_quotes  # noqa: E402

URL = "https://fakebuddhaquotes.com/all-fake-buddha-quotes/"

LI_RE = re.compile(r"<li>\s*<a[^>]*>(.*?)</a>\s*</li>", re.IGNORECASE | re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")


def extract_section(body: str, heading: str) -> str:
    m = re.search(rf"<h3>\s*{re.escape(heading)}\s*</h3>", body, re.IGNORECASE)
    if not m:
        return ""
    start = m.end()
    nxt = re.search(r"<h3>", body[start:], re.IGNORECASE)
    end = start + nxt.start() if nxt else len(body)
    return body[start:end]


def extract_quotes(section_html: str) -> list[str]:
    out = []
    for m in LI_RE.finditer(section_html):
        raw = m.group(1)
        text = TAG_RE.sub("", raw)
        text = html.unescape(text)
        text = normalize_whitespace_and_quotes(text)
        text = text.strip("“”\"' ")
        text = normalize_whitespace_and_quotes(text)
        if not text:
            continue
        # a handful of <li> entries link to roundup/essay posts, not a single
        # quote (e.g. "10+ FAKE Buddha Quotes on Friendship") -- drop those
        if re.match(r"^\d+\+?\s", text) or re.search(r"\bFAKE\b", text):
            continue
        word_count = len(text.split())
        if word_count < 6 and not re.search(r'[.!?"”]$', text):
            continue
        out.append(text)
    return out


def main():
    resp = polite_get(URL)
    body = resp.text
    art_start = body.find('<article id="post-30"')
    art_end = body.find("</article>", art_start)
    article = body[art_start:art_end] if art_start != -1 else body

    fake = extract_quotes(extract_section(article, "Fake Quotes"))
    fakeish = extract_quotes(extract_section(article, "Fakeish Quotes"))

    out_path = RAW_DIR / "fakebuddha" / "list.json"
    save_json(out_path, {"source_url": URL, "fake": fake, "fakeish": fakeish})
    print(f"fakebuddhaquotes.com: fake={len(fake)} fakeish={len(fakeish)} -> {out_path}")


if __name__ == "__main__":
    main()
