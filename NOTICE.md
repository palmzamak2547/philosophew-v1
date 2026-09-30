# Notice

หมายเหตุเรื่องสัญญาอนุญาต: สิ่งที่สัญญาอนุญาต MIT ไม่ครอบคลุม และเงื่อนไขของแต่ละอย่าง

The code in this repository is under the MIT licence in [LICENSE](LICENSE). That licence covers our code and nothing this notice lists: each item below keeps its own terms, and the MIT licence grants no rights in it.

## Fonts

The typefaces are not in this repository. `npm ci` installs them from their Fontsource packages, and a build copies the WOFF2 files it uses into `dist/assets`. Every family is under the SIL Open Font License 1.1 (https://openfontlicense.org), whose text, with the family's copyright line, ships in the package's own `LICENSE` file (`node_modules/<package>/LICENSE`).

| Family | Package | Copyright |
| --- | --- | --- |
| Fraunces | `@fontsource-variable/fraunces` | The Fraunces Project Authors |
| Bricolage Grotesque | `@fontsource-variable/bricolage-grotesque` | The Bricolage Grotesque Project Authors |
| Anuphan | `@fontsource-variable/anuphan` | The Anuphan Project Authors |
| Noto Serif Thai | `@fontsource-variable/noto-serif-thai` | The Noto Project Authors |
| Noto Serif (letters the others lack) | `@fontsource-variable/noto-serif` | The Noto Project Authors |
| Noto Sans (letters the others lack) | `@fontsource-variable/noto-sans` | The Noto Project Authors |
| Trirong | `@fontsource/trirong` | Cadson Demak |
| Sriracha | `@fontsource/sriracha` | Cadson Demak; Pablo Impallari |

## Portraits

`public/portraits/` holds 65 images, each as a picture and a thumbnail, for 65 of the 67 thinkers; the Buddha and Ajahn Chah are shown as a Dharma wheel that our code draws. Every image keeps its own licence and credit, recorded in [`data/portraits.json`](data/portraits.json) under `portrait`: `license`, `license_url`, `artist`, `title` and `source_page` (the Wikimedia Commons file page, or the Internet Archive scan for Paul Tillich). The app prints the credit with the portrait and lists every one on its About page. Our files are resized, cropped and re-encoded as WebP from those originals, and a few magazine halftones are blurred to hide the print screen: they are changed copies, not the originals.

| Licence, as recorded | Images | Thinkers |
| --- | --- | --- |
| Public domain | 45 | the other 44, and the papyrus shown for Musonius Rufus |
| CC BY-SA 3.0 | 7 | Seneca, Richard Feynman, Martin Heidegger, Simone de Beauvoir, Eugène Ionesco, Thomas Nagel, Buddhadasa Bhikkhu |
| CC BY-SA 4.0 | 3 | Zeno of Citium, Cicero, Blaise Pascal |
| CC BY 2.5 | 2 | Marcus Aurelius, Plato |
| CC BY 3.0 | 2 | Jean-Paul Sartre, Diogenes of Sinope |
| CC BY-SA 2.0 | 2 | Douglas Adams, Thích Nhất Hạnh |
| CC BY 4.0 | 1 | Cleanthes |
| CC BY-SA 3.0 de | 1 | Viktor Frankl |
| Copyrighted free use | 1 | Nagarjuna |
| No restrictions | 1 | Karl Popper |

- "Public domain" is the status Wikimedia Commons records. For some photographs it holds in the United States only (Paul Tillich's, for one).
- A CC BY or CC BY-SA image carries its credit wherever it is shown, and a CC BY-SA image stays CC BY-SA in any adaptation (a tinted or cropped copy is one).
- "No restrictions" is the Flickr Commons statement that no copyright restriction is known; "Copyrighted free use" is the Commons term for an image whose holder lets anyone use it for any purpose.

## The quote library

`public/data/library/` is the library the app searches: a file per thinker, each line with the sources that carry it (`s`), and `index.json`, which names every source and the licence it states. `data/library/misattributed.json` lists the lines those sources flag as misattributed. `scripts/data/library/` fetches and builds them again.

The words of a quotation are its author's, or its translator's; many are still in copyright and appear here as short quotations with their source. The collecting, cleaning and labelling come from these sources:

| Source | Terms | Lines here |
| --- | --- | --- |
| [English Wikiquote](https://en.wikiquote.org) | CC BY-SA 4.0 | 6,528, and 85 lines in misattributed.json |
| [fakebuddhaquotes.com](https://fakebuddhaquotes.com/all-fake-buddha-quotes/) | not stated | none: it only marks 65 lines in misattributed.json |
| [jstet/quotes-500k](https://huggingface.co/datasets/jstet/quotes-500k) | none stated | 1,620 (only lines an open source also carries) |
| [Abirate/english_quotes](https://huggingface.co/datasets/Abirate/english_quotes) | none stated | 58 (only lines an open source also carries) |
| [datastax/philosopher-quotes](https://huggingface.co/datasets/datastax/philosopher-quotes) | CC BY-NC-SA 4.0, non-commercial (its card says "cc"; its quotes come from a Kaggle set under that licence) | 68 (only lines an open source also carries) |
| [m-ric/english_historical_quotes](https://huggingface.co/datasets/m-ric/english_historical_quotes) | MIT | 1,122 |
| [c2p-cmd/Famous_Quotes](https://huggingface.co/datasets/c2p-cmd/Famous_Quotes) | MIT | 82 |
| [quotable-io/data](https://github.com/quotable-io/data) | MIT (its package.json) | 299 |
| [JamesFT/Database-Quotes-JSON](https://github.com/JamesFT/Database-Quotes-JSON) | none stated | 135 (only lines an open source also carries) |
| [gmalmeida/philosopher-quotes (Sagius)](https://github.com/gmalmeida/philosopher-quotes) | CC BY 4.0 (the curation; the texts are public domain) | 1,033 |

In this repository the library keeps the 8,578 of the site's 14,397 lines that at least one openly licensed source above carries. The other 5,819 come only from sources whose terms are not open enough to pass on (none stated, or non-commercial only); `scripts/data/library/` fetches them again for a copy of your own, on those sources' terms.

As far as they carry Wikiquote's text, `public/data/library/*.json` and `data/library/misattributed.json` adapt English Wikiquote and are under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/); credit: English Wikiquote contributors, each thinker's page at https://en.wikiquote.org. Lines from the Sagius set are credited "Philosopher Quotes (Sagius), gmalmeida, CC BY 4.0" (https://github.com/gmalmeida/philosopher-quotes).

m-ric/english_historical_quotes and c2p-cmd/Famous_Quotes (each Copyright (c) its authors) and quotable-io/data (Copyright (c) Luke Peavey) are under the MIT licence, whose notice follows:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## The curated quotes

`data/curated/<school>.json` holds the 528 cards (built into `public/data/quotes/`, with `authors.json`, `prompts.json` and `myths.json`). Each quotation is short and carries its author, work, locator, translator and a link where it can be checked. Its words belong to its author, and an English translation to its translator: many are public domain (George Long, Benjamin Jowett, James Legge, F. Max Müller and others) or CC0 (Bhikkhu Sujato), and some are still in copyright (Justin O'Brien's translations of Camus, for one). The originals under `orig` belong to their authors as well, and 12 lines are the Thai words of Buddhadasa Bhikkhu and Ajahn Chah, quoted from their published talks. None of this is ours to license, and no licence here covers it.

## Our own writing

The Thai translations of the quotations (`th`, except the Thai originals above), the thinkers' short lives (`bio_th` and `bio_en`, built as `bio` and `bioEn`), the reflection prompts (`prompts_th`) and the notes on misattributed quotes (`th`, `why_th`), in `data/` and `public/data/`, are the project's own writing. They are released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/): credit "Philosophew" with a link to https://philosophew.lol.

## The name and the mark

The name Philosophew, the address philosophew.lol, the wordmark and the mark (a quotation mark made of two falling capsules) identify the site. No licence here grants any right to them, whether as a file or as the code that draws the mark (`mark` in `src/ui/icons.ts`, and `scripts/brand.mjs`): a copy that others use must take a name, a mark and an address of its own, and must not present itself as Philosophew.

The files that carry them are here to describe this project, not for reuse: `public/favicon.svg`, `public/icons/`, the share cards (`public/og.png`, `public/og/`), the mail art (`public/email/`) and the README's pictures (`docs/readme/`). The faces on them are public domain, or CC BY and credited on the card.
