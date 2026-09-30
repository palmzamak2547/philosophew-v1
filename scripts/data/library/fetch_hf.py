"""Fetch quote datasets from the Hugging Face Hub, filtered to roster authors.

Discovery: calls the Hub search API (per the brief) and logs the results for
transparency, but the actual list of datasets *processed* below is a curated
subset decided after inspecting schemas by hand (see the SKIPPED comment
block) -- some "quotes" datasets on the Hub have no author column, are exact
duplicates of one another, or (mertbozkurt/quotes_philosophers) are one
quote-per-line .txt files with no citation that risk slicing a quote in half
and shipping a fragment under the wrong meaning. Honesty over size: skipped
rather than risk that.

Writes, per dataset, data/library/raw/hf/<slug>.jsonl with rows
  {"author": "<rosterId>", "text": "<raw quote text>", "source_key": "hf:<id>", "raw_author": "<original author string>"}
and data/library/raw/hf/manifest.json: [{"key","name","url","license","rows_read","rows_kept"}]
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import polite_get, save_jsonl, save_json, load_json, RAW_DIR, AliasTable, eprint  # noqa: E402

HF_API = "https://huggingface.co"

DATASETS = [
    {"id": "jstet/quotes-500k", "kind": "parquet"},
    {"id": "Abirate/english_quotes", "kind": "parquet"},
    {"id": "datastax/philosopher-quotes", "kind": "parquet"},
    {"id": "m-ric/english_historical_quotes", "kind": "parquet"},
    {"id": "c2p-cmd/Famous_Quotes", "kind": "parquet"},
    {"id": "geosfero/positivequotation-public-domain-quotes", "kind": "parquet"},
    {"id": "AshBlanc/Quotes-of-Scientists", "kind": "csv", "csv_path": "data.csv"},
]

# Datasets considered via the Hub search API and deliberately NOT processed:
#   ybelkada/english_quotes_copy        - explicit copy of Abirate/english_quotes
#   c2p-cmd/Good-Quotes-Authors         - byte-for-byte duplicate of jstet/quotes-500k (verified: same
#                                          shape, columns and first rows)
#   tengomucho/english_quotes_sanitized,
#   asoria/english-quotes-text,
#   speed/english_quotes_ja             - Abirate/english_quotes derivatives (sanitized/translated forks)
#   salim-ingram/philosophy_quotes      - repo has only .gitattributes + a 23-byte README, no data
#   mertbozkurt/quotes_philosophers     - one-quote-per-line .txt per author, no citations; some
#                                          quotes wrap across lines (verified on Plato.txt), which
#                                          would ship truncated fragments as if they were whole quotes.
#                                          Superseded by cleaner sourced coverage of the same authors.
#   Anne-Charlotte/famous-quotes        - misnamed: it's a Disney-movie-line audio/subtitle dataset,
#                                          not quotes
#   Colby/quotes                        - no author column (GPT-2 style text dump only)
#   AMaACHINE/motivational_quotes, asuender/motivational-quotes, mentriaai/motivational-quotes,
#   didrikSkjelbred/Motivational-Quotes, aldoyh/motivational-english-quotes,
#   HeshamHaroon/arabic-quotes, MaralGPT/persian_quotes, AhmedBou/Arabic_Quotes,
#   AhmedBou/French_quotes, nassimjp/pashto-quotes-dataset, BlackKakapo/quotes-ro,
#   vivatimperial/rus_quotes_data       - generic/anonymous motivational content or non-English;
#                                          out of scope for a roster of named philosophers

QUOTE_COL_CANDIDATES = ["quote", "quotes", "text", "content"]
AUTHOR_COL_CANDIDATES = ["author", "authors", "attribution", "speaker"]
TAG_COL_CANDIDATES = ["tags", "category", "categories"]


def first_parquet_url(struct) -> str | None:
    if isinstance(struct, str):
        return struct
    if isinstance(struct, list):
        return struct[0] if struct else None
    if isinstance(struct, dict):
        for v in struct.values():
            u = first_parquet_url(v)
            if u:
                return u
    return None


def pick_col(columns, candidates) -> str | None:
    lower = {c.lower(): c for c in columns}
    for cand in candidates:
        if cand in lower:
            return lower[cand]
    return None


def get_license(ds_id: str) -> str:
    try:
        r = polite_get(f"{HF_API}/api/datasets/{ds_id}", timeout=20)
        data = r.json()
        card = data.get("cardData") or {}
        lic = card.get("license")
        if isinstance(lic, list):
            lic = ", ".join(lic)
        return lic or "not stated"
    except Exception:  # noqa: BLE001
        return "not stated"


def load_dataset_df(entry: dict) -> pd.DataFrame | None:
    ds_id = entry["id"]
    if entry["kind"] == "parquet":
        r = polite_get(f"{HF_API}/api/datasets/{ds_id}/parquet", timeout=30)
        struct = r.json()
        url = first_parquet_url(struct)
        if not url:
            eprint(f"[hf] {ds_id}: no parquet export, skipping")
            return None
        r2 = polite_get(url, timeout=180)
        return pd.read_parquet(io.BytesIO(r2.content))
    elif entry["kind"] == "csv":
        url = f"{HF_API}/datasets/{ds_id}/resolve/main/{entry['csv_path']}"
        r = polite_get(url, timeout=60)
        return pd.read_csv(io.StringIO(r.text))
    return None


def run_discovery_log():
    """Log the Hub search results the brief asks us to consult, for the record."""
    try:
        r = polite_get(f"{HF_API}/api/datasets?search=quotes&sort=downloads&limit=50", timeout=30)
        results = [{"id": d.get("id"), "downloads": d.get("downloads")} for d in r.json()]
        save_json(RAW_DIR / "hf" / "search_results.json", results)
        print(f"[hf] logged {len(results)} search results to raw/hf/search_results.json")
    except Exception as e:  # noqa: BLE001
        eprint(f"[hf] discovery search failed (non-fatal): {e}")


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    run_discovery_log()

    aliases = AliasTable(Path(__file__).resolve().parent / "aliases.json")
    manifest = []

    for entry in DATASETS:
        ds_id = entry["id"]
        slug = ds_id.replace("/", "__")
        print(f"[hf] fetching {ds_id} ...")
        try:
            df = load_dataset_df(entry)
        except Exception as e:  # noqa: BLE001
            eprint(f"[hf] {ds_id}: FAILED ({e})")
            manifest.append({
                "key": f"hf:{ds_id}", "name": ds_id,
                "url": f"https://huggingface.co/datasets/{ds_id}",
                "license": "unknown", "rows_read": 0, "rows_kept": 0,
                "note": f"fetch failed: {e}",
            })
            continue
        if df is None or df.empty:
            manifest.append({
                "key": f"hf:{ds_id}", "name": ds_id,
                "url": f"https://huggingface.co/datasets/{ds_id}",
                "license": "unknown", "rows_read": 0, "rows_kept": 0,
                "note": "no usable data",
            })
            continue

        quote_col = pick_col(df.columns, QUOTE_COL_CANDIDATES)
        author_col = pick_col(df.columns, AUTHOR_COL_CANDIDATES)
        tag_col = pick_col(df.columns, TAG_COL_CANDIDATES)

        rows_read = len(df)
        if not quote_col or not author_col:
            eprint(f"[hf] {ds_id}: missing quote/author column (cols={list(df.columns)}), skipping")
            manifest.append({
                "key": f"hf:{ds_id}", "name": ds_id,
                "url": f"https://huggingface.co/datasets/{ds_id}",
                "license": get_license(ds_id), "rows_read": rows_read, "rows_kept": 0,
                "note": f"no usable author/quote column (columns: {list(df.columns)})",
            })
            continue

        kept_rows = []
        for _, row in df.iterrows():
            raw_author = row[author_col]
            if not isinstance(raw_author, str):
                continue
            roster_id = aliases.match(raw_author)
            if not roster_id:
                continue
            tagval = ""
            if tag_col is not None:
                tv = row[tag_col]
                if isinstance(tv, str):
                    tagval = tv
                elif hasattr(tv, "__iter__"):
                    try:
                        tagval = " ".join(str(x) for x in tv)
                    except TypeError:
                        tagval = ""
            if "misattributed" in tagval.lower():
                continue  # dataset self-flagged this as a misattribution; do not ship as attributed
            quote_raw = row[quote_col]
            if not isinstance(quote_raw, str) or not quote_raw.strip():
                continue
            if aliases.should_drop_for_keywords(roster_id, quote_raw):
                continue
            kept_rows.append({
                "author": roster_id,
                "text": quote_raw,
                "source_key": f"hf:{ds_id}",
                "raw_author": raw_author,
            })

        out_path = RAW_DIR / "hf" / f"{slug}.jsonl"
        save_jsonl(out_path, kept_rows)
        lic = get_license(ds_id)
        manifest.append({
            "key": f"hf:{ds_id}", "name": ds_id,
            "url": f"https://huggingface.co/datasets/{ds_id}",
            "license": lic, "rows_read": rows_read, "rows_kept": len(kept_rows),
        })
        print(f"[hf] {ds_id}: read={rows_read} kept={len(kept_rows)} license={lic}")

    save_json(RAW_DIR / "hf" / "manifest.json", manifest)
    print("\n== HF summary ==")
    for m in manifest:
        print(f"{m['key']:<55} read={m['rows_read']:>7} kept={m['rows_kept']:>6} license={m['license']}")


if __name__ == "__main__":
    main()
