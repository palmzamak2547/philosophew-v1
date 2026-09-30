// scripts/data/portraits-overrides.mjs
//
// Manual overrides for scripts/data/portraits.mjs. Kept in a separate file so
// reruns of the main script stay stable and diffs here are easy to review.
//
// All crop boxes are fractions [0,1] of the RAW downloaded image's width/height,
// as {left, top, width, height}. left+width <= 1 and top+height <= 1.

// Force a specific Wikidata QID when auto search/verification picks wrong or
// is ambiguous. Verified by hand against wikidata.org.
export const QID_OVERRIDE = {
  // Auto-resolution picked Q104712670, an obscure unrelated "ancient Greek
  // historian" also labeled "Chrysippus" with no dates/sitelinks/image, over
  // the real Stoic philosopher because its description happened to contain
  // the substring "author". Verified by hand: Q211411 "Chrysippus of Soli",
  // enwiki sitelink "Chrysippus", dates -281/-208, has a P18 bust photo.
  'chrysippus': 'Q211411',
};

// Hand-verified corrections to born/died/circa when Wikidata's own P569/P570
// data is internally inconsistent or falsely precise for a legendary figure.
// Applied after the normal resolution, overriding only the fields given.
export const METADATA_OVERRIDE = {
  // Wikidata Q2984064 (Lie Yukou / Liezi) stores P569 (born) as -449 and
  // P570 (died) as -500 -- both century-precision guesses, but as recorded
  // death precedes birth. Liezi's historicity is itself disputed by
  // scholars, so rather than invent a specific range we report both as
  // unknown and keep circa=true.
  'liezi': { born: null, died: null, circa: true },
  // Wikidata Q326950 (Linji Yixuan) stores P569 (born) as +850 at
  // century precision (a rough guess) against a precise P570 (died) of 866,
  // implying an implausible 16-year lifespan for the founder of a teaching
  // lineage. Most sources give only the death year. Birth year dropped.
  'linji': { born: null, died: 866, circa: true },
  // Wikidata Q9441 (The Buddha) stores P569 at day precision (-0563-04-08),
  // implying false precision. The item's own description gives two
  // competing traditions 80 years apart ("623 or 563 BCE - 543 or 483
  // BCE"), so this is circa regardless of the raw precision code. With the traditions that far apart no year is
  // shown at all; the curator's era line (data/curated/eastern.json) gives the centuries.
  'the-buddha': { born: null, died: null, circa: true },
  // Ancient years that Wikidata stores as plain years are scholars' estimates (its own description of Chrysippus
  // reads "c.279–c.206 BC"), so they read "about".
  'musonius-rufus': { circa: true },
  'cleanthes': { circa: true },
  'chrysippus': { circa: true },
  'plato': { circa: true },
};

// Force the wbsearchentities query text when the roster "en" name is not a
// good search string (e.g. "The Buddha").
export const SEARCH_TERM_OVERRIDE = {
  'the-buddha': 'Gautama Buddha',
  'diogenes': 'Diogenes of Sinope',
};

// Force a specific Commons file (with "File:" prefix) instead of P18 or the
// auto Commons search/category pick.
export const IMAGE_OVERRIDE = {
  'epictetus': 'File:Epictetus - Henri Bonnart engraving c. 1700.png',
  // P18 was a cropped book title-page detail. This is a proper photo of the
  // Roman marble bust (Ny Carlsberg Glyptotek, Copenhagen), public domain,
  // clean background, already near a 4:5 ratio.
  'cleanthes': 'File:Cleanthes Ny Carlsberg Glyptotek IN 1795.jpg',
  // P18 (File:Socrates Louvre.jpg) is a CC BY-SA 2.5 photo (Eric Gaba) of a public domain bust, and a share-alike
  // face cannot go into og.png, the film or posts. Marie-Lan Nguyen released this one into the public domain
  // ({{PD-self}}, 2006): the Vatican bust (Museo Pio-Clementino, Inv. 314), the classic snub-nosed Socrates.
  // Also tried: the Palazzo Massimo bust (PD-self too; a pale wall band across the top of the frame).
  'socrates': 'File:Socrates Pio-Clementino Inv314.jpg',
  // No likeness of Musonius survives and no early modern print pictures him (searched 2026-09-29: Commons and
  // Wikidata depicts, the Promptuarium, Thevet, the Nuremberg Chronicle, Boissard, Bellori, Canini, Stanley,
  // Fenelon, the Rijksmuseum, Met, Wellcome, Europeana, the Digitaler Portraitindex and the Virtuelles
  // Kupferstichkabinett; the busts sold online as Musonius are unidentified). So the real artefact instead: a
  // papyrus with his own Discourse 15. Kind "papyrus" (KIND_OVERRIDE), note in NOTE_OVERRIDE.
  'musonius-rufus': 'File:Gaius Musonius Rufus.JPG',
};

// Authors that get portrait.kind = "symbol" and portrait.file = null instead
// of a human image (the app draws its own symbol, e.g. a Dharma wheel).
export const SYMBOL_IDS = new Set([
  'the-buddha',
  // No individually-free-licensed real photograph of Ajahn Chah was found.
  // Even English Wikipedia's own infobox uses a photo of a wax/bronze
  // statue at the Thai Human Imagery Museum (not a photo of the man), and
  // the only real photo on Commons ("AjahnChahSangha.jpg") is a low-res
  // (576x415) group shot. Per instructions, falls back to symbol rather
  // than substituting a statue photo for this specific figure.
  'ajahn-chah',
]);

// Ids where a diligent search (P18, Commons category, Commons full-text
// search, enwiki infobox image) turned up no suitable free depiction of the
// actual person, so no portrait.file is produced. Reported under "no
// suitable free image" rather than silently retried every run.
export const NO_IMAGE = {};

// A note kept with the portrait in data/portraits.json (portrait.note): why an image was chosen or what it is,
// when that is not obvious from the file itself.
export const NOTE_OVERRIDE = {
  'cleanthes': 'The identification is a suggestion: the Commons description says Thuri Lorenz has proposed that this portrait type, earlier taken for Hippocrates, might more correctly be identified as the Stoic Cleanthes (Roman copy of a Greek original of the 3rd century BC, Ny Carlsberg Glyptotek IN 1795). No surer likeness of Cleanthes is known. Photo: Marie-Lan Nguyen, 2017, CC BY 4.0 (the bust itself is public domain).',
  'socrates': 'Photo of the Socrates bust in the Vatican Museums (Museo Pio-Clementino, Inv. 314) by Marie-Lan Nguyen (User:Jastrow), 2006, released by her into the public domain ({{PD-self}}); the bust is a Roman marble, public domain. Replaces File:Socrates Louvre.jpg, whose photo (Eric Gaba, 2005) is CC BY-SA 2.5.',
  'musonius-rufus': 'No likeness of Musonius Rufus survives, and no early modern print pictures him, so the frame shows his own words instead: a column of his Discourse 15 (whether every child born should be raised) on a papyrus roll copied in the 3rd century AD, P.Harr. I 1 (Cadbury Research Library, University of Birmingham; DCLP/Trismegistos 61603, LDAB 2752). It supplies lines 18 to 27 of the discourse, where the older editions break off (Cora Lutz, Musonius Rufus, 1947, note to Discourse 15). The Commons file is a photograph of plate 1 of J. Enoch Powell (ed.), The Rendel Harris Papyri of Woodbrooke College, Birmingham (Cambridge, 1936): a faithful copy of a flat ancient document, public domain.',
  'paul-tillich': 'Studio portrait of about 1955, photographer not credited, printed without any copyright notice in The Forester 1957, the yearbook "Published by the Students of Lake Forest College" (Lake Forest, Illinois), p. 44, captioned "Dr. Paul J. Tillich, prominent theologian gave Bross Foundation lectures" (Internet Archive item forester1957lake, page n47; no notice anywhere in the volume). The same photograph had been printed in The Chaplain, vol. 13 no. 2, April 1956, p. 11 (General Commission on Chaplains and Armed Forces Personnel, Washington, D.C.) under that issue\'s notice, and that copyright was never renewed: renewal was due in 1984, and the US Copyright Office public records (https://publicrecords.copyright.gov, every renewal since 1978) list no renewal by the General Commission, none for any photograph of Tillich, and none for Kegley and Bretall\'s The Theology of Paul Tillich (1952), the one earlier book that may have carried it (searched 2026-09-29). Public domain in the US. Replaces File:Tillich Park Bust.jpg, a photo of James Rosati\'s 1967 bronze bust, which is still in copyright.',
};

// Images that are not on Wikimedia Commons (for example one page of a digitized magazine), downloaded from `url`,
// with the licence and the evidence for it written out by hand: { url, title, artist, license, license_url,
// attribution_required, source_page }. Takes precedence over IMAGE_OVERRIDE and P18.
export const SOURCE_OVERRIDE = {
  // Commons has only photos of the 1967 Rosati bust (in copyright) and of his grave. This portrait is not on Commons;
  // the page image is the Internet Archive scan of the 1957 Lake Forest College yearbook (2236 x 3074), a finer
  // halftone than The Chaplain's 1956 printing of the same photo (archive.org chaplain132gene, page n16).
  // Evidence: NOTE_OVERRIDE.
  'paul-tillich': {
    url: 'https://archive.org/download/forester1957lake/page/n47.jpg',
    title: 'The Forester 1957 (Lake Forest College yearbook), p. 44',
    artist: 'The Forester, Lake Forest College, 1957',
    license: 'Public domain',
    license_url: null,
    attribution_required: false,
    source_page: 'https://archive.org/details/forester1957lake/page/n47/mode/1up',
  },
};

// The credit shown with the image, when the file's own author field is no use (for a photo of a sculpture it
// names the ancient sculptor, not the photographer).
export const ARTIST_OVERRIDE = {
  // The Commons page gives the author as "s. o." ("see above"): the plate of Powell's 1936 edition.
  'musonius-rufus': 'The Rendel Harris Papyri, 1936',
  'socrates': 'Marie-Lan Nguyen', // the photographer, who released the photo into the public domain
  'cleanthes': 'Marie-Lan Nguyen',
};

// The photo's own licence, where Commons' LicenseShortName reports the first template on the page, which for a
// photo of a sculpture is often the sculpture's public domain tag. Read the photo licence on the file page itself.
export const LICENSE_OVERRIDE = {
  // Art Photo template: artwork license {{PD-old-100-1923}}, photo license {{self|Cc-by-4.0}} (Marie-Lan Nguyen).
  'cleanthes': { license: 'CC BY 4.0', license_url: 'https://creativecommons.org/licenses/by/4.0', attribution_required: true },
};

// Gaussian blur (sigma, in raw pixels) applied to the crop before scaling, for halftone prints.
export const DESCREEN = {
  'paul-tillich': 1.6, // a 45 degree screen with a 3.3 px period in this scan (measured); 1.6 melts it, the face stays sharp
};

// Manual classification of the chosen image. If unset, the script guesses
// from era (pre-1839 death => "painting"; later => "photo") but every id
// should get a confirmed entry here after visual review. Convention used
// throughout: "engraving" = Western copperplate print (visible cross-hatch);
// "painting" also covers pencil/chalk sketches and East Asian ink paintings,
// since the schema has no separate "drawing" bucket.
export const KIND_OVERRIDE = {
  // Ancient bust photographs (era-guess would say "painting" -- wrong).
  'marcus-aurelius': 'bust',
  'seneca': 'bust',
  'epictetus': 'engraving',
  'zeno-of-citium': 'bust',
  'cleanthes': 'bust',
  'chrysippus': 'bust',
  'cicero': 'bust',
  'socrates': 'bust',
  'plato': 'bust',
  'aristotle': 'bust',
  'diogenes': 'statue',
  // A papyrus with his words, not a likeness (none survives): see IMAGE_OVERRIDE.
  'musonius-rufus': 'papyrus',
  // Engraved prints, not paintings.
  'blaise-pascal': 'engraving',
  // Sketches/drawings, not photographs (era-guess would say "photo").
  'soren-kierkegaard': 'painting',
  'max-stirner': 'painting',
  // An actual painting (Vasily Perov, 1872), not a photograph.
  'fyodor-dostoevsky': 'painting',
  // A studio portrait of about 1955, printed in a magazine (SOURCE_OVERRIDE).
  'paul-tillich': 'photo',
  // Modern statue (Samye Ling Monastery), not a classical bust or painting.
  'nagarjuna': 'statue',
};

// Manual crop boxes (fractions of the raw source image), filled in after
// looking at the default "attention" crop output and finding it cuts a face
// or leaves it too small/off-center.
export const CROP_OVERRIDES = {
  // Auto attention-crop cut off the top of his head, keeping the coat
  // buttons instead. Source is a tall 940x1640 portrait; keep the top.
  'immanuel-kant': { left: 0, top: 0, width: 1, height: 0.68 },
  // Face was small and off-center against a shopfront/flowers background.
  'jean-paul-sartre': { left: 0.20, top: 0.05, width: 0.60, height: 0.75 },
  // Full statue-with-dog shot; zoom to the head instead of the whole figure.
  'diogenes': { left: 0.1, top: 0.0, width: 0.8, height: 0.5 },
  // Auto attention-crop missed the subject entirely (landscape 600x386,
  // face is in the right half).
  'douglas-adams': { left: 0.38, top: 0.0, width: 0.62, height: 1.0 },
  // Full sheet scan; the actual sketch (seated figure) is lower-left, most
  // of the frame is blank paper and unrelated calligraphy. Tightened a
  // second time -- first attempt still left too much blank paper.
  'ryokan': { left: 0.05, top: 0.38, width: 0.45, height: 0.42 },
  // Statue-plus-reflection-pool photo; crop out most of the reflection.
  'nagarjuna': { left: 0.05, top: 0.0, width: 0.9, height: 0.62 },
  // Portrait figure is in the left ~85%; a calligraphy panel sits above it
  // (top ~19%), not beside it. First attempt cropped from top=0 and ended
  // up cutting into the chin. Source is tall and narrow (576x1050).
  'dogen': { left: 0.0, top: 0.18, width: 0.85, height: 0.50 },
  // Wide outdoor scene with the monk small in the upper-left against a
  // tree trunk; zoom to head and shoulders.
  'buddhadasa': { left: 0.0, top: 0.0, width: 0.68, height: 0.52 },
  // Full standing figure painting; crop to head and upper body.
  'zhuangzi': { left: 0.1, top: 0.0, width: 0.8, height: 0.55 },
  // Windswept full-figure painting (landscape 1920x1026). First attempt
  // (left half) was wrong -- that side is only wind-blown pine branches;
  // the figure and face are in the right half, around x 50-78%.
  'liezi': { left: 0.49, top: 0.0, width: 0.32, height: 0.55 },
  // Night scene print with lots of moon/sky and foliage; tighten to the
  // hooded head and shoulders.
  'bodhidharma': { left: 0.05, top: 0.15, width: 0.85, height: 0.55 },
  // Lecturing-at-a-blackboard photo (landscape 576x432); crop to him,
  // away from the blackboard text.
  'thomas-nagel': { left: 0.0, top: 0.0, width: 0.55, height: 1.0 },
  // Raised hands mid-gesture took up much of the lower frame; trim it.
  'richard-feynman': { left: 0.0, top: 0.0, width: 1.0, height: 0.85 },
  // Full scan sheet includes blank side margins and a Tibetan caption strip
  // below the illustration; crop to just the figure.
  'shantideva': { left: 0.13, top: 0.03, width: 0.74, height: 0.65 },
  // 1300 x 1740: full width, the whole head with the shoulders below it (the attention crop cut the crown).
  'socrates': { left: 0, top: 0.02, width: 1, height: 0.934 },
  // One tall papyrus column (1332 x 2244): the upper two thirds, where the lines are whole (the swallows,
  // nightingales, larks and blackbirds that raise their young, then Homer), cut to 4:5 inside the ragged edges.
  'musonius-rufus': { left: 0.04, top: 0.01, width: 0.9, height: 0.668 },
  // A whole yearbook page (2236 x 3074); the printed photo sits top left (x 204 to 1142, y 218 to about 1500).
  // A 4:5 box inside it: head and shoulders, the face as large as on the other portraits.
  'paul-tillich': { left: 0.1342, top: 0.0852, width: 0.3578, height: 0.3253 },
};
