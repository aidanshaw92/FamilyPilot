"""One-off: Wikidata (CC0), distinct items under a class and all its subclasses (a local museum is a museum), with Wikipedia-link counts and websites.
Light queries, long pauses, one retry. DISTINCT keeps the result small; the earlier attempt returned one row per class path and hit its row limit."""
import os, sys, time, requests
UA = 'FamilyPilot-licence-review/1.0 (+https://github.com/aidanshaw92/FamilyPilot)'
BOX = '''SERVICE wikibase:box { ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(-0.71 51.15)"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(0.45 51.87)"^^geo:wktLiteral . }'''
Q = '''SELECT DISTINCT ?item ?itemLabel ?coord ?website ?sitelinks WHERE {
  %s
  ?item wdt:P31/wdt:P279* wd:%s .
  FILTER NOT EXISTS { ?item wdt:P576 [] }
  ?item wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?item wdt:P856 ?website }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 6000'''
GROUPS = {'museum_all': 'Q33506', 'zoo_all': 'Q43501', 'farm_all': 'Q131596', 'amusement_all': 'Q194195'}
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
def run(name, q, attempt=1):
    r = requests.get('https://query.wikidata.org/sparql', params={'query': q, 'format': 'json'}, headers={'User-Agent': UA, 'Accept': 'application/sparql-results+json'}, timeout=95)
    n = len(r.json()['results']['bindings']) if r.status_code == 200 else None
    print(f'{name}: attempt {attempt}, HTTP {r.status_code}, rows {n}, {len(r.content)} bytes', flush=True)
    if r.status_code == 200:
        open(os.path.join(out, f'{name}.json'), 'wb').write(r.content); return True
    if attempt == 1 and r.status_code in (429, 500, 502, 503, 504):
        wait = int(r.headers.get('Retry-After', '60')) if r.status_code == 429 else 60
        print(f'  waiting {wait}s, retrying once', flush=True); time.sleep(min(wait, 120))
        return run(name, q, 2)
    return False
for name, qid in GROUPS.items():
    try: run(name, Q % (BOX, qid))
    except Exception as e: print(f'{name}: ERROR (best effort) {e!r}', flush=True)
    time.sleep(30)
