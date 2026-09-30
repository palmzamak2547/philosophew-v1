# Philosophew data brief

Philosophew (philosophew.lol) is a Thai-first philosophy web app: pick a school, pull a quote from a themed
gacha machine, read the quote with a real portrait of the person who said it, keep it as a note, share it.
Audience: Thai readers aged 16 to 35, most with no philosophy background. Everything user-facing is Thai first.

The data is the product. A wrong attribution is a trust bug, the same class as a crash.

## Shared inputs

- `data/roster.json`: the canonical author list. `id` values are permanent (they appear in URLs, saved notes
  and share links). Never rename an id. You may fix a Thai name.
- Schools: `stoic`, `existential`, `eastern`, `absurd`, `socratic`. `schools[0]` is the author's primary school.

## Files

Write files as UTF-8 with raw Thai characters. Never write `\uXXXX` escapes (our editor tooling turns them into
invisible characters). Validate every JSON file you write with `node -e "JSON.parse(require('fs').readFileSync(p,'utf8'))"`.

## Curated school file: `data/curated/<school>.json`

```json
{
  "school": "stoic",
  "authors": {
    "marcus-aurelius": {
      "th": "มาร์คัส ออเรลิอัส",
      "era_th": "จักรพรรดิโรมัน ค.ศ. 121 ถึง 180",
      "bio_th": "one or two plain Thai sentences, what they are known for and why a stressed 20-year-old should care",
      "bio_en": "one or two English sentences",
      "works": ["Meditations"]
    }
  },
  "quotes": [
    {
      "author": "marcus-aurelius",
      "en": "Waste no more time arguing about what a good man should be. Be one.",
      "th": "Thai translation",
      "orig": { "lang": "grc", "text": "optional original-language text when you are sure of it" },
      "source": {
        "work": "Meditations",
        "locator": "Book 10, 16",
        "translator": "George Long (1862) or null",
        "url": "a page where a reader can check it (Wikisource, Gutenberg, Wikiquote)"
      },
      "verify": "primary",
      "tags": ["action", "virtue"],
      "mood": ["stress"]
    }
  ],
  "prompts_th": ["reflection questions in Thai for the note editor, 12 to 20 per school"],
  "misattributed": [
    {
      "author": "plato",
      "en": "Be kind, for everyone you meet is fighting a hard battle.",
      "th": "Thai translation",
      "why_th": "one plain Thai sentence on where it really comes from",
      "real_source": "Ian Maclaren (John Watson), 1897",
      "url": "evidence link"
    }
  ]
}
```

### `verify` levels (be honest, the UI shows them)

- `primary`: you located the words (in translation) in the author's own work and give the work plus locator.
  Ancient texts: cite a public-domain translation and name the translator.
- `sourced`: a reliable secondary source cites it with a work or date (Wikiquote "Sourced"/"Quotes" section
  entry that carries a citation counts).
- `attributed`: widely attributed, no source found, not listed as disputed or misattributed. Use sparingly
  (at most 15% of a school) and only for quotes readers will expect to find.
- Never include anything Wikiquote lists under Disputed, Misattributed or "Quotes about". Those go to
  `misattributed` (the app has a myth-busting section) when they are famous.

### Quote selection

- Target 100 quotes per school (existential and absurd: 100 each), weighted to the big names but every roster
  author in your school gets at least 2 if genuine material exists. Skip an author rather than pad.
- Short enough for a card: English at most about 280 characters. Prefer aphorisms that stand alone.
- Must make sense without context. Must speak to the school's promise (see below).
- No duplicates across schools: a Camus line about Sisyphus, revolt or the absurd goes to `absurd`; a Camus line
  about freedom, choice or meaning goes to `existential`. Never place the same quote in both.
- Copyright: ancient and pre-1929 texts are public domain in public-domain translations. For modern authors
  (Camus, Sartre, Beauvoir, Frankl, Suzuki, Thich Nhat Hanh, Ajahn Chah, Buddhadasa, Watts, Sagan...) use short
  quotations only (one or two sentences) with a citation. Never copy long passages.

### School promises (from the owner)

- `stoic`, ปรัชญาแห่งความมั่นคงทางใจ: control emotions, let go of what you cannot control, handle stress.
  Keywords: discipline, acceptance, reason, strength.
- `existential`, ปรัชญาแห่งเสรีภาพและการสร้างความหมาย: for people searching for themselves, feeling empty, needing
  a push to choose their own path. Keywords: freedom, responsibility, self, meaning of life.
- `eastern` (Tao, Zen, Buddhism), ปรัชญาแห่งความกลมกลืน: mindfulness, slowing down, flowing with nature, less ego.
  Keywords: present moment, emptiness, nature, non-attachment.
- `absurd` (Absurdism and Nihilism), ปรัชญาแห่งการกบฏและเสียงหัวเราะ: tired of society's expectations, want to see
  the world more lightly, facing life's dark jokes. Keywords: rebellion, mocking fate, freedom from rules.
  Humour is welcome here (Diogenes, Vonnegut, Adams, Beckett).
- `socratic` (Socratic and analytical), ปรัชญาแห่งการตั้งคำถาม: logical thinking, not being fooled easily.
  Keywords: truth, logic, questioning, reflection.

### Tags (use only these, 1 to 3 per quote)

control, emotion, anger, fear, death, time, present, change, nature, mind, self, ego, freedom, choice,
responsibility, meaning, suffering, happiness, desire, love, friendship, solitude, virtue, courage, action,
work, failure, hope, absurd, humor, rebellion, society, truth, doubt, reason, knowledge, language, simplicity

### Mood keys (0 to 2 per quote, used by the "how do you feel today" picker)

stress, lost, overwhelmed, tired, confused, heartbroken, anxious, angry, bored, stuck

### Thai translation style (the owner reads every line)

- Plain modern Thai that a 20-year-old reads once and understands. Literary rhythm is good, archaic words are not.
- Translate the meaning, not the English word order. No calques like "มันคือ...ที่...", no chains of ซึ่ง/ที่/โดย.
- Keep it quotable: short clauses, one idea, a turn at the end when the original has one.
- One consistent voice per author (Marcus writing to himself can use เธอ or no pronoun, not เจ้า).
- Never use the middle dot character. No emoji. Thai sentences separate with a space, not a period.
- Proper names in the conventional Thai spelling (use the roster or Thai Wikipedia).
- Buddhist material: use standard Thai Buddhist vocabulary (ทุกข์, อนิจจัง, สติ, ปล่อยวาง) and, where a well-known
  Thai rendering of a Dhammapada verse exists, keep close to it.
- Reflection prompts (`prompts_th`) are Socratic questions that make the reader apply the quote to today,
  e.g. "วันนี้มีเรื่องไหนที่คุณพยายามควบคุม ทั้งที่มันไม่ได้อยู่ในมือคุณ".

## Where to look (fetch with curl, identify yourself with a User-Agent, go gently, one request at a time)

- Wikiquote API, sections with citations:
  `https://en.wikiquote.org/w/api.php?action=parse&page=Marcus_Aurelius&prop=wikitext&format=json&formatversion=2`
- Wikisource and Project Gutenberg for public-domain translations (Long's Meditations, Carter/Long Epictetus,
  Gummere's Seneca letters, Jowett's Plato, Legge's Tao Te Ching and Zhuangzi, Muller's Dhammapada,
  Common's Nietzsche, Garnett's Dostoevsky, Ogden's Tractatus, Hume and Mill in English).
- Thai Buddhist sources for Thai-language originals (Buddhadasa, Ajahn Chah): only with a book or talk named.
- fakebuddhaquotes.com (Bodhipaksa) for Buddha misattributions.
- Set `User-Agent: PhilosophewBot/0.1 (https://philosophew.lol)` on Wikimedia requests. Do not put any email
  address or personal data in headers or URLs.
