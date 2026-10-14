"""One-off (second attempt): Wikidata (CC0) items inside the London scope, light queries. The first attempt used transitive class and place closures and was
refused (504, 429). This one uses Wikidata's bounding-box service and a short list of direct classes, one query per group, long pauses, one retry."""
import json, os, sys, time, requests

UA = 'FamilyPilot-licence-review/1.0 (+https://github.com/aidanshaw92/FamilyPilot)'
BOX = '''SERVICE wikibase:box {{ ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(-0.71 51.15)"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(0.45 51.87)"^^geo:wktLiteral . }}'''
GROUPS = {
    # park, urban park, garden, botanical garden, nature reserve, country park, common
    'green': ['Q22698', 'Q22746', 'Q1107656', 'Q167346', 'Q179049', 'Q3185613', 'Q2630741'],
    # zoo, aquarium, theme park, amusement park, tourist attraction, castle, palace, windmill, heritage railway
    'visit': ['Q43501', 'Q2281788', 'Q2416723', 'Q194195', 'Q570116', 'Q23413', 'Q16560', 'Q38720', 'Q55488'],
    # museum, art museum, children's museum
    'museum': ['Q33506', 'Q207694', 'Q2977558'],
}
QUERY = '''SELECT ?item ?itemLabel ?coord ?website ?classLabel WHERE {{
  VALUES ?class {{ {classes} }}
  {box}
  ?item wdt:P31 ?class .
  FILTER NOT EXISTS {{ ?item wdt:P576 [] }}
  OPTIONAL {{ ?item wdt:P856 ?website }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}} LIMIT 8000'''
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
def run(name, qids, attempt=1):
    q = QUERY.format(classes=' '.join(f'wd:{c}' for c in qids), box=BOX.format())
    r = requests.get('https://query.wikidata.org/sparql', params={'query': q, 'format': 'json'},
                     headers={'User-Agent': UA, 'Accept': 'application/sparql-results+json'}, timeout=80)
    n = len(r.json()['results']['bindings']) if r.status_code == 200 else None
    print(f'{name}: attempt {attempt}, HTTP {r.status_code}, rows {n}, {len(r.content)} bytes', flush=True)
    if r.status_code == 200:
        open(os.path.join(out, f'{name}.json'), 'wb').write(r.content)
        return True
    if attempt == 1 and r.status_code in (429, 500, 502, 503, 504):
        wait = int(r.headers.get('Retry-After', '60')) if r.status_code == 429 else 60
        print(f'  waiting {wait}s, retrying once', flush=True)
        time.sleep(min(wait, 120))
        return run(name, qids, 2)
    return False
for name, qids in GROUPS.items():
    try:
        run(name, qids)
    except Exception as e:  # noqa: BLE001
        print(f'{name}: ERROR {e!r}', flush=True)
    time.sleep(30)
