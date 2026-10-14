"""One-off: check every Tranche A candidate against the live OS Open Greenspace download and against Wikidata. GET only."""
import hashlib, json, subprocess, sys, time, glob, os, re, requests

UA = 'FamilyPilot-open-data/1.0 (+https://github.com/aidanshaw92/FamilyPilot)'
H = {'User-Agent': UA}
entries = json.load(open('legal-fetch8/entries.json'))
os_entries = [e for e in entries if e['source'] == 'os-greenspace']
wd_entries = [e for e in entries if e['source'] == 'wikidata']
print(f'entries: {len(entries)}  os-greenspace {len(os_entries)}  wikidata {len(wd_entries)}')

# ---------------------------------------------------------------- OS Open Greenspace
os.makedirs('work', exist_ok=True)
lst = requests.get('https://api.os.uk/downloads/v1/products/OpenGreenspace/downloads', headers=H, timeout=60).json()
feats = []
for area in ('TQ', 'TL'):
    row = next(r for r in lst if r['area'] == area and 'Shapefile' in r['format'])
    z = f"work/{row['fileName']}"
    open(z, 'wb').write(requests.get(row['url'], headers=H, timeout=300).content)
    data = open(z, 'rb').read()
    assert hashlib.md5(data).hexdigest() == row['md5'], 'md5 differs from the listing'
    print(f"{area}: {row['fileName']} sha256={hashlib.sha256(data).hexdigest()} bytes={len(data)}")
    subprocess.run(['unzip', '-q', '-o', z, '-d', f'work/os-{area}'], check=True)
    shp = glob.glob(f'work/os-{area}/**/*GreenspaceSite*.shp', recursive=True)[0]
    subprocess.run(['ogr2ogr', '-f', 'GeoJSON', '-t_srs', 'EPSG:4326', f'work/g-{area}.geojson', shp], check=True)
    feats += json.load(open(f'work/g-{area}.geojson'))['features']
print('site features in TQ+TL:', len(feats))
by_id = {str(f['properties'].get('id', '')).lower(): f for f in feats}

def rings(g):
    if g['type'] == 'Polygon': return [g['coordinates']]
    if g['type'] == 'MultiPolygon': return g['coordinates']
    return []
def inring(x, y, ring):
    c = False; j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]; xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: c = not c
        j = i
    return c
def inside(lat, lng, g):
    return any(inring(lng, lat, p[0]) and not any(inring(lng, lat, h) for h in p[1:]) for p in rings(g))

problems = []
for e in os_entries:
    f = by_id.get(e['ext'].lower())
    if not f: problems.append(f"OS {e['id']} {e['name']!r}: id not in the current download"); continue
    p = f['properties']
    if (p.get('distName1') or '').strip() != e['name']: problems.append(f"OS {e['id']}: name now {p.get('distName1')!r}, entry {e['name']!r}")
    if p.get('function') != 'Public Park Or Garden': problems.append(f"OS {e['id']} {e['name']!r}: function now {p.get('function')!r}")
    if not inside(e['lat'], e['lng'], f['geometry']):
        # a merged multi-part park keeps the largest part's point; look in any same-named neighbour
        near = [g for g in feats if (g['properties'].get('distName1') or '').strip() == e['name'] and inside(e['lat'], e['lng'], g['geometry'])]
        if not near: problems.append(f"OS {e['id']} {e['name']!r}: position not inside any polygon of that name")
print(f'OS check: {len(os_entries)} entries, {len([p for p in problems if p.startswith("OS")])} problems')

# ---------------------------------------------------------------- Wikidata, live
def sparql(q):
    for attempt in range(4):
        r = requests.post('https://query.wikidata.org/sparql', data={'query': q, 'format': 'json'}, headers={**H, 'Accept': 'application/sparql-results+json'}, timeout=120)
        if r.status_code == 200: return r.json()
        print('WDQS', r.status_code, r.text[:120]); time.sleep(10 * (attempt + 1))
    raise SystemExit('WDQS failed')

live = {}
qids = [e['ext'] for e in wd_entries]
for i in range(0, len(qids), 40):
    vals = ' '.join(f'wd:{q}' for q in qids[i:i + 40])
    q = f'''SELECT ?item ?itemLabel ?coord ?website ?dissolved ?endtime ?closure ?stateLabel ?classLabel ?instLabel WHERE {{
      VALUES ?item {{ {vals} }}
      OPTIONAL {{ ?item wdt:P625 ?coord }} OPTIONAL {{ ?item wdt:P856 ?website }}
      OPTIONAL {{ ?item wdt:P576 ?dissolved }} OPTIONAL {{ ?item wdt:P582 ?endtime }} OPTIONAL {{ ?item wdt:P3999 ?closure }}
      OPTIONAL {{ ?item wdt:P5817 ?state }} OPTIONAL {{ ?item wdt:P31 ?inst }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }} }}'''
    for b in sparql(q)['results']['bindings']:
        qid = b['item']['value'].rsplit('/', 1)[-1]
        d = live.setdefault(qid, {'label': None, 'coords': set(), 'websites': set(), 'ended': set(), 'state': set(), 'instance': set()})
        d['label'] = b.get('itemLabel', {}).get('value', d['label'])
        m = re.search(r'Point\(([-\d.]+) ([-\d.]+)\)', b.get('coord', {}).get('value', ''))
        if m: d['coords'].add((float(m.group(2)), float(m.group(1))))
        if 'website' in b: d['websites'].add(b['website']['value'])
        for k in ('dissolved', 'endtime', 'closure'):
            if k in b: d['ended'].add(f"{k}={b[k]['value'][:10]}")
        if 'stateLabel' in b: d['state'].add(b['stateLabel']['value'])
        if 'instLabel' in b: d['instance'].add(b['instLabel']['value'])
    time.sleep(2)

import math
def metres(a, b, c, d):
    r = 6371000; p1, p2 = math.radians(a), math.radians(c)
    x = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(d - b) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(x))
wdp = []
for e in wd_entries:
    d = live.get(e['ext'])
    if not d: wdp.append(f"WD {e['id']} {e['name']!r}: item not returned"); continue
    if d['label'] != e['name']: wdp.append(f"WD {e['id']}: label now {d['label']!r}, entry {e['name']!r}")
    if not d['coords'] or min(metres(e['lat'], e['lng'], la, lo) for la, lo in d['coords']) > 5:
        wdp.append(f"WD {e['id']} {e['name']!r}: position moved or missing (live {sorted(d['coords'])[:2]})")
    if e['website'] and e['website'] not in d['websites']: wdp.append(f"WD {e['id']} {e['name']!r}: website {e['website']} not among live {sorted(d['websites'])[:2]}")
    if d['ended']: wdp.append(f"WD {e['id']} {e['name']!r}: ENDED {sorted(d['ended'])}")
    if d['state']: wdp.append(f"WD {e['id']} {e['name']!r}: STATE OF USE {sorted(d['state'])}")
    if any(re.search(r'former|defunct|demolished|destroyed|ruin|closed', i, re.I) for i in d['instance']): wdp.append(f"WD {e['id']} {e['name']!r}: instance of {sorted(d['instance'])}")
print(f'Wikidata check: {len(wd_entries)} entries, {len(wdp)} problems')
problems += wdp
print('\n===== PROBLEMS')
for p in problems: print(p)
print(f'===== {len(problems)} problems in {len(entries)} entries')
print('DONE')
