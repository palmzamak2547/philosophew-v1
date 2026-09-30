"""Fetch and parse the English Wikiquote page for every roster author.

Writes data/library/raw/wikiquote/<authorId>.json:
  { "title": "<resolved page title>", "missing": false,
    "main": [{"text","citation"}], "disputed": [...], "misattributed": [...] }
or {"missing": true} when the author has no Wikiquote page.

Usage: python fetch_wikiquote.py [authorId ...]   (default: all roster authors)
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import ROOT, RAW_DIR, load_json, save_json, eprint  # noqa: E402
from wikiquote import fetch_wikitext, parse_author_wikitext  # noqa: E402


def main():
    roster = load_json(ROOT / "data" / "roster.json")
    aliases = load_json(Path(__file__).resolve().parent / "aliases.json")
    wq_titles = aliases["wikiquote_titles"]

    authors = roster["authors"]
    wanted = set(sys.argv[1:]) or None

    out_dir = RAW_DIR / "wikiquote"
    out_dir.mkdir(parents=True, exist_ok=True)

    summary = []
    for a in authors:
        aid = a["id"]
        if wanted and aid not in wanted:
            continue
        title = wq_titles.get(aid, a["en"])
        try:
            resolved = fetch_wikitext(title)
        except Exception as e:  # noqa: BLE001
            eprint(f"[wikiquote] ERROR fetching {aid} ({title}): {e}")
            summary.append((aid, "ERROR", 0, 0, 0))
            continue

        if resolved is None:
            save_json(out_dir / f"{aid}.json", {"missing": True, "title": title})
            summary.append((aid, "MISSING", 0, 0, 0))
            continue

        resolved_title, wikitext = resolved
        parsed = parse_author_wikitext(wikitext)
        parsed["missing"] = False
        parsed["title"] = resolved_title
        save_json(out_dir / f"{aid}.json", parsed)
        summary.append((aid, "ok", len(parsed["main"]), len(parsed["disputed"]), len(parsed["misattributed"])))

    print(f"{'author':<24}{'status':<10}{'main':>6}{'disputed':>10}{'misattr':>10}")
    for aid, status, m, d, mis in summary:
        print(f"{aid:<24}{status:<10}{m:>6}{d:>10}{mis:>10}")
    total_main = sum(m for _, s, m, d, mis in summary if s == "ok")
    total_disp = sum(d for _, s, m, d, mis in summary if s == "ok")
    total_mis = sum(mis for _, s, m, d, mis in summary if s == "ok")
    n_missing = sum(1 for _, s, *_ in summary if s == "MISSING")
    n_err = sum(1 for _, s, *_ in summary if s == "ERROR")
    print(f"\nTOTAL authors={len(summary)} ok={len(summary)-n_missing-n_err} missing={n_missing} error={n_err} "
          f"main_quotes={total_main} disputed={total_disp} misattributed={total_mis}")


if __name__ == "__main__":
    main()
