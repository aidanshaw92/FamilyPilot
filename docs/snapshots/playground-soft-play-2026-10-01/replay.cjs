const fs = require('fs');
const path = require('path');
const LIB = '/home/user/FamilyPilot/server/enrichment/_lib';
const before = require(path.join(LIB, 'evidence-extractor.js'));
const after = require(path.join(LIB, '_after-evidence-extractor.js'));

const ROWS = [
  ['2fb9ab5e', 'Babylon Park London', 'https://babylonpark.com/london/?utm_source=google&utm_medium=localcard&utm_campaign=309703_lon', 'official_website', 'Babylon Park in London: Indoor Amusement Park'],
  ['26168940', "Belmont Children's Farm", 'https://www.belmontfarm.co.uk/fun-farm-soft-play-venue', 'visitor_info', 'Fun Farm Soft Play &mdash; Belmont Farm (Copy)'],
  ['edec204b', "Belmont Children's Farm", 'https://www.belmontfarm.co.uk/', 'official_website', 'Welcome to Belmont Farm - Connecting You to Nature in North West London'],
  ['232f640c', 'Flip Out Brent Cross', 'https://www.flipout.co.uk/locations/brent-cross', 'official_website', "North London's Ultimate Indoor Trampoline & Adventure Park!"],
  ['e8eb4a0d', 'Flip Out Canary Wharf', 'https://www.flipout.co.uk/locations/canary-wharf/frequently-asked-questions', 'visitor_info', 'Frequently Asked Questions About Flip Out Canary Wharf | FAQs'],
  ['ef6709fe', 'Flip Out Canary Wharf', 'https://www.flipout.co.uk/locations/canary-wharf', 'official_website', "Canary Wharf's Biggest & Best Indoor Adventure Park!"],
  ['58012fda', 'Flip Out Watford', 'https://www.flipout.co.uk/locations/watford', 'official_website', "Watford's Epic No 1 Indoor Adventure Park!"],
  ['8feea2f8', 'Flip Out Watford', 'https://www.flipout.co.uk/locations/watford/frequently-asked-questions', 'visitor_info', 'Frequently Asked Questions About Flip Out Watford | FAQs'],
  ['0774fcd8', 'Woodside Animal Farm', 'https://www.woodsidefarm.co.uk/', 'official_website', 'Home - Woodside Animal Farm'],
  ['823b73fb', 'Woodside Animal Farm', 'https://www.woodsidefarm.co.uk/visitor-info/', 'visitor_info', 'Visitor Info - Woodside Animal Farm'],
];

const DIR = __dirname;
const key = (f) => `${f.field}=${f.value}/${f.confidence}`;

function facts(mod, text, meta) {
  const out = mod.extractEvidenceFromText(text, meta);
  const list = Array.isArray(out) ? out : out?.facts ?? [];
  return list;
}

let changedRows = 0;
const perVenue = new Map();

for (const [id, venue, url, sourceType, pageTitle] of ROWS) {
  const text = fs.readFileSync(path.join(DIR, `${id}.txt`), 'utf8');
  const meta = { url, sourceType, retrievedAt: '2026-10-01T00:00:00.000Z', pageTitle };
  const b = facts(before, text, meta);
  const a = facts(after, text, meta);

  const bKeys = new Set(b.map(key));
  const aKeys = new Set(a.map(key));
  const lost = [...bKeys].filter((k) => !aKeys.has(k));
  const gained = [...aKeys].filter((k) => !bKeys.has(k));

  if (lost.length || gained.length) {
    changedRows += 1;
    console.log(`\n[${id}] ${venue}`);
    console.log(`  ${url}`);
    lost.forEach((k) => console.log(`  LOST   ${k}`));
    gained.forEach((k) => console.log(`  GAINED ${k}`));
    const nonPlayground = [...lost, ...gained].filter((k) => !k.startsWith('playground='));
    if (nonPlayground.length) console.log(`  !! NON-PLAYGROUND MOVEMENT: ${nonPlayground.join(', ')}`);
  }

  const agg = perVenue.get(venue) ?? { before: new Set(), after: new Set() };
  b.filter((f) => f.field === 'playground').forEach((f) => agg.before.add(`${key(f)} <= ${f.evidenceText?.slice(0, 110)}`));
  a.filter((f) => f.field === 'playground').forEach((f) => agg.after.add(`${key(f)} <= ${f.evidenceText?.slice(0, 110)}`));
  perVenue.set(venue, agg);
}

console.log(`\n=== rows with any change: ${changedRows} of ${ROWS.length} ===`);
console.log('\n=== playground fact per venue (any eligible row) ===');
for (const [venue, agg] of [...perVenue.entries()].sort()) {
  const was = agg.before.size ? 'yes' : 'NONE';
  const now = agg.after.size ? 'yes' : 'NONE';
  console.log(`\n${venue}: ${was} -> ${now}${was !== now ? '   *** CHANGED ***' : ''}`);
  for (const line of agg.after.size ? agg.after : agg.before) console.log(`   ${agg.after.size ? 'after ' : 'before'}: ${line}`);
}
