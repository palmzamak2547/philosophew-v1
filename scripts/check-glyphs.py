# Every character the app can show, checked against the self-hosted fonts that will draw it: no letter may fall
# back to a system face mid-line (a lighter, upright ṁ inside a Fraunces italic line, a tofu box on Android).
#   python scripts/check-glyphs.py      (needs fontTools: pip install fonttools brotli)
import glob, json, os, sys
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')

def cover(pattern):
    cps = set()
    for f in glob.glob(os.path.join(ROOT, 'node_modules', pattern)):
        # only the subsets the app ships (fonts.css): latin, latin-ext, thai
        name = os.path.basename(f)
        if not any(k in name for k in ('-latin-', '-latin-ext-', '-thai-', '-vietnamese-', '-greek-', '-greek-ext-', '-cyrillic-', '-cyrillic-ext-')):
            continue
        cps |= set(TTFont(f).getBestCmap().keys())
    return cps

FACES = {
    # each family as shipped in src/styles/fonts.css: its own files plus the Noto faces that fill its gaps
    'Fraunces (quotes, Latin)': cover('@fontsource-variable/fraunces/files/*.woff2') | cover('@fontsource-variable/noto-serif/files/*.woff2'),
    'Bricolage Grotesque (UI, Latin)': cover('@fontsource-variable/bricolage-grotesque/files/*.woff2') | cover('@fontsource-variable/noto-sans/files/*.woff2'),
    'Noto Serif Thai (display, Thai)': cover('@fontsource-variable/noto-serif-thai/files/*.woff2'),
    'Anuphan (UI, Thai)': cover('@fontsource-variable/anuphan/files/*.woff2'),
    'Trirong (quotes, Thai)': cover('@fontsource/trirong/files/*.woff2'),
}
IGNORABLE = {0x2060, 0x200B, 0x200E, 0x200F, 0xFEFF, 0x00A0, 0x0020, 0x000A, 0x0009, 0x000D}
# repaired at display by smart() in src/core/typo.ts: cp1252 controls, PDF ligatures, odd hyphens and bars
DISPLAY_FIXED = {0x85, 0x91, 0x92, 0x93, 0x94, 0x96, 0x97, 0x2010, 0x2011, 0x2015, 0x02D0, 0xFB00, 0xFB01, 0xFB02, 0xFB03, 0xFB04}
# two library lines use a math sign and editorial angle brackets: the system's symbol font draws them, by choice
SYMBOLS_OK = {0x2261, 0x27E8, 0x27E9}

def chars_of(obj, out):
    if isinstance(obj, str): out.update(ord(c) for c in obj)
    elif isinstance(obj, list):
        for v in obj: chars_of(v, out)
    elif isinstance(obj, dict):
        for v in obj.values(): chars_of(v, out)

latin, thai = set(), set()
for f in glob.glob(os.path.join(ROOT, 'public', 'data', '**', '*.json'), recursive=True):
    s = set(); chars_of(json.load(open(f, encoding='utf-8')), s)
    for c in s:
        (thai if 0x0E00 <= c <= 0x0E7F else latin).add(c)
for f in glob.glob(os.path.join(ROOT, 'src', '**', '*.ts'), recursive=True):
    s = set(ord(c) for c in open(f, encoding='utf-8').read())
    for c in s:
        if 0x0E00 <= c <= 0x0E7F: thai.add(c)
        elif c > 0x7E: latin.add(c)
latin -= IGNORABLE | DISPLAY_FIXED | SYMBOLS_OK
bad = 0
# Latin-script text is drawn by Fraunces (quotes) and Bricolage (UI); Thai by Trirong, Noto Serif Thai, Anuphan.
for face, cps in FACES.items():
    need = latin if 'Latin' in face else thai
    missing = sorted(c for c in need if c not in cps and not (0x0E00 <= c <= 0x0E7F and 'Latin' in face))
    # control characters, emoji and CJK (system fonts, by design: far too large to self-host) are not ours to draw
    missing = [c for c in missing if c >= 0x20 and not (0x1F000 <= c <= 0x1FAFF) and not (0x2600 <= c <= 0x27BF)
               and not (0x2E80 <= c <= 0x9FFF) and not (0xF900 <= c <= 0xFAFF) and not (0xFF00 <= c <= 0xFFEF) and not (0x3000 <= c <= 0x30FF)]
    if missing:
        bad += 1
        print(f'{face}: {len(missing)} missing: ' + ' '.join(f'{chr(c)} U+{c:04X}' for c in missing[:60]))
print('glyphs: all covered' if not bad else 'glyphs: gaps listed above')
