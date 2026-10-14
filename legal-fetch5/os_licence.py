"""One-off: find the OS OpenData licence and attribution wording from the OS product page's own links. GET only."""
import re, time, requests
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
UA = 'FamilyPilot-licence-review/1.0 (+https://github.com/aidanshaw92/FamilyPilot)'
H = {'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9'}
def get(u):
    try: return requests.get(u, headers=H, timeout=60)
    except Exception as e:  # noqa: BLE001
        print('ERROR', u, repr(e)); return None
start = ['https://www.ordnancesurvey.co.uk/products/os-open-greenspace', 'https://www.ordnancesurvey.co.uk/products/os-opendata', 'https://osdatahub.os.uk/downloads/open/OpenGreenspace', 'https://osdatahub.os.uk/legal/openDataLicence']
cands = {}
for u in start:
    r = get(u); time.sleep(1.5)
    if r is None: continue
    print('START', r.status_code, r.url, len(r.text))
    soup = BeautifulSoup(r.text, 'lxml')
    for a in soup.select('a[href]'):
        h = urljoin(r.url, a['href']).split('#')[0]
        t = a.get_text(' ', strip=True)
        if re.search(r'licen[cs]e|terms|attribut|copyright|open ?data|third.?party|ogl', t + ' ' + h, re.I) and urlparse(h).netloc.endswith(('os.uk', 'ordnancesurvey.co.uk', 'nationalarchives.gov.uk')):
            cands.setdefault(h, t[:80])
    # also hrefs hidden in script JSON
    for m in re.finditer(r'https?://[^"\\\s<>]+', r.text):
        h = m.group(0).rstrip('.,;)')
        if re.search(r'licen[cs]e|attribut|opendata|open-data|terms', h, re.I) and urlparse(h).netloc.endswith(('os.uk', 'ordnancesurvey.co.uk')):
            cands.setdefault(h, '(in page source)')
print('CANDIDATES', len(cands))
for h, t in list(cands.items())[:60]: print('CAND', t, '->', h)
shown = 0
for h in cands:
    if shown >= 8: break
    if re.search(r'\.(png|jpg|svg|css|js|woff2?)(\?|$)', h): continue
    r = get(h); time.sleep(1.5)
    if r is None or r.status_code != 200: 
        print('SKIP', h, r.status_code if r is not None else None); continue
    soup = BeautifulSoup(r.text, 'lxml')
    for t in soup(['script', 'style', 'nav', 'header', 'footer', 'noscript', 'form', 'svg']): t.decompose()
    lines = [re.sub(r'\s+', ' ', p).strip() for p in (soup.select_one('main') or soup.body or soup).get_text('\n').split('\n')]
    hits = [l for l in lines if re.search(r'attribution|crown copyright|database right|open government licen|OS OpenData|acknowledg', l, re.I)]
    if hits:
        shown += 1
        print(f'\n===== BEGIN {h}\n' + '\n'.join(hits[:40]) + '\n===== END')
print('\nDONE')
