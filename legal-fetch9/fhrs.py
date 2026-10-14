"""One-off: which Food Hygiene Rating Scheme establishments inside the London scope have a name that says a play venue. GET only, polite, OGL v3.0 data."""
import json, re, time, math, collections, requests
UA = 'FamilyPilot-open-data/1.0 (+https://github.com/aidanshaw92/FamilyPilot)'
H = {'User-Agent': UA, 'x-api-version': '2', 'accept': 'application/json'}
BASE = 'https://api.ratings.food.gov.uk'
CENTRE = (51.5074, -0.1278)
WORDS = ['soft play', 'play centre', 'play center', 'play cafe', 'play café', 'adventure play', 'play zone', 'playzone', 'kids', 'children', 'toddler', 'jungle', 'monkey', 'bounce', 'ball pit', 'gambado', 'funky', 'tumble', 'kidz', 'playhouse', 'wacky', 'fun house', 'funhouse', 'funtime', 'fun centre', 'little ones', 'tots', 'trampoline', 'jump', 'airhop', 'flip out', 'ninja', 'laser', 'arcade', 'bowl', 'clip n climb', 'clip \'n climb']
def km(a, b, c, d):
    r = lambda x: x * math.pi / 180
    h = math.sin(r(c - a) / 2) ** 2 + math.cos(r(a)) * math.cos(r(c)) * math.sin(r(d - b) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))
found = {}
stats = {}
for w in WORDS:
    n = 0
    for page in range(1, 40):
        r = requests.get(f'{BASE}/Establishments', headers=H, params={'name': w, 'longitude': CENTRE[1], 'latitude': CENTRE[0], 'maxDistanceLimit': 25, 'sortOptionKey': 'distance', 'pageNumber': page, 'pageSize': 200}, timeout=60)
        if r.status_code != 200:
            print('HTTP', r.status_code, w, page, r.text[:100]); break
        es = r.json().get('establishments', [])
        if not es: break
        for e in es:
            g = e.get('geocode') or {}
            try: lat = float(g.get('latitude')); lng = float(g.get('longitude'))
            except (TypeError, ValueError): lat = lng = None
            found.setdefault(e['FHRSID'], {
                'fhrsId': e['FHRSID'], 'name': e.get('BusinessName'), 'type': e.get('BusinessType'), 'typeId': e.get('BusinessTypeID'),
                'address': ', '.join(filter(None, [e.get(k) for k in ('AddressLine1', 'AddressLine2', 'AddressLine3', 'AddressLine4', 'PostCode')])),
                'postcode': e.get('PostCode'), 'lat': lat, 'lng': lng, 'localAuthority': e.get('LocalAuthorityName'), 'queryWords': []})['queryWords'].append(w)
            n += 1
        if len(es) < 200: break
        time.sleep(0.5)
    stats[w] = n
    time.sleep(0.5)
rows = [v for v in found.values() if v['lat'] is not None and km(CENTRE[0], CENTRE[1], v['lat'], v['lng']) <= 40]
print('distinct establishments returned:', len(found), ' inside 40 km:', len(rows))
print('per word:', json.dumps(stats))
print('by business type:', json.dumps(collections.Counter(v['type'] for v in rows).most_common()))
import os
os.makedirs('results/softplay', exist_ok=True)
json.dump({'source': 'Food Standards Agency, Food Hygiene Rating Scheme API', 'licence': 'Open Government Licence v3.0', 'retrievedAt': time.strftime('%Y-%m-%d'), 'words': WORDS, 'rows': rows}, open('results/softplay/fhrs-london.json', 'w'), indent=0)
STRONG = re.compile(r'soft ?play|play ?cent|play ?caf|adventure play|play ?zone|kidz|gambado|ball ?pit|toddler|jungle|monkey|bounce|tumble|trampoline|jump|ninja|airhop|clip', re.I)
print('\n=== names that say a play venue (first 120)')
for v in sorted((r for r in rows if STRONG.search(r['name'] or '')), key=lambda r: r['name'] or '')[:120]:
    print(f"{v['name']} | {v['type']} | {v['postcode']} | {v['localAuthority']}")
print('DONE')
