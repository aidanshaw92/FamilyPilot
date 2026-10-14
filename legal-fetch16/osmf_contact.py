"""One-off: how does the OSM Foundation's Licensing Working Group page say to contact it? GET only, two requests."""
import re, html, time, requests
UA = 'FamilyPilot-open-data/1.0 (+https://github.com/aidanshaw92/FamilyPilot)'
H = {'User-Agent': UA, 'accept': 'text/html'}
for u in ['https://osmfoundation.org/wiki/Licensing_Working_Group', 'https://wiki.osmfoundation.org/wiki/Licensing_Working_Group']:
    try:
        r = requests.get(u, headers=H, timeout=60)
        t = re.sub(r'(?is)<(script|style).*?</\1>', ' ', r.text)
        raw = re.findall(r'[\w.\-+]+\s*(?:@|\(at\)|\[at\]| at )\s*[\w.\-]*osmfoundation[\w.\-]*', t, re.I)
        mailto = re.findall(r'mailto:([^"\'>\s]+)', r.text, re.I)
        text = re.sub(r'\s+', ' ', html.unescape(re.sub(r'(?s)<[^>]+>', ' ', t))).strip()
        print('=====', u, r.status_code, len(text))
        print('mailto:', mailto[:10]); print('obfuscated:', raw[:10])
        for m in re.finditer(r'(contact|e-?mail|questions|write to|licen[cs]ing@|legal)', text, re.I):
            s = max(0, m.start() - 120); print(' ...', text[s:m.end() + 160]); 
            if m.start() > 3000: break
    except Exception as e:
        print('=====', u, 'ERROR', e)
    time.sleep(1)
print('DONE')
