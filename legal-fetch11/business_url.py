"""One-off: does the FSA's public page for an establishment live at ratings.food.gov.uk/business/<FHRSID>? GET only, three requests."""
import json, requests, time
UA = 'FamilyPilot-open-data/1.0 (+https://github.com/aidanshaw92/FamilyPilot)'
d = json.load(open('results/softplay/fhrs-london.json'))
ids = [r['fhrsId'] for r in d['rows'][:3]]
out = {}
for i in ids:
    for pattern in ('https://ratings.food.gov.uk/business/{}', 'https://ratings.food.gov.uk/business/{}/x'):
        u = pattern.format(i)
        r = requests.get(u, headers={'User-Agent': UA}, timeout=60, allow_redirects=True)
        out[u] = {'status': r.status_code, 'final': r.url, 'title': (r.text.split('<title>')[1].split('</title>')[0].strip()[:120] if '<title>' in r.text else None)}
        print(u, r.status_code, r.url, out[u]['title'])
        time.sleep(1)
    a = requests.get(f'https://api.ratings.food.gov.uk/Establishments/{i}', headers={'User-Agent': UA, 'x-api-version': '2', 'accept': 'application/json'}, timeout=60)
    print('api', i, a.status_code, list(a.json().keys())[:40] if a.status_code == 200 else a.text[:100])
    out['api-' + str(i)] = {'status': a.status_code, 'keys': list(a.json().keys()) if a.status_code == 200 else None}
    time.sleep(1)
json.dump(out, open('results/softplay/fhrs-business-url.json', 'w'), indent=1)
print('DONE')
