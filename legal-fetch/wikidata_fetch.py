"""One-off: Wikidata (CC0) items inside Greater London for the classes a family might visit, one bounded query per class, written as JSON.
Items with a dissolution date are excluded. Descriptive User-Agent, one request per class, a pause between them."""
import json, os, sys, time, requests

UA = 'FamilyPilot-licence-review/1.0 (+https://github.com/aidanshaw92/FamilyPilot)'
CLASSES = {
    'museum': 'Q33506', 'art_museum': 'Q207694', 'zoo': 'Q43501', 'aquarium': 'Q2281788', 'park': 'Q22698', 'garden': 'Q1107656',
    'botanical_garden': 'Q167346', 'nature_reserve': 'Q179049', 'tourist_attraction': 'Q570116', 'theme_park': 'Q2416723',
}
QUERY = '''SELECT ?item ?itemLabel ?coord ?website ?links ?classLabel WHERE {{
  ?item wdt:P31 ?class . ?class wdt:P279* wd:{qid} .
  ?item wdt:P131* wd:Q23306 .
  FILTER NOT EXISTS {{ ?item wdt:P576 [] }}
  OPTIONAL {{ ?item wdt:P625 ?coord }}
  OPTIONAL {{ ?item wdt:P856 ?website }}
  OPTIONAL {{ ?item wikibase:sitelinks ?links }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}} LIMIT 6000'''
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
for name, qid in CLASSES.items():
    try:
        r = requests.get('https://query.wikidata.org/sparql', params={'query': QUERY.format(qid=qid), 'format': 'json'},
                         headers={'User-Agent': UA, 'Accept': 'application/sparql-results+json'}, timeout=70)
        n = len(r.json()['results']['bindings']) if r.status_code == 200 else None
        print(f'{name} ({qid}): HTTP {r.status_code}, rows {n}, {len(r.content)} bytes')
        if r.status_code == 200:
            open(os.path.join(out, f'{name}.json'), 'wb').write(r.content)
    except Exception as e:  # noqa: BLE001
        print(f'{name} ({qid}): ERROR {e!r}')
    time.sleep(5)
