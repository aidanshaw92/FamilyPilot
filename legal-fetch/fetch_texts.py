"""One-off: print the primary texts the licensing review needs. GET only. The full text for short licence pages; for long terms, only the
paragraphs that mention the words the review turns on, each with the paragraph either side. Nothing is written anywhere but the job log."""
import re, sys, time, requests
from bs4 import BeautifulSoup

UA = 'FamilyPilot-licence-review/1.0 (+https://github.com/aidanshaw92/FamilyPilot)'
FULL = 'full'
PAGES = [
    ('ODbL 1.0, full text', 'https://opendatacommons.org/licenses/odbl/1-0/', FULL),
    ('OSM copyright and licence page', 'https://www.openstreetmap.org/copyright', FULL),
    ('OSMF Collective Database guideline', 'https://wiki.osmfoundation.org/wiki/Licence/Community_Guidelines/Collective_Database_-_Guideline', FULL),
    ('OSMF Substantial guideline', 'https://wiki.osmfoundation.org/wiki/Licence/Community_Guidelines/Substantial_-_Guideline', FULL),
    ('OSMF Produced Work guideline', 'https://wiki.osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline', FULL),
    ('OSMF Geocoding guideline', 'https://wiki.osmfoundation.org/wiki/Licence/Community_Guidelines/Geocoding_-_Guideline', FULL),
    ('OSMF Attribution guidelines', 'https://wiki.osmfoundation.org/wiki/Licence/Attribution_Guidelines', FULL),
    ('OSMF Licence and Legal FAQ', 'https://wiki.osmfoundation.org/wiki/Licence_and_Legal_FAQ', r'derivativ|collective|produced work|share.?alike|combin|attribut|geocod|substantial|publicly|internal'),
    ('Wikidata licensing', 'https://www.wikidata.org/wiki/Wikidata:Licensing', FULL),
    ('Open Government Licence v3', 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', FULL),
    ('OS Open Greenspace product page', 'https://www.ordnancesurvey.co.uk/products/os-open-greenspace', r'licen|attribut|crown copyright|open government'),
    ('Google Maps Platform Terms of Service', 'https://cloud.google.com/maps-platform/terms', r'cach|retain|store|non-google|google map|place id|latitude|longitude'),
    ('Google Maps Platform Service Specific Terms', 'https://cloud.google.com/maps-platform/terms/maps-service-terms', r'places|place id|cach|non-google|latitude|longitude'),
    ('Google Places API policies', 'https://developers.google.com/maps/documentation/places/web-service/policies', FULL),
    ('Google Place IDs', 'https://developers.google.com/maps/documentation/places/web-service/place-id', r'stor|cach|refresh|indefinite|obsolete|month'),
]

def text_of(html):
    soup = BeautifulSoup(html, 'lxml')
    for t in soup(['script', 'style', 'nav', 'header', 'footer', 'noscript', 'form']):
        t.decompose()
    root = soup.find('main') or soup.find(id='mw-content-text') or soup.find(id='content') or soup.body
    paras = [re.sub(r'\s+', ' ', p).strip() for p in root.get_text('\n').split('\n')]
    return [p for p in paras if p]

for title, url, mode in PAGES:
    print(f'\n===== BEGIN {title} | {url}')
    try:
        r = requests.get(url, headers={'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9'}, timeout=60)
        print(f'HTTP {r.status_code}, {len(r.text)} bytes, final url {r.url}')
        if r.status_code != 200:
            print('===== END'); continue
        paras = text_of(r.text)
        if mode == FULL:
            print('\n'.join(paras))
        else:
            rx = re.compile(mode, re.I)
            keep = set()
            for i, p in enumerate(paras):
                if rx.search(p):
                    keep.update({i - 1, i, i + 1})
            last = -2
            for i in sorted(k for k in keep if 0 <= k < len(paras)):
                if i != last + 1: print('  [...]')
                print(paras[i]); last = i
    except Exception as e:  # noqa: BLE001
        print('ERROR', repr(e))
    print('===== END')
    time.sleep(1.5)
