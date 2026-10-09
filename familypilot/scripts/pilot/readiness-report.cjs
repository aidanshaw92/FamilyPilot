#!/usr/bin/env node
/**
 * Before and after readiness for the ten pilot venues, by the revised three levels (readiness.cjs).
 *
 *   before   what production held on 2026-10-08: the active stored claims (docs/pilot/baseline-claims.json), the reviewed
 *            admission and activity entries already shipped on main, and the provider's opening hours.
 *   after (no new person)   what is already live, plus the profile facts that passed the gate without a person
 *   after (if approved)     those plus every fact a person is asked to decide, assuming each is approved (a held fact never counts)
 *
 *   node scripts/pilot/readiness-report.cjs [--json docs/pilot/readiness.json]
 */
const fs = require('node:fs');
const path = require('node:path');
const { readiness } = require('./readiness.cjs');
const dir = path.join(__dirname, '..', '..', '..', 'docs', 'pilot');
const baseline = JSON.parse(fs.readFileSync(path.join(dir, 'baseline-claims.json'), 'utf8')).venues;
const profiles = fs.readdirSync(path.join(dir, 'profiles')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, 'profiles', f), 'utf8')));

// Layer A: does the provider supply opening hours for the venue? (read-only query, 2026-10-08)
const PROVIDER_HOURS = { 'Battersea Park': false };
// Reviewed entries already on main before this work (src/data): free admission, and age-bearing activity.
const MAIN_ADMISSION_FREE = new Set(['Royal Air Force Museum London', 'Horniman Museum and Gardens', 'Mudchute Park and Farm', 'Gunnersbury Park']);
const MAIN_ACTIVITY = {
  "Discover Children's Story Centre": [{ sec: 'activities', key: 'baby-toddler-space', status: 'verified', kind: 'provision', minMonths: 0, maxMonthsExclusive: 36 }],
  'Babylon Park London': [{ sec: 'activities', key: 'soft-play', status: 'verified', kind: 'provision', minMonths: 12, maxMonthsExclusive: 48 }],
  'Battersea Park': [{ sec: 'activities', key: 'playground', status: 'verified', kind: 'provision', minMonths: 48, maxMonthsExclusive: 180 }],
};
const FIELD = {
  'familyFacilities.toilets': ['toilets', 'toilets'], 'familyFacilities.babyChanging': ['toilets', 'babyChanging'], 'accessibility.accessibleToilet': ['toilets', 'accessibleToilet'],
  'familyFacilities.cafe': ['food', 'cafe'], 'familyFacilities.playground': ['play', 'playground'], 'familyFacilities.parking': ['transport', 'parking'], 'pushchairSuitability': ['pushchair', 'access'],
};

function baselineFacts(p) {
  const facts = [];
  for (const c of baseline[p.id] ?? []) { const m = FIELD[c.field]; if (m) facts.push({ sec: m[0], key: m[1], status: 'verified' }); }
  if (MAIN_ADMISSION_FREE.has(p.name)) facts.push({ sec: 'pricing', key: 'free', status: 'verified' });
  facts.push(...(MAIN_ACTIVITY[p.name] ?? []));
  return facts;
}

const rows = profiles.map((p) => {
  const layerA = { hours: PROVIDER_HOURS[p.name] ?? true };
  const before = readiness(baselineFacts(p), { view: 'approved', layerA });
  // What is already live on main stays live: the "after" states are the profile facts PLUS the baseline facts.
  const live = baselineFacts(p);
  const auto = readiness([...p.facts, ...live], { view: 'auto', layerA });
  const approved = readiness([...p.facts, ...live], { view: 'approved', layerA });
  return { name: p.name, before: before.level, beforeMissing: before.missing, afterAuto: auto.level, autoMissing: auto.missing, afterApproved: approved.level, approvedMissing: approved.missing, personalisation: approved.personalisation, limitations: approved.limitations };
});
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('venue', 34), pad('before', 22), pad('after, no new person', 22), pad('after, if approved', 22), 'still missing (if approved)');
for (const r of rows) console.log(pad(r.name, 34), pad(r.before, 22), pad(r.afterAuto, 22), pad(r.afterApproved, 22), r.approvedMissing.join(', ') || '-');
const count = (k, lvl) => rows.filter((r) => r[k] === lvl).length;
console.log('\nrecommendation-ready or better:  before', rows.filter((r) => r.before !== 'discoverable').length, '| after, no new person', rows.filter((r) => r.afterAuto !== 'discoverable').length, '| after, if approved', rows.filter((r) => r.afterApproved !== 'discoverable').length);
console.log('highly personalised:             before', count('before', 'highly-personalised'), '| after, no new person', count('afterAuto', 'highly-personalised'), '| after, if approved', count('afterApproved', 'highly-personalised'));
const j = process.argv.indexOf('--json');
if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify({ builtOn: '2026-10-08', rows }, null, 1));
