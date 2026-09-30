"""Main assembly pipeline for the Philosophew quote library.

Reads every raw source under data/library/raw/ (Wikiquote, fakebuddhaquotes,
HF datasets, GitHub datasets), cleans, deduplicates per author, verification-
labels against the Wikiquote backbone, and writes:
  - public/data/library/<authorId>.json
  - public/data/library/index.json
  - data/library/misattributed.json

Run fetch_wikiquote.py, fetch_fakebuddha.py, fetch_hf.py and fetch_github.py
first (see README.md).
"""
from __future__ import annotations

import json
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import (  # noqa: E402
    ROOT, RAW_DIR, PUBLIC_LIBRARY_DIR, DATA_LIBRARY_DIR,
    load_json, save_json, load_jsonl,
    clean_quote_text, clean_citation, is_near_duplicate, is_fuzzy_match, norm_match_text, eprint,
)

SCRIPT_DIR = Path(__file__).resolve().parent

# Thresholds. Asymmetric on purpose: missing a "sourced" upgrade just leaves a
# quote as "attributed" (safe); missing a misattribution ships a bad quote
# (unsafe) -- so the misattributed/disputed match is more permissive than the
# sourced-upgrade match.
SOURCED_MATCH_THRESHOLD = 0.68
MISATTR_MATCH_THRESHOLD = 0.55
FAKEBUDDHA_MATCH_THRESHOLD = 0.6
DEDUP_THRESHOLD = 0.8


def save_json_compact(path: Path, obj) -> int:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    return path.stat().st_size


def better_text(a: str, b: str) -> bool:
    """True if `a` should replace `b` as the canonical (best-formatted) text."""
    a_end = a.endswith((".", "!", "?", '"', "”", "'"))
    b_end = b.endswith((".", "!", "?", '"', "”", "'"))
    if a_end != b_end:
        return a_end
    a_start = a[:1].isupper() if a else False
    b_start = b[:1].isupper() if b else False
    if a_start != b_start:
        return a_start
    return len(a) > len(b)


def load_candidates(author_ids: set[str]) -> tuple[dict[str, list[dict]], dict]:
    candidates: dict[str, list[dict]] = defaultdict(list)
    src_read_kept = defaultdict(lambda: {"read": 0, "kept": 0})  # not final rows_kept, just staging

    for sub in ("hf", "github"):
        d = RAW_DIR / sub
        if not d.exists():
            continue
        for jf in sorted(d.glob("*.jsonl")):
            for row in load_jsonl(jf):
                aid = row.get("author")
                if aid not in author_ids:
                    continue
                candidates[aid].append({"text": row["text"], "source_key": row["source_key"], "citation": None})

    return candidates, src_read_kept


def load_wikiquote(author_ids: list[str]) -> tuple[dict, int, int, int]:
    wq_dir = RAW_DIR / "wikiquote"
    wq_data = {}
    main_read = disputed_read = misattr_read = 0
    for aid in author_ids:
        d = load_json(wq_dir / f"{aid}.json", default={"missing": True, "main": [], "disputed": [], "misattributed": []})
        wq_data[aid] = d
        main_read += len(d.get("main", []))
        disputed_read += len(d.get("disputed", []))
        misattr_read += len(d.get("misattributed", []))
    return wq_data, main_read, disputed_read, misattr_read


def _block_key(text: str) -> str:
    """Cheap blocking key so dedup doesn't degrade to O(n^2) on a popular
    author with thousands of candidate rows. Near-duplicates from independent
    scrapes of the *same* popular wording (the actual case this step targets)
    overwhelmingly share their opening words, so bucketing on the first two
    normalized words catches the real-world duplicates cheaply. This can
    under-merge two genuinely different translations of an ancient text that
    happen to open differently -- acceptable (they just both ship as
    distinct, still-honest entries) since the safety-critical checks
    (verification labeling) run independently afterward on every entry."""
    words = norm_match_text(text).split()
    return " ".join(words[:2])


def dedup_author(rows: list[dict]) -> list[dict]:
    accepted: list[dict] = []
    buckets: dict[str, list[int]] = defaultdict(list)
    for r in rows:
        key = _block_key(r["text"])
        merged = False
        for idx in buckets.get(key, ()):
            acc = accepted[idx]
            if is_near_duplicate(r["text"], acc["text"], threshold=DEDUP_THRESHOLD):
                acc["sources"].add(r["source_key"])
                if not acc.get("citation") and r.get("citation"):
                    acc["citation"] = r["citation"]
                if better_text(r["text"], acc["text"]):
                    acc["text"] = r["text"]
                merged = True
                break
        if not merged:
            accepted.append({"text": r["text"], "sources": {r["source_key"]}, "citation": r.get("citation")})
            buckets[key].append(len(accepted) - 1)
    return accepted


def main():
    t_start = time.time()
    roster = load_json(ROOT / "data" / "roster.json")
    author_ids = [a["id"] for a in roster["authors"]]
    author_id_set = set(author_ids)
    author_school0 = {a["id"]: (a.get("schools") or [None])[0] for a in roster["authors"]}

    print("[build] loading candidates from hf/github raw dumps...", flush=True)
    candidates, _ = load_candidates(author_id_set)

    print("[build] loading wikiquote raw dumps...", flush=True)
    wq_data, wq_main_read, wq_disputed_read, wq_misattr_read = load_wikiquote(author_ids)
    for aid in author_ids:
        for e in wq_data[aid].get("main", []):
            candidates[aid].append({"text": e["text"], "source_key": "wikiquote", "citation": e.get("citation")})

    fb = load_json(RAW_DIR / "fakebuddha" / "list.json", default={"fake": [], "fakeish": [], "source_url": ""})
    fb_fake = fb.get("fake", [])
    fb_read = len(fb.get("fake", [])) + len(fb.get("fakeish", []))
    fb_kept = 0

    # --- clean ---
    print("[build] cleaning text...", flush=True)
    clean_read = 0
    clean_dropped = 0
    per_author_clean: dict[str, list[dict]] = defaultdict(list)
    for aid, rows in candidates.items():
        for r in rows:
            clean_read += 1
            ct = clean_quote_text(r["text"])
            if ct is None:
                clean_dropped += 1
                continue
            per_author_clean[aid].append({"text": ct, "source_key": r["source_key"], "citation": r.get("citation")})

    # --- dedup ---
    print("[build] deduplicating per author...", flush=True)
    deduped: dict[str, list[dict]] = {}
    for aid in author_ids:
        n_in = len(per_author_clean.get(aid, []))
        t0 = time.time()
        deduped[aid] = dedup_author(per_author_clean.get(aid, []))
        dt = time.time() - t0
        if n_in > 200 or dt > 1.0:
            print(f"  dedup {aid}: {n_in} -> {len(deduped[aid])} ({dt:.1f}s)", flush=True)
    total_pre_dedup = sum(len(v) for v in per_author_clean.values())
    total_post_dedup = sum(len(v) for v in deduped.values())

    # --- verification labeling ---
    print("[build] verification-labeling against Wikiquote / fakebuddhaquotes...", flush=True)
    library_out: dict[str, list[dict]] = {aid: [] for aid in author_ids}
    misattributed_out: dict[str, list[dict]] = defaultdict(list)
    wq_used = 0  # wikiquote entries actually reflected in an output (sourced or misattributed)

    for aid in author_ids:
        wq_main = wq_data[aid].get("main", [])
        wq_disputed = wq_data[aid].get("disputed", [])
        wq_misattr = wq_data[aid].get("misattributed", [])
        t0 = time.time()

        for entry in deduped[aid]:
            text = entry["text"]
            sources = set(entry["sources"])

            if aid == "the-buddha":
                fake_hit = next((f for f in fb_fake if is_fuzzy_match(text, f, threshold=FAKEBUDDHA_MATCH_THRESHOLD)), None)
                if fake_hit:
                    misattributed_out[aid].append({
                        "t": text, "why": "fakebuddhaquotes",
                        "note": "Listed by fakebuddhaquotes.com as a fake or misattributed Buddha quote.",
                    })
                    fb_kept += 1
                    continue

            dis_hit = next((d for d in wq_disputed if is_fuzzy_match(text, d["text"], threshold=MISATTR_MATCH_THRESHOLD)), None)
            if dis_hit:
                misattributed_out[aid].append({"t": text, "why": "Disputed", "note": dis_hit.get("note")})
                wq_used += 1
                continue

            mis_hit = next((m for m in wq_misattr if is_fuzzy_match(text, m["text"], threshold=MISATTR_MATCH_THRESHOLD)), None)
            if mis_hit:
                misattributed_out[aid].append({"t": text, "why": "Misattributed", "note": mis_hit.get("note")})
                wq_used += 1
                continue

            src_hit = next((s for s in wq_main if is_fuzzy_match(text, s["text"], threshold=SOURCED_MATCH_THRESHOLD)), None)
            if src_hit:
                sources.add("wikiquote")
                citation = clean_citation(entry.get("citation") or src_hit.get("citation"))
                library_out[aid].append({"t": text, "v": "sourced", "c": citation, "s": sorted(sources)})
                wq_used += 1
            else:
                library_out[aid].append({"t": text, "v": "attributed", "c": None, "s": sorted(sources)})

        dt = time.time() - t0
        if len(deduped[aid]) > 200 or dt > 1.0:
            print(f"  verify {aid}: {len(deduped[aid])} candidates ({dt:.1f}s)", flush=True)

    # --- sort: sourced first, then by corroboration count, then alpha ---
    for aid in author_ids:
        library_out[aid].sort(key=lambda e: (0 if e["v"] == "sourced" else 1, -len(e["s"]), e["t"]))

    # --- write public/data/library/<id>.json ---
    print("[build] writing public/data/library/*.json...")
    PUBLIC_LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
    total_size = 0
    author_stats = {}
    for aid in author_ids:
        quotes = library_out[aid]
        size = save_json_compact(PUBLIC_LIBRARY_DIR / f"{aid}.json", {"author": aid, "quotes": quotes})
        total_size += size
        sourced_n = sum(1 for q in quotes if q["v"] == "sourced")
        author_stats[aid] = {"count": len(quotes), "sourced": sourced_n}

    # --- sources manifest for index.json ---
    hf_manifest = load_json(RAW_DIR / "hf" / "manifest.json", default=[])
    gh_manifest = load_json(RAW_DIR / "github" / "manifest.json", default=[])
    sources = []
    sources.append({
        "key": "wikiquote", "name": "English Wikiquote",
        "url": "https://en.wikiquote.org", "license": "CC BY-SA 4.0",
        "rows_read": wq_main_read + wq_disputed_read + wq_misattr_read,
        "rows_kept": wq_used,
    })
    sources.append({
        "key": "fakebuddhaquotes", "name": "Fake Buddha Quotes (Bodhipaksa)",
        "url": "https://fakebuddhaquotes.com/all-fake-buddha-quotes/", "license": "not stated (editorial site)",
        "rows_read": fb_read, "rows_kept": fb_kept,
    })
    for m in hf_manifest:
        sources.append({k: m[k] for k in ("key", "name", "url", "license", "rows_read", "rows_kept")})
    for m in gh_manifest:
        sources.append({k: m[k] for k in ("key", "name", "url", "license", "rows_read", "rows_kept")})

    index = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "total": sum(s["count"] for s in author_stats.values()),
        "authors": author_stats,
        "sources": sources,
    }
    index_size = save_json_compact(PUBLIC_LIBRARY_DIR / "index.json", index)
    total_size += index_size

    # --- misattributed.json (pretty, lives under data/, not public/) ---
    misattributed_clean = {aid: entries for aid, entries in misattributed_out.items() if entries}
    save_json(DATA_LIBRARY_DIR / "misattributed.json", misattributed_clean, indent=2)

    elapsed = time.time() - t_start

    # --- compact console report ---
    print("\n== BUILD SUMMARY ==")
    print(f"candidates read (pre-clean): {clean_read}  dropped-by-clean: {clean_dropped}")
    print(f"post-clean rows: {total_pre_dedup}  post-dedup rows: {total_post_dedup}  "
          f"(merged {total_pre_dedup - total_post_dedup})")
    print(f"wikiquote entries used (sourced+misattributed): {wq_used} / {wq_main_read + wq_disputed_read + wq_misattr_read}")
    print(f"fakebuddha matches: {fb_kept} / {fb_read}")
    print(f"total library quotes: {index['total']}   public/data/library size: {total_size} bytes")
    print(f"elapsed: {elapsed:.1f}s\n")

    print(f"{'author':<24}{'school':<12}{'count':>7}{'sourced':>9}{'attributed':>12}{'misattr':>9}")
    total_sourced = total_attr = total_misattr = 0
    school_totals = defaultdict(lambda: {"count": 0, "sourced": 0, "misattr": 0})
    for aid in author_ids:
        st = author_stats[aid]
        misattr_n = len(misattributed_clean.get(aid, []))
        attr_n = st["count"] - st["sourced"]
        total_sourced += st["sourced"]
        total_attr += attr_n
        total_misattr += misattr_n
        sch = author_school0.get(aid) or "?"
        school_totals[sch]["count"] += st["count"]
        school_totals[sch]["sourced"] += st["sourced"]
        school_totals[sch]["misattr"] += misattr_n
        print(f"{aid:<24}{sch:<12}{st['count']:>7}{st['sourced']:>9}{attr_n:>12}{misattr_n:>9}")

    print(f"\n{'TOTAL':<24}{'':<12}{index['total']:>7}{total_sourced:>9}{total_attr:>12}{total_misattr:>9}")

    print("\n== per-school totals (schools[0]) ==")
    for sch, t in sorted(school_totals.items()):
        print(f"{sch:<14} count={t['count']:>5} sourced={t['sourced']:>5} misattributed={t['misattr']:>4}")

    print("\n== sources ==")
    for s in sources:
        print(f"{s['key']:<45} read={s['rows_read']:>7} kept={s['rows_kept']:>6} license={s['license']}")


if __name__ == "__main__":
    main()
