"""One-off: does the FSA's per-establishment record address answer? Three GET requests."""
import json, requests, time
UA = 'FamilyPilot-open-data/1.0 (+https://github.com/aidanshaw92/FamilyPilot)'
d = json.load(open('results/softplay/fhrs-london.json'))
out = {}
for r in d['rows'][:3]:
    i = r['fhrsId']
    u = f'https://ratings.food.gov.uk/api/download-data/xml/establishments/{i}'
    x = requests.get(u, headers={'User-Agent': UA}, timeout=60)
    body = x.text
    out[u] = {'status': x.status_code, 'contentType': x.headers.get('content-type'), 'hasFHRSID': f'<FHRSID>{i}</FHRSID>' in body, 'hasBusinessName': r['name'] in body, 'length': len(body)}
    print(u, out[u]); time.sleep(1)
json.dump(out, open('results/softplay/fhrs-record-url.json', 'w'), indent=1)
print('DONE')
