"""Fetch quote collections from GitHub, filtered to roster authors.

Sources processed (see the SKIPPED block for what was checked and passed on):
  - quotable-io/data           the actual seed-data repo behind lukePeavey/quotable
                                (the API server repo itself ships no data -- verified via its
                                git tree; quotable-io/data/data/quotes.json is the real source)
  - JamesFT/Database-Quotes-JSON
  - gmalmeida/philosopher-quotes  "Sagius" -- 160 public-domain philosophers, CC-BY 4.0 curation

Writes data/library/raw/github/<slug>.jsonl + data/library/raw/github/manifest.json
(same shape as fetch_hf.py's).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import polite_get, save_jsonl, save_json, RAW_DIR, AliasTable, eprint  # noqa: E402

# Checked via the GitHub API and NOT processed:
#   akmittal/quotes-dataset  - 22MB quotes.json, but sampled rows are the same goodreads-scrape
#                              corpus already covered by hf:jstet/quotes-500k (identical sample
#                              quote+tag vocabulary, e.g. "attributed-no-source"/"misattributed-*"
#                              tags on the same Dr. Seuss quote). Skipped as redundant processing
#                              of data we already have; dedup would just discard the overlap anyway.
#   Many 0-star personal repos returned by repo search (philosopher-quotes forks/school projects)
#     were not well-used enough to trust without individual vetting; skipped for time.

def load_json_url(url: str, timeout: int = 60):
    r = polite_get(url, timeout=timeout)
    return json.loads(r.text)


def load_jsonl_url(url: str, timeout: int = 60) -> list[dict]:
    r = polite_get(url, timeout=timeout)
    return [json.loads(line) for line in r.text.splitlines() if line.strip()]


def process_rows(rows, get_text, get_author, get_tags, key: str, aliases: AliasTable):
    kept = []
    for row in rows:
        raw_author = get_author(row)
        if not raw_author or not isinstance(raw_author, str):
            continue
        roster_id = aliases.match(raw_author)
        if not roster_id:
            continue
        tagval = get_tags(row) if get_tags else ""
        if "misattributed" in (tagval or "").lower():
            continue
        text = get_text(row)
        if not text or not isinstance(text, str):
            continue
        if aliases.should_drop_for_keywords(roster_id, text):
            continue
        kept.append({"author": roster_id, "text": text, "source_key": key, "raw_author": raw_author})
    return kept


def main():
    aliases = AliasTable(Path(__file__).resolve().parent / "aliases.json")
    manifest = []

    # --- quotable-io/data ---
    try:
        rows = load_json_url("https://raw.githubusercontent.com/quotable-io/data/master/data/quotes.json")
        kept = process_rows(
            rows,
            get_text=lambda r: r.get("content"),
            get_author=lambda r: r.get("author"),
            get_tags=lambda r: " ".join(r.get("tags") or []),
            key="gh:quotable-io/data",
            aliases=aliases,
        )
        save_jsonl(RAW_DIR / "github" / "quotable-io__data.jsonl", kept)
        manifest.append({
            "key": "gh:quotable-io/data", "name": "quotable-io/data",
            "url": "https://github.com/quotable-io/data", "license": "MIT",
            "rows_read": len(rows), "rows_kept": len(kept),
        })
        print(f"[gh] quotable-io/data: read={len(rows)} kept={len(kept)}")
    except Exception as e:  # noqa: BLE001
        eprint(f"[gh] quotable-io/data FAILED: {e}")
        manifest.append({"key": "gh:quotable-io/data", "name": "quotable-io/data",
                          "url": "https://github.com/quotable-io/data", "license": "MIT",
                          "rows_read": 0, "rows_kept": 0, "note": f"fetch failed: {e}"})

    # --- JamesFT/Database-Quotes-JSON ---
    try:
        rows = load_json_url("https://raw.githubusercontent.com/JamesFT/Database-Quotes-JSON/master/quotes.json")
        kept = process_rows(
            rows,
            get_text=lambda r: r.get("quoteText"),
            get_author=lambda r: r.get("quoteAuthor"),
            get_tags=None,
            key="gh:JamesFT/Database-Quotes-JSON",
            aliases=aliases,
        )
        save_jsonl(RAW_DIR / "github" / "JamesFT__Database-Quotes-JSON.jsonl", kept)
        manifest.append({
            "key": "gh:JamesFT/Database-Quotes-JSON", "name": "JamesFT/Database-Quotes-JSON",
            "url": "https://github.com/JamesFT/Database-Quotes-JSON", "license": "not stated",
            "rows_read": len(rows), "rows_kept": len(kept),
        })
        print(f"[gh] JamesFT/Database-Quotes-JSON: read={len(rows)} kept={len(kept)}")
    except Exception as e:  # noqa: BLE001
        eprint(f"[gh] JamesFT/Database-Quotes-JSON FAILED: {e}")
        manifest.append({"key": "gh:JamesFT/Database-Quotes-JSON", "name": "JamesFT/Database-Quotes-JSON",
                          "url": "https://github.com/JamesFT/Database-Quotes-JSON", "license": "not stated",
                          "rows_read": 0, "rows_kept": 0, "note": f"fetch failed: {e}"})

    # --- gmalmeida/philosopher-quotes (Sagius), English only ---
    try:
        rows = load_jsonl_url("https://raw.githubusercontent.com/gmalmeida/philosopher-quotes/main/data/quotes-en.jsonl")
        kept = process_rows(
            rows,
            get_text=lambda r: r.get("text"),
            get_author=lambda r: r.get("author"),
            get_tags=None,
            key="gh:gmalmeida/philosopher-quotes",
            aliases=aliases,
        )
        save_jsonl(RAW_DIR / "github" / "gmalmeida__philosopher-quotes.jsonl", kept)
        manifest.append({
            "key": "gh:gmalmeida/philosopher-quotes", "name": "gmalmeida/philosopher-quotes (Sagius)",
            "url": "https://github.com/gmalmeida/philosopher-quotes",
            "license": "CC-BY 4.0 (curation/metadata); source texts public domain",
            "rows_read": len(rows), "rows_kept": len(kept),
        })
        print(f"[gh] gmalmeida/philosopher-quotes: read={len(rows)} kept={len(kept)}")
    except Exception as e:  # noqa: BLE001
        eprint(f"[gh] gmalmeida/philosopher-quotes FAILED: {e}")
        manifest.append({"key": "gh:gmalmeida/philosopher-quotes", "name": "gmalmeida/philosopher-quotes (Sagius)",
                          "url": "https://github.com/gmalmeida/philosopher-quotes",
                          "license": "CC-BY 4.0 (curation/metadata); source texts public domain",
                          "rows_read": 0, "rows_kept": 0, "note": f"fetch failed: {e}"})

    save_json(RAW_DIR / "github" / "manifest.json", manifest)
    print("\n== GitHub summary ==")
    for m in manifest:
        print(f"{m['key']:<40} read={m['rows_read']:>7} kept={m['rows_kept']:>6} license={m['license']}")


if __name__ == "__main__":
    main()
