# Philosophew quote library pipeline

Owned by the library agent. Builds `public/data/library/**` (per-author quote files +
`index.json`) and `data/library/misattributed.json` from Wikiquote, fakebuddhaquotes.com,
and a curated set of Hugging Face / GitHub quote datasets, filtered to the philosophers in
`data/roster.json`.

## Requirements

- Python 3.11+ (developed on 3.14), packages: `requests`, `pandas`, `pyarrow` (install with
  `python -m pip install --user pyarrow` if missing -- `requests`/`pandas` are already present
  in this project's environment).
- Network access to `en.wikiquote.org`, `huggingface.co`, `raw.githubusercontent.com`,
  `api.github.com`, `fakebuddhaquotes.com`.
- No API keys needed.

## Rerun end to end

All commands run from `scripts/data/library/`. Order matters only in that `build.py` must run
last; the four `fetch_*.py` scripts are independent of each other and safe to rerun individually
(each one fully overwrites its own output files).

```sh
cd scripts/data/library

python fetch_wikiquote.py        # ~65 authors x 1 request, ~0.3s apart -> ~25-30s.
                                  # Pass author ids as args to refetch just a few, e.g.:
                                  # python fetch_wikiquote.py marcus-aurelius diogenes

python fetch_fakebuddha.py       # one request to fakebuddhaquotes.com.

python fetch_hf.py               # downloads several HF parquet files (jstet/quotes-500k
                                  # alone is ~90MB). A few minutes on a normal connection.

python fetch_github.py           # three JSON/JSONL fetches from raw.githubusercontent.com.

python build.py                  # cleans, dedups, verification-labels, writes the outputs.
                                  # ~2-5 minutes (dominated by the Wikiquote fuzzy-match pass).
```

Then validate every JSON file you touched (per `docs/DATA-BRIEF.md`):

```sh
for f in ../../../public/data/library/*.json ../../../data/library/misattributed.json; do
  node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" && echo "OK $f"
done
```

## Pipeline shape

```
fetch_wikiquote.py  -> data/library/raw/wikiquote/<authorId>.json   (main / disputed / misattributed)
fetch_fakebuddha.py -> data/library/raw/fakebuddha/list.json        (fake / fakeish)
fetch_hf.py          -> data/library/raw/hf/<dataset>.jsonl          (+ manifest.json, search_results.json)
fetch_github.py      -> data/library/raw/github/<dataset>.jsonl      (+ manifest.json)
                                      |
                                      v
build.py: load all of the above -> clean_quote_text() -> dedup per author -> verification-label
          against that author's Wikiquote main/Disputed/Misattributed sections (and
          fakebuddhaquotes for the Buddha) -> write outputs
                                      |
                                      v
public/data/library/<authorId>.json, public/data/library/index.json, data/library/misattributed.json
```

`data/library/raw/**` is gitignored (see `data/library/.gitignore`) -- it is large,
reproducible from this pipeline, and not meant to be committed.

## Files

- `aliases.json` -- author-string -> roster-id alias table (`aliases`), the Wikiquote page
  title to fetch per author (`wikiquote_titles`), and a couple of documented ambiguous-name /
  false-friend notes (`_ambiguous`) plus a keyword drop-list for the one known false friend
  with real yield risk (`drop_keywords.francis-bacon`, to exclude the painter Francis Bacon
  if a "quotes" dataset ever mixes him in with the philosopher of the same name).
- `common.py` -- shared HTTP (Wikimedia-polite, ~300ms apart, `PhilosophewBot/0.1` UA),
  JSON/JSONL IO (always UTF-8, `ensure_ascii=False` -- never `\uXXXX` escapes), the alias
  matcher, `clean_quote_text()` (Processing step 2 in the brief: mojibake repair, curly-quote
  and whitespace normalization, wrapping-quote stripping, URL/length/non-quote drop rules),
  and the near-duplicate/fuzzy-match helpers (word-shingle Jaccard, k=3).
- `wikiquote.py` -- wikitext fetch + a hand-rolled (no external wikitext-parser dependency)
  section/bullet parser. Classifies every level-2 heading as `main` / `disputed` /
  `misattributed` / `skip` (External links, See also, "Quotes about X", ...); walks heading
  levels 3+ to build a best-effort `work, section` citation path for each quote bullet, using
  the immediate `**` sub-bullet as the locator when present. Also splits off a same-bullet
  trailing locator like "p. 32 in the 1992 edition, Beacon Press" when there's no `**`
  sub-bullet, so it lands in the citation instead of polluting the quote text.
- `fetch_wikiquote.py`, `fetch_fakebuddha.py`, `fetch_hf.py`, `fetch_github.py` -- one fetcher
  per source family; each prints a compact per-source summary table (never dumps raw rows).
- `build.py` -- the assembly pipeline described above.

## Design notes / known limitations (read before extending)

- **Verification thresholds are asymmetric on purpose.** Matching a candidate quote against a
  Wikiquote Disputed/Misattributed entry uses a *looser* threshold (0.55 word-shingle Jaccard,
  or substring containment) than matching it against a Sourced entry to earn the "sourced"
  label (0.68). Missing a "sourced" upgrade just leaves a quote labeled "attributed" (safe,
  conservative); missing a misattribution match would ship a bad quote under the main library
  (unsafe). When in doubt, both thresholds lean toward *not* trusting the quote.
- **Dedup uses a blocking key** (first two normalized words) before the near-duplicate check,
  purely so a popular author with thousands of scraped rows finishes in sub-second time instead
  of a quadratic blowup. This can under-merge two genuinely different translations of the same
  ancient line that happen to open with different words -- they will both ship as distinct
  entries rather than being merged into one. That's a completeness nit, not a trust bug: every
  entry still goes through verification labeling independently.
- **`v: "sourced"` does not always carry a locator.** Some Wikiquote bullets have no `**`
  sub-bullet and sit directly under a generic `==Quotes==` heading with no work subsection
  (rare); such a quote is still "sourced" (Wikiquote's own Quotes/Sourced section, as opposed
  to Disputed/Misattributed, is what the label means here), just with `c: null`. Most entries
  do carry a citation built from the heading path and/or sub-bullet.
- **HF/GitHub sources actually processed vs. checked-and-skipped** are documented inline as
  comments in `fetch_hf.py` and `fetch_github.py` (duplicates of each other, empty repos,
  no-author-column datasets, one dataset of one-quote-per-line .txt files with no citations
  that risked shipping a truncated fragment as a whole quote, and non-English quote datasets
  which are out of scope for this English-source pipeline). Every dataset actually fetched is
  in `public/data/library/index.json`'s `sources` list with real rows_read/rows_kept counts,
  including the ones that yielded zero roster-author rows (kept for transparency).
- **Buddha fake-quote check** only runs against fakebuddhaquotes.com's "Fake Quotes" section
  (not its lower-confidence "Fakeish Quotes" section, which is fetched and saved to
  `data/library/raw/fakebuddha/list.json` for the record but deliberately not acted on --
  too uncertain to move a quote out of the main library on its own).
- **Stretch goal ("extra" ring of non-roster philosophers) was not attempted.** Given the time
  budget, we prioritized getting the roster's own 67 authors right (see the final report for
  why: name-matching a Wikidata "occupation: philosopher" list reliably needs disambiguation
  machinery -- birth/death years, at minimum -- that didn't fit alongside the required work).
