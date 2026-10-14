"""One-off (pass 5): OS Open Greenspace overview and technical specification, from the URLs the OS documentation itself links to. GET only."""
import re, time, requests
from urllib.parse import urljoin
from bs4 import BeautifulSoup
UA = 'FamilyPilot-licence-review/1.0 (+https://github.com/aidanshaw92/FamilyPilot)'
H = {'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9'}
BASE = 'https://docs.os.uk/os-downloads/products/land-and-terrain-portfolio/os-open-greenspace/'
def lines_of(html):
    soup = BeautifulSoup(html, 'lxml')
    for t in soup(['script', 'style', 'nav', 'header', 'footer', 'noscript', 'form', 'svg']): t.decompose()
    root = soup.select_one('main') or soup.select_one('article') or soup.body or soup
    out = [re.sub(r'\s+', ' ', p).strip() for p in root.get_text('\n').split('\n')]
    return [p for p in out if p], soup
seen = set()
def show(url, limit=500, follow=False):
    if url in seen: return
    seen.add(url)
    print(f'\n===== BEGIN {url}', flush=True)
    r = requests.get(url, headers=H, timeout=60)
    print('HTTP', r.status_code, r.url, len(r.text), 'bytes')
    soup = None
    if r.status_code == 200:
        ls, soup = lines_of(r.text); print('\n'.join(ls[:limit]))
    print('===== END', flush=True)
    time.sleep(1.5)
    if follow and soup is not None:
        for a in soup.select('a[href]'):
            h = urljoin(r.url, a['href']).split('#')[0]
            if h.startswith(BASE) and h != url and h not in seen and re.search(r'licen|attribut|copyright|specification|overview|data-structure|feature|function|access|source', h, re.I):
                show(h, limit=300)
for name in ['os-open-greenspace-overview', 'os-open-greenspace-technical-specification', 'os-open-greenspace-getting-started-guide']:
    show(BASE + name, follow=(name.endswith('specification')))
print('\nDONE')
