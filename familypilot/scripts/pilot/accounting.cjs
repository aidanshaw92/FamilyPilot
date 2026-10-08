#!/usr/bin/env node
/**
 * Where every profile fact goes, and why fewer facts than claims can be published.
 *
 *   node scripts/pilot/accounting.cjs --pages <pages.json>[,<gap.json>] [--json docs/pilot/accounting.json]
 *
 * Three questions, measured:
 *   1. The funnel: 194 facts -> accepted / proposed / unknown -> claims the pilot would write -> claims production's own
 *      automatic publisher could write.
 *   2. For each fact that is NOT a claim: is that a deliberate safety gate, a schema limit, or an avoidable pipeline gap?
 *   3. An independent check: run PRODUCTION's own extractor over the same pages and compare it with the profile.
 */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..', '..');
const { CLAIM_MAP, claimsFor } = require('./profile-claims.cjs');
const ev = require(path.join(root, 'server/enrichment/_lib/evidence-extractor.js'));
const { FIELD_MAP } = require(path.join(root, 'server/enrichment/_lib/trusted-evidence.js'));

const args = process.argv.slice(2);
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const pages = flag('--pages').split(',').flatMap((f) => { const r = JSON.parse(fs.readFileSync(f, 'utf8')); return r.pages.filter((p) => p.text).map((p) => ({ venue: p.venue, url: p.url, title: p.title, readAt: p.read, text: p.text })); });
const dir = path.join(root, 'docs', 'pilot', 'profiles');
const profiles = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));

/** production extractor field name for a profile fact, where one exists */
const PROD_FIELD = {
  'toilets.toilets': 'toilets', 'toilets.babyChanging': 'babyChanging', 'toilets.accessibleToilet': 'accessibleToilet', 'food.cafe': 'cafe',
  'play.playground': 'playground', 'play.natureplay': 'playground', 'transport.parking': 'parking', 'access.wheelchair': 'wheelchairAccessible',
  'access.sensory': 'sensoryFriendlySessions', 'access.relaxed': 'sensoryFriendlySessions',
};
const prodAutoFields = new Set(Object.keys(FIELD_MAP));

// ---- 1 + 2: the funnel and the disposition of every non-claim fact
const disposition = (f) => {
  const key = `${f.sec}.${f.key}`;
  if (CLAIM_MAP[key] || key === 'transport.parking') return 'claim';
  if (f.sec === 'activities' && f.minMonths != null) return 'ships as reviewed activity data (code, by pull request)';
  if (f.sec === 'pricing') return f.key === 'free' ? 'ships as reviewed admission data (code, by pull request)' : 'price: reviewed admission data or held (no claim type)';
  if (f.goodToKnow) return 'note only (good to know); no structured home';
  if (key === 'opening.hours' || key === 'opening.closure') return 'NO HOME: official hours and closures have no claim type';
  if (f.sec === 'transport') return 'NO HOME: stations, buses, fees and entrances have no claim type';
  if (f.sec === 'activities') return 'NO HOME: a plain activity description has no claim type';
  if (f.sec === 'pushchair') return 'NO HOME: pushchair rules and storage have no claim type (only a terrain rating)';
  if (f.sec === 'access') return 'NO HOME: accessibility detail beyond wheelchair and sensory has no claim type';
  if (f.sec === 'considerations') return 'NO HOME: practical rules and closures have no claim type';
  if (f.sec === 'toilets' || f.sec === 'food' || f.sec === 'play') return 'NO HOME: facility detail beyond the mapped facts has no claim type';
  return 'NO HOME: other';
};
const funnel = { total: 0, verified: 0, review: 0, unknown: 0, hypothesis: 0, held: 0 };
const byDisposition = { verified: {}, review: {} };
for (const p of profiles) for (const f of p.facts) {
  funnel.total += 1; funnel[f.status] += 1; if (f.held) funnel.held += 1;
  if (f.status === 'verified' || f.status === 'review') { const d = disposition(f); byDisposition[f.status][d] = (byDisposition[f.status][d] ?? 0) + 1; }
}
let claimsAuto = 0, claimsApproved = 0, claimsAutoProdFields = 0, claimsApprovedProdFields = 0;
for (const p of profiles) {
  const a = claimsFor(p, 'auto'), b = claimsFor(p, 'approved');
  claimsAuto += a.length; claimsApproved += b.length;
  const prodOk = (c) => { const fk = c.fieldKey; return Object.values(FIELD_MAP).includes(fk); };
  claimsAutoProdFields += a.filter(prodOk).length; claimsApprovedProdFields += b.filter(prodOk).length;
}

// ---- 3: production's extractor against the profile
const cmp = { agree: 0, conflict: 0, extractorMissed: 0, profileOnlyNoField: 0, rows: [] };
for (const p of profiles) {
  const vpages = pages.filter((x) => x.venue === p.name);
  const found = {};
  for (const pg of vpages) {
    const meta = ev.extractionSourceMeta({ url: pg.url, sourceType: 'visitor_info', retrievedAt: pg.readAt, pageTitle: pg.title });
    for (const fact of ev.extractEvidenceFromText(pg.text, meta)) if (fact.confidence === 'high') (found[fact.field] ??= new Set()).add(fact.value);
  }
  for (const f of p.facts) {
    if (f.status !== 'verified' && f.status !== 'review') continue;
    const pf = PROD_FIELD[`${f.sec}.${f.key}`];
    if (!pf) { cmp.profileOnlyNoField += 1; continue; }
    const vals = found[pf] ? [...found[pf]] : [];
    const want = f.value === 'no' ? 'no' : 'yes';
    let r;
    if (!vals.length) { r = 'extractor-missed'; cmp.extractorMissed += 1; }
    else if (vals.includes(want) && !vals.includes(want === 'yes' ? 'no' : 'yes')) { r = 'agree'; cmp.agree += 1; }
    else if (vals.includes(want)) { r = 'agree-but-extractor-also-says-opposite'; cmp.agree += 1; cmp.conflict += 1; }
    else { r = 'CONFLICT'; cmp.conflict += 1; }
    cmp.rows.push({ venue: p.name, fact: `${f.sec}.${f.key}`, profile: f.value, extractor: vals.join('/') || '-', result: r });
  }
}
const out = { builtOn: '2026-10-08', funnel, byDisposition, claims: { noPersonUnderPilotGate: claimsAuto, ifApprovedUnderPilotGate: claimsApproved, noPersonAndProductionAutoField: claimsAutoProdFields, ifApprovedAndProductionAutoField: claimsApprovedProdFields }, productionAutoFields: [...prodAutoFields], crossCheck: { agree: cmp.agree, conflict: cmp.conflict, extractorMissed: cmp.extractorMissed, profileFactsWithNoProductionField: cmp.profileOnlyNoField }, rows: cmp.rows };
console.log(JSON.stringify({ funnel, byDisposition, claims: out.claims, crossCheck: out.crossCheck }, null, 1));
for (const r of cmp.rows.filter((x) => x.result !== 'agree')) console.log(r.result.padEnd(14), r.venue.padEnd(32), r.fact.padEnd(26), 'profile', r.profile, '| extractor', r.extractor);
if (flag('--json')) fs.writeFileSync(flag('--json'), JSON.stringify(out, null, 1));
