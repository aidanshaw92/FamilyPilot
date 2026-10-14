"""One-off: read each candidate play venue's OWN website, once, and record the operator's own words. Polite: an identifying User-Agent, robots.txt honoured, one request
per page, two seconds between requests, at most five pages per host, no cookies, no forms, no logins, no search engines, no social networks. A domain that was GUESSED
from the venue's name is accepted only if its pages show the venue's own postcode (from the Food Standards Agency record) AND name the venue; otherwise it is dropped
and nothing from it is recorded. Facts are recorded as short quoted sentences with the page they came from; nothing is inferred."""
import json, re, socket, sys, time, urllib.robotparser
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup

UA = 'FamilyPilot-site-check/1.0 (+https://github.com/aidanshaw92/FamilyPilot; reads a venue front page and at most four linked pages once)'
H = {'User-Agent': UA, 'Accept': 'text/html,*/*;q=0.5', 'Accept-Language': 'en-GB,en;q=0.9'}
STOP = {'the', 'and', 'of', 'at', 'in', 'on', 'a', 'an', 'for', 'to', 'london', 'ltd', 'limited', 'cafe', 'café', 'centre', 'center', 'play', 'soft', 'uk'}
KEY = re.compile(r'soft ?play|toddler|baby|babies|under[- ]?\d|\bages?\b|\byears?\b|\bmonths?\b|trampolin|climb|ninja|arcade|bowling|laser|permanently|closed|opening|open (?:daily|every|mon|tue|wed|thu|fri|sat|sun)|mon(?:day)?\s*[-–to]|walk[- ]?in|book(?:ing)? (?:online|required|in advance)|ball ?pit|slide|cafe|café', re.I)
FOLLOW = re.compile(r'contact|find-?us|visit|about|price|session|toddler|faq|opening|hours|age|play', re.I)
robots, perhost = {}, {}

def tokens(s):
    return [t for t in re.sub(r"[^a-z0-9 ]+", ' ', (s or '').lower().replace('&', ' and ')).split() if t not in STOP and len(t) > 1]

def norm_pc(s):
    return re.sub(r'[^A-Z0-9]', '', (s or '').upper())

def allowed(url):
    p = urlparse(url); root = f'{p.scheme}://{p.netloc}'
    if root not in robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            r = requests.get(root + '/robots.txt', headers=H, timeout=10)
            rp.parse(r.text.splitlines() if r.status_code == 200 and 'html' not in r.headers.get('content-type', '') else [])
        except Exception: rp.parse([])
        robots[root] = rp; time.sleep(1)
    return robots[root].can_fetch(UA, url)

def fetch(url):
    host = urlparse(url).netloc.lower()
    perhost[host] = perhost.get(host, 0) + 1
    if perhost[host] > 5: return None, 'skipped: a sixth page on one host'
    if not allowed(url): return None, 'robots.txt disallows'
    try:
        r = requests.get(url, headers=H, timeout=20, allow_redirects=True)
    except Exception as e: return None, type(e).__name__
    time.sleep(2)
    if r.status_code != 200 or 'html' not in r.headers.get('content-type', ''): return None, f'HTTP {r.status_code}'
    return r, None

def read(r):
    s = BeautifulSoup(r.text[:600000], 'lxml')
    for t in s(['script', 'style', 'noscript', 'svg', 'nav', 'footer']): t.decompose()
    title = re.sub(r'\s+', ' ', s.title.string).strip() if s.title and s.title.string else ''
    h1 = ' | '.join(re.sub(r'\s+', ' ', x.get_text(' ', strip=True)) for x in s.find_all('h1')[:2])
    desc = (s.find('meta', attrs={'name': 'description'}) or {}).get('content', '') if s.find('meta', attrs={'name': 'description'}) else ''
    text = re.sub(r'\s+', ' ', s.get_text(' ', strip=True))
    return s, title, h1, desc, text

def quotes(text):
    out, seen = [], set()
    for sent in re.split(r'(?<=[.!?])\s+|\s{2,}', text):
        sent = sent.strip()
        if 12 <= len(sent) <= 280 and KEY.search(sent) and sent.lower() not in seen:
            seen.add(sent.lower()); out.append(sent)
        if len(out) >= 14: break
    return out

def visit(start_urls, follow, name, postcode, guessed):
    pages, found_pc, named, links = [], False, False, []
    for i, u in enumerate(start_urls):
        r, why = fetch(u)
        if r is None:
            pages.append({'url': u, 'ok': False, 'reason': why})
            if i == 0 and guessed: break
            continue
        s, title, h1, desc, text = read(r)
        hay = set(tokens(' '.join([title, h1, desc, text[:1500]]))); want = tokens(name)
        if want and len([t for t in want if t in hay]) / len(want) >= 0.6: named = True
        if norm_pc(postcode) and norm_pc(postcode) in norm_pc(text): found_pc = True
        pages.append({'url': r.url, 'ok': True, 'title': title[:140], 'h1': h1[:140], 'description': desc[:240], 'postcodeOnPage': norm_pc(postcode) in norm_pc(text), 'quotes': quotes(text)})
        if i == 0:
            for a in s.find_all('a', href=True):
                h = urljoin(r.url, a['href']).split('#')[0]
                if urlparse(h).netloc.lower() == urlparse(r.url).netloc.lower() and h not in start_urls and h not in links and (FOLLOW.search(h) or (follow and re.search(follow, h, re.I))):
                    links.append(h)
        if guessed and i == 0 and not (named or found_pc): break
    for h in links[:4]:
        if guessed and not (named and found_pc) and len(pages) >= 2: break
        r, why = fetch(h)
        if r is None: pages.append({'url': h, 'ok': False, 'reason': why}); continue
        s, title, h1, desc, text = read(r)
        if norm_pc(postcode) and norm_pc(postcode) in norm_pc(text): found_pc = True
        pages.append({'url': r.url, 'ok': True, 'title': title[:140], 'h1': h1[:140], 'postcodeOnPage': norm_pc(postcode) in norm_pc(text), 'quotes': quotes(text)})
    return pages, named, found_pc

def slugs(name):
    n = name.lower().replace('&', 'and').replace("'", '').replace('é', 'e')
    words = [w for w in re.sub(r'[^a-z0-9 ]+', ' ', n).split() if w not in ('ltd', 'limited', 'the')]
    full = ''.join(words)
    out = [full, '-'.join(words)]
    trimmed = [w for w in words if w not in ('cafe', 'centre', 'center', 'ltd')]
    out += [''.join(trimmed), '-'.join(trimmed)]
    core = [w for w in words if w not in ('play', 'cafe', 'soft', 'centre', 'center', 'zone')]
    if len(core) >= 2: out += [''.join(core) + 'softplay', ''.join(core) + 'playcafe', ''.join(core)]
    seen = []; [seen.append(x) for x in out if x and x not in seen]
    return seen

def resolves(host):
    try: socket.setdefaulttimeout(4); socket.getaddrinfo(host, 80); return True
    except Exception: return False

inp = json.load(open(sys.argv[1])); results = []
for e in inp['explicit']:
    pages, named, pc = visit(e['urls'], e.get('follow', ''), e['name'], e['postcode'], False)
    res = {'id': e['id'], 'name': e['name'], 'postcode': e['postcode'], 'how': 'explicit', 'namesVenue': named, 'postcodeOnSite': pc, 'pages': pages}
    results.append(res); print('RESULT ' + json.dumps({k: res[k] for k in ('id', 'name', 'namesVenue', 'postcodeOnSite')} | {'pages': [(p['url'], p.get('ok')) for p in pages]}, ensure_ascii=False), flush=True)
for name, postcode, fid in inp['independents']:
    cand = []
    for sl in slugs(name):
        for tld in ('.co.uk', '.com', '.london', '.uk', '.org.uk'):
            cand.append(sl + tld)
    live = [h for h in cand if resolves(h)][:6]
    got = None
    for h in live:
        pages, named, pc = visit([f'https://{h}/'], '', name, postcode, True)
        if named and pc: got = (h, pages, named, pc); break
        time.sleep(1)
    if got:
        h, pages, named, pc = got
        res = {'id': fid, 'name': name, 'postcode': postcode, 'how': 'guessed-domain, accepted: names the venue and shows its postcode', 'domain': h, 'namesVenue': named, 'postcodeOnSite': pc, 'pages': pages}
    else:
        res = {'id': fid, 'name': name, 'postcode': postcode, 'how': 'no website found', 'triedResolving': live}
    results.append(res); print('RESULT ' + json.dumps({k: res.get(k) for k in ('id', 'name', 'how', 'domain')}, ensure_ascii=False), flush=True)
import os
os.makedirs('results/softplay', exist_ok=True)
json.dump({'readAt': time.strftime('%Y-%m-%d'), 'results': results}, open('results/softplay/operators.json', 'w'), ensure_ascii=False, indent=1)
print('DONE', flush=True)
