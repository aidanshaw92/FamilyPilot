"""One-off: Wikidata (CC0) again, with the Wikipedia-link count (wikibase:sitelinks), the official website and the inception date, so that quality gates can use
them; plus one best-effort query for subclasses of museum. Light queries, long pauses, one retry. A failure of the best-effort query is not an error."""
import json, os, sys, time, requests
UA = 'FamilyPilot-licence-review/1.0 (+https://github.com/aidanshaw92/FamilyPilot)'
BOX = '''SERVICE wikibase:box { ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(-0.71 51.15)"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(0.45 51.87)"^^geo:wktLiteral . }'''
GROUPS = {
    'green': ['Q22698', 'Q22746', 'Q1107656', 'Q167346', 'Q179049', 'Q3185613', 'Q2630741'],
    'visit': ['Q43501', 'Q2281788', 'Q2416723', 'Q194195', 'Q570116', 'Q23413', 'Q16560', 'Q38720'],
    'museum': ['Q33506', 'Q207694', 'Q2977558'],
}
DIRECT = '''SELECT ?item ?itemLabel ?coord ?website ?sitelinks ?inception ?classLabel WHERE {
  VALUES ?class { %s }
  %s
  ?item wdt:P31 ?class .
  FILTER NOT EXISTS { ?item wdt:P576 [] }
  ?item wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL { ?item wdt:P571 ?inception }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 8000'''
SUBMUSEUM = '''SELECT ?item ?itemLabel ?coord ?website ?sitelinks ?classLabel WHERE {
  %s
  ?item wdt:P31 ?class . ?class wdt:P279+ wd:Q33506 .
  FILTER NOT EXISTS { ?item wdt:P576 [] }
  ?item wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?item wdt:P856 ?website }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 4000'''
out = sys.argv[1]; os.makedirs(out, exist_ok=True)

def run(name, query, attempt=1, required=True):
    r = requests.get('https://query.wikidata.org/sparql', params={'query': query, 'format': 'json'},
                     headers={'User-Agent': UA, 'Accept': 'application/sparql-results+json'}, timeout=90)
    n = len(r.json()['results']['bindings']) if r.status_code == 200 else None
    print(f'{name}: attempt {attempt}, HTTP {r.status_code}, rows {n}, {len(r.content)} bytes', flush=True)
    if r.status_code == 200:
        open(os.path.join(out, f'{name}.json'), 'wb').write(r.content); return True
    if attempt == 1 and r.status_code in (429, 500, 502, 503, 504):
        wait = int(r.headers.get('Retry-After', '60')) if r.status_code == 429 else 60
        print(f'  waiting {wait}s, retrying once', flush=True); time.sleep(min(wait, 120))
        return run(name, query, 2, required)
    return False

for name, qids in GROUPS.items():
    try: run(name, DIRECT % (' '.join(f'wd:{c}' for c in qids), BOX))
    except Exception as e: print(f'{name}: ERROR {e!r}', flush=True)
    time.sleep(30)
try: run('museum_subclasses', SUBMUSEUM % BOX, required=False)
except Exception as e: print(f'museum_subclasses: ERROR (best effort) {e!r}', flush=True)
