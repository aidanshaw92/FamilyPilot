"""One-off (second pass): find and print the OSMF Collective Database guideline and its neighbours. GET only. Prints the guideline index's links first."""
import re, sys, time, requests
from bs4 import BeautifulSoup

UA = 'FamilyPilot-licence-review/1.0 (+https://github.com/aidanshaw92/FamilyPilot)'
H = {'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9'}

def text_of(html):
    soup = BeautifulSoup(html, 'lxml')
    for t in soup(['script', 'style', 'nav', 'header', 'footer', 'noscript', 'form']):
        t.decompose()
    root = soup.find(id='mw-content-text') or soup.find('main') or soup.body
    paras = [re.sub(r'\s+', ' ', p).strip() for p in root.get_text('\n').split('\n')]
    return [p for p in paras if p]

idx = requests.get('https://osmfoundation.org/wiki/Licence/Community_Guidelines', headers=H, timeout=60)
print('INDEX HTTP', idx.status_code, idx.url)
soup = BeautifulSoup(idx.text, 'lxml')
links = []
for a in soup.select('#mw-content-text a[href]'):
    h = a['href']
    if 'Licence' in h or 'Guideline' in h:
        links.append((a.get_text(' ', strip=True), h))
seen = set()
for t, h in links:
    if h in seen: continue
    seen.add(h); print('LINK', t, '->', h)

want = [h for t, h in links if re.search(r'Collective|Trivial|Horizontal|Public_Domain|Substantial|Geocod|Produced', h, re.I)]
want = list(dict.fromkeys(want))
for h in want:
    if re.search(r'Substantial|Geocod|Produced', h, re.I): continue   # already read
    url = h if h.startswith('http') else 'https://osmfoundation.org' + h
    print(f'\n===== BEGIN {url}')
    try:
        r = requests.get(url, headers=H, timeout=60)
        print('HTTP', r.status_code, r.url)
        if r.status_code == 200:
            print('\n'.join(text_of(r.text)))
    except Exception as e:  # noqa: BLE001
        print('ERROR', repr(e))
    print('===== END')
    time.sleep(1.5)
