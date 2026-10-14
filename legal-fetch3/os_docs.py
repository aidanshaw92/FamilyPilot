"""One-off: the OS Open Greenspace documentation and the OS OpenData licence wording. GET only."""
import re, time, requests
from urllib.parse import urljoin
from bs4 import BeautifulSoup
UA = 'FamilyPilot-licence-review/1.0 (+https://github.com/aidanshaw92/FamilyPilot)'
H = {'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9'}

def lines_of(html):
    soup = BeautifulSoup(html, 'lxml')
    for t in soup(['script', 'style', 'nav', 'header', 'footer', 'noscript', 'form', 'svg']):
        t.decompose()
    root = soup.select_one('main') or soup.select_one('article') or soup.body or soup
    out = [re.sub(r'\s+', ' ', p).strip() for p in root.get_text('\n').split('\n')]
    return [p for p in out if p], soup

def show(url, limit=400, links=False):
    print(f'\n===== BEGIN {url}', flush=True)
    try:
        r = requests.get(url, headers=H, timeout=60)
    except Exception as e:  # noqa: BLE001
        print('ERROR', repr(e)); print('===== END'); return None
    print('HTTP', r.status_code, r.url, len(r.text), 'bytes')
    soup = None
    if r.status_code == 200:
        ls, soup = lines_of(r.text)
        print('\n'.join(ls[:limit]))
        if links:
            seen = set()
            for a in soup.select('a[href]'):
                t = a.get_text(' ', strip=True); h = urljoin(r.url, a['href'])
                if re.search(r'licen[cs]e|terms|attribut|copyright|open ?data|third.?party|ogl|specification|user.?guide|getting.?started', t + ' ' + h, re.I) and h not in seen:
                    seen.add(h); print('LINK', t[:100], '->', h)
    print('===== END', flush=True)
    time.sleep(1.5)
    return (r, soup) if soup else None

res = show('https://docs.os.uk/os-downloads/products/land-and-terrain-portfolio/os-open-greenspace', links=True)
for u in ['https://docs.os.uk/os-downloads/products/land-and-terrain-portfolio/os-open-greenspace/overview',
          'https://docs.os.uk/os-downloads/products/land-and-terrain-portfolio/os-open-greenspace/technical-specification',
          'https://docs.os.uk/os-downloads/products/land-and-terrain-portfolio/os-open-greenspace/technical-specification/data-structure',
          'https://docs.os.uk/licensing/os-opendata-licence',
          'https://www.ordnancesurvey.co.uk/business-government/licences/open-data',
          'https://www.ordnancesurvey.co.uk/business-government/licensing/using-creating-data-with-os-products/os-opendata']:
    show(u, limit=250, links=True)
# metadata the download API publishes for the product (version and date), headers only
try:
    r = requests.get('https://api.os.uk/downloads/v1/products/OpenGreenspace', headers=H, timeout=60)
    print('\nAPI', r.status_code, r.text[:1500])
except Exception as e:  # noqa: BLE001
    print('API ERROR', repr(e))
print('\nDONE')
