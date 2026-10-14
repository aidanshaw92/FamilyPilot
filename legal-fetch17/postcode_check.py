"""One-off: how far is each candidate's published FHRS position from the centre of its own postcode (postcodes.io, ONS data under the OGL)? GET only, one request each."""
import json, math, time, requests
UA = 'FamilyPilot-open-data/1.0 (+https://github.com/aidanshaw92/FamilyPilot)'
def km(a, b, c, d):
    r = lambda x: x * math.pi / 180
    h = math.sin(r(c - a) / 2) ** 2 + math.cos(r(a)) * math.cos(r(c)) * math.sin(r(d - b) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))
out = []
for it in json.load(open('legal-fetch17/input.json')):
    pc = it['postcode'].replace(' ', '')
    r = requests.get(f'https://api.postcodes.io/postcodes/{pc}', headers={'User-Agent': UA}, timeout=30)
    row = dict(it)
    if r.status_code == 200:
        d = r.json()['result']
        row.update(postcodeLat=d['latitude'], postcodeLng=d['longitude'], metres=round(km(it['lat'], it['lng'], d['latitude'], d['longitude']) * 1000), district=d.get('admin_district'))
    else:
        row.update(error=r.status_code)
    print('RESULT', json.dumps(row)); out.append(row); time.sleep(0.5)
import os
os.makedirs('results/softplay', exist_ok=True)
json.dump(out, open('results/softplay/postcode-check.json', 'w'), indent=1)
print('DONE')
