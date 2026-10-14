"""One-off: record the exact wording of the Food Standards Agency's licence and attribution terms for its open data. GET only, polite."""
import json, re, time, html, requests
UA = 'FamilyPilot-open-data/1.0 (+https://github.com/aidanshaw92/FamilyPilot)'
H = {'User-Agent': UA, 'accept': 'text/html,application/json'}
URLS = [
    'https://ratings.food.gov.uk/terms-and-conditions',
    'https://ratings.food.gov.uk/open-data',
    'https://ratings.food.gov.uk/open-data-resources/documents',
    'https://www.food.gov.uk/terms-and-conditions',
    'https://www.food.gov.uk/about-us/data-and-policy/open-data-and-fsa-data',
    'https://www.food.gov.uk/business-guidance/the-food-hygiene-rating-scheme-brand-standards',
    'https://api.ratings.food.gov.uk/Help/Api/GET-Establishments',
    'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
]
out = {}
def text(h):
    h = re.sub(r'(?is)<(script|style|noscript|svg).*?</\1>', ' ', h)
    h = re.sub(r'(?s)<[^>]+>', ' ', h)
    return re.sub(r'\s+', ' ', html.unescape(h)).strip()
KEYS = re.compile(r'licen[cs]e|attribut|open government|crown|acknowledg|logo|invalid|inaccurate|current rating|reuse|re-use|brand', re.I)
for u in URLS:
    try:
        r = requests.get(u, headers=H, timeout=60)
        t = text(r.text) if 'html' in r.headers.get('content-type', '') or r.text.lstrip().startswith('<') else r.text
        sents = re.split(r'(?<=[.!?])\s+', t)
        hits = [s for s in sents if KEYS.search(s)]
        out[u] = {'status': r.status_code, 'length': len(t), 'sentences': hits[:60]}
        print('\n=====', u, r.status_code, len(t))
        for s in hits[:60]:
            print(' -', s[:400])
    except Exception as e:
        out[u] = {'error': str(e)}
        print('\n=====', u, 'ERROR', e)
    time.sleep(1)
import os
os.makedirs('results/softplay', exist_ok=True)
json.dump({'retrievedAt': time.strftime('%Y-%m-%d'), 'pages': out}, open('results/softplay/fsa-terms.json', 'w'), indent=1)
print('DONE')
