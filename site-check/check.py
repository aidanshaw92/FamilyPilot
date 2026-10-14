"""One-off: for each venue, fetch its own website's front page ONCE and say whether it answered and whether its title or heading names the venue.
The venue's own words are the independent evidence for categories (activities, farms, zoos, attractions) where open data offers no second source.
Polite: an identifying User-Agent, robots.txt honoured, one request per page, two seconds between requests, at most three pages per host, no cookies,
no forms, no logins. Nothing is stored but the job log."""
import json, re, sys, time, urllib.robotparser
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup

UA = 'FamilyPilot-site-check/1.0 (+https://github.com/aidanshaw92/FamilyPilot; one front-page request per venue)'
STOP = {'the', 'and', 'of', 'at', 'in', 'on', 'a', 'an', 'for', 'to', 'london', 'ltd', 'limited', 'park', 'centre', 'center', 'world'}
H = {'User-Agent': UA, 'Accept': 'text/html,*/*;q=0.5', 'Accept-Language': 'en-GB,en;q=0.9'}

def tokens(s):
    return [t for t in re.sub(r"[^a-z0-9 ]+", ' ', (s or '').lower().replace('&', ' and ')).split() if t not in STOP and len(t) > 1]

robots = {}
hosts = {}
def allowed(url):
    p = urlparse(url)
    root = f'{p.scheme}://{p.netloc}'
    if root not in robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            r = requests.get(root + '/robots.txt', headers=H, timeout=10)
            if r.status_code == 200 and 'html' not in r.headers.get('content-type', ''):
                rp.parse(r.text.splitlines())
            else:
                rp.parse([])            # no usable robots.txt: nothing is disallowed
        except Exception:               # noqa: BLE001
            rp.parse([])
        robots[root] = rp
        time.sleep(1)
    return robots[root].can_fetch(UA, url)

items = json.load(open('site-check/input.json'))
print(f'checking {len(items)} venues', flush=True)
for it in items:
    out = {'id': it['id'], 'name': it['name'], 'url': it['url']}
    host = urlparse(it['url']).netloc.lower()
    hosts[host] = hosts.get(host, 0) + 1
    try:
        if hosts[host] > 3:
            out.update(ok=False, reason='skipped: a fourth page on one host')
        elif not allowed(it['url']):
            out.update(ok=False, reason='robots.txt disallows')
        else:
            r = requests.get(it['url'], headers=H, timeout=20, allow_redirects=True)
            out.update(status=r.status_code, final=urlparse(r.url).netloc.lower(), ok=r.status_code == 200 and 'html' in r.headers.get('content-type', ''))
            if out['ok']:
                s = BeautifulSoup(r.text[:400000], 'lxml')
                title = re.sub(r'\s+', ' ', (s.title.string if s.title and s.title.string else '')).strip()
                h1 = re.sub(r'\s+', ' ', ' '.join(x.get_text(' ', strip=True) for x in s.find_all('h1')[:2])).strip()
                site = (s.find('meta', property='og:site_name') or {}).get('content', '') if s.find('meta', property='og:site_name') else ''
                hay = set(tokens(' '.join([title, h1, site])))
                want = tokens(it['name'])
                hit = [t for t in want if t in hay]
                out.update(title=title[:110], names_venue=bool(want) and len(hit) / len(want) >= 0.6, matched=f'{len(hit)}/{len(want)}')
    except Exception as e:  # noqa: BLE001
        out.update(ok=False, reason=f'{type(e).__name__}')
    print('RESULT ' + json.dumps(out, ensure_ascii=False), flush=True)
    time.sleep(2)
print('DONE', flush=True)
