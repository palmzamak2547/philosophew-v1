# Step 1 of 2 for public/data/thai-words.json: every word a Thai dictionary (PyThaiNLP newmm, ~62k words) finds
# in the app's Thai text. Step 2 (scripts/thai-words.mjs) keeps the ones the browser's ICU would split, such as
# เศร้าหมอง -> เศร้า|หมอง, so a line never breaks inside them.
#   python scripts/thai-words.py && node scripts/thai-words.mjs      (needs: pip install pythainlp)
import glob, json, os, re, sys
from pythainlp.tokenize import word_tokenize

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
THAI = re.compile(r'[ก-๛]+')
texts = []

def walk(o):
    if isinstance(o, str):
        if THAI.search(o): texts.append(o)
    elif isinstance(o, list):
        for v in o: walk(v)
    elif isinstance(o, dict):
        for v in o.values(): walk(v)

for f in glob.glob(os.path.join(ROOT, 'public', 'data', '*.json')) + glob.glob(os.path.join(ROOT, 'public', 'data', 'quotes', '*.json')):
    walk(json.load(open(f, encoding='utf-8')))
for f in glob.glob(os.path.join(ROOT, 'src', '**', '*.ts'), recursive=True):
    texts += re.findall(r"'([^'\n]*[ก-๛][^'\n]*)'|`([^`]*[ก-๛][^`]*)`", open(f, encoding='utf-8').read()) and \
        [a or b for a, b in re.findall(r"'([^'\n]*[ก-๛][^'\n]*)'|`([^`]*[ก-๛][^`]*)`", open(f, encoding='utf-8').read())]

words = set()
for t in texts:
    for run in THAI.findall(t):
        for w in word_tokenize(run, engine='newmm', keep_whitespace=False):
            if len(w) >= 4 and THAI.fullmatch(w):
                words.add(w)
out = os.path.join(ROOT, 'work', 'thai-candidates.json')
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(sorted(words), open(out, 'w', encoding='utf-8'), ensure_ascii=False)
print(f'{len(texts)} Thai texts, {len(words)} dictionary words of 4+ letters -> work/thai-candidates.json')
