"""One-off (third pass): the primary texts the first two passes missed. GET only, a descriptive User-Agent, a pause between requests.
 1. the OSMF Community Guidelines index and the guidelines that bear on a database of venues (Collective Database, Trivial Transformations, Horizontal Layers)
 2. who the OSMF says to ask about the licence (the Licensing Working Group page and the working-groups index, with any mailto links)
 3. Ordnance Survey: the OS Open Greenspace product page (text, licence and attribution wording, links) and the pages it links to about the licence and the data
"""
import re, time, requests
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup

UA = 'FamilyPilot-licence-review/1.0 (+https://github.com/aidanshaw92/FamilyPilot)'
H = {'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9'}

def get(url):
    try:
        r = requests.get(url, headers=H, timeout=60)
        return r
    except Exception as e:  # noqa: BLE001
        print('ERROR', url, repr(e))
        return None

def text_of(html, selectors=('#mw-content-text', 'main', 'article', 'body')):
    soup = BeautifulSoup(html, 'lxml')
    for t in soup(['script', 'style', 'nav', 'header', 'footer', 'noscript', 'form', 'svg']):
        t.decompose()
    root = None
    for s in selectors:
        root = soup.select_one(s)
        if root: break
    root = root or soup
    lines = [re.sub(r'\s+', ' ', p).strip() for p in root.get_text('\n').split('\n')]
    return [p for p in lines if p], soup

def show(url, limit=None, follow_pattern=None):
    print(f'\n===== BEGIN {url}')
    r = get(url)
    if r is None:
        print('===== END'); return None
    print('HTTP', r.status_code, r.url, len(r.text), 'bytes')
    out = None
    if r.status_code == 200:
        lines, soup = text_of(r.text)
        print('\n'.join(lines[:limit] if limit else lines))
        mail = sorted({a['href'] for a in soup.select('a[href^=mailto]')} | set(re.findall(r'[\w.+-]+@[\w-]+\.[\w.-]+', r.text)))
        if mail: print('MAILTO/EMAIL', mail)
        out = (r, soup)
    print('===== END')
    time.sleep(1.5)
    return out

# 1. OSMF guidelines
idx = get('https://osmfoundation.org/wiki/Licence/Community_Guidelines')
print('INDEX HTTP', idx.status_code if idx else None, idx.url if idx else None)
if idx and idx.status_code == 200:
    soup = BeautifulSoup(idx.text, 'lxml')
    links = []
    for a in soup.select('#mw-content-text a[href]'):
        h = a['href']
        if re.search(r'Collective|Trivial|Horizontal|Public_Domain|Alternative|Geocod', h, re.I):
            links.append(urljoin('https://osmfoundation.org', h))
    for u in dict.fromkeys(links):
        if re.search(r'Geocod', u, re.I): continue   # already read
        show(u)

# 2. who to ask
for u in ['https://osmfoundation.org/wiki/Licensing_Working_Group',
          'https://wiki.osmfoundation.org/wiki/Licensing_Working_Group',
          'https://osmfoundation.org/wiki/Working_Groups',
          'https://osmfoundation.org/wiki/Licence']:
    show(u, limit=120)

# 3. Ordnance Survey
res = show('https://www.ordnancesurvey.co.uk/products/os-open-greenspace', limit=250)
if res:
    r, soup = res
    seen = set()
    for a in soup.select('a[href]'):
        t = a.get_text(' ', strip=True)
        h = urljoin(r.url, a['href'])
        if re.search(r'licen[cs]e|terms|attribution|copyright|open ?data|technical|specification|documentation|getting started|user guide|third.?party', t + ' ' + h, re.I) and h not in seen:
            seen.add(h); print('OSLINK', t[:90], '->', h)
    for t, h in [(a.get_text(' ', strip=True), urljoin(r.url, a['href'])) for a in soup.select('a[href]')]:
        pass
for u in ['https://docs.os.uk/os-downloads/greenspace/os-open-greenspace',
          'https://docs.os.uk/os-downloads/greenspace/os-open-greenspace/overview',
          'https://docs.os.uk/os-downloads/greenspace/os-open-greenspace/technical-specification',
          'https://www.ordnancesurvey.co.uk/business-government/licensing-agreements/os-opendata-licence',
          'https://www.ordnancesurvey.co.uk/legal/open-data-licence',
          'https://www.ordnancesurvey.co.uk/documents/licensing/os-opendata-licence.pdf']:
    show(u, limit=200)
print('\nDONE')
