#!/usr/bin/env node
/**
 * The live readiness check: are the five beta venues recommendation-ready on what PRODUCTION actually holds and ships?
 *
 *   node --experimental-strip-types scripts/pilot/live-readiness.cjs claims.json [--repo ../..] [--as-of 2026-10-09] [--json out.json]
 *
 * Inputs, all real: `claims.json` is production's active claims and provider-hours flag, exported read-only with live-readiness-export.sql;
 * the reviewed admission and activity data are read from the checkout of the DEPLOYED commit (they ship as code, so the deployed commit is
 * the proof of what parents see). The rules are `readiness.cjs`, unchanged. Nothing is inferred: a missing fact is a missing requirement,
 * and a venue is only as ready as the facts below. It writes nothing and calls no provider.
 *
 * Fact mapping: facility claims (toilets, baby changing, accessible toilet, cafe, playground, parking, pushchair) and `hours.*` claims are
 * read as facts; a claim past its `valid_until` does not count; admission counts only where the reviewed decision is `publish`
 * (`hold` and `refuse` never count); an activity counts only while inside its 90-day lifetime.
 */
const fs = require('node:fs');
const path = require('node:path');
const { readiness } = require('./readiness.cjs');

const FIVE = ['Royal Air Force Museum London', 'Horniman Museum and Gardens', "Discover Children's Story Centre", 'London Zoo', 'Science Museum'];
const CLAIM_FACTS = {
  'familyFacilities.toilets': ['toilets', 'toilets'],
  'familyFacilities.babyChanging': ['toilets', 'babyChanging'],
  'accessibility.accessibleToilet': ['toilets', 'accessibleToilet'],
  'familyFacilities.cafe': ['food', 'cafe'],
  'familyFacilities.playground': ['play', 'playground'],
  'familyFacilities.parking': ['transport', 'parking'],
  pushchairSuitability: ['pushchair', 'access'],
};
const day = (iso) => Date.parse(`${iso}T00:00:00Z`);
const ageDays = (iso, asOf) => (day(asOf) - day(String(iso).slice(0, 10))) / 86400000;

function factsFor(venue, { admission, activities, asOf }) {
  const facts = [];
  const why = [];
  for (const c of venue.claims) {
    if (c.validUntil && String(c.validUntil).slice(0, 10) < asOf) continue; // expired claims do not count
    const mapped = CLAIM_FACTS[c.fieldKey];
    if (mapped && (c.value === 'yes' || c.value === 'no' && c.fieldKey === 'familyFacilities.parking' || c.fieldKey === 'pushchairSuitability')) {
      facts.push({ sec: mapped[0], key: mapped[1], status: 'verified' });
      why.push(`${c.fieldKey}=${c.value}${/auto/i.test(c.approvedBy ?? '') ? ' [auto-accepted]' : ' [human-approved]'}`);
    }
    if (/^hours\./.test(c.fieldKey)) { facts.push({ sec: 'opening', key: 'hours', status: 'verified' }); why.push(c.fieldKey); }
  }
  const price = admission.claims.find((a) => a.venueId === venue.venueId && a.decision === 'publish' && ageDays(a.pricing.source.checkedAt, asOf) <= 400);
  if (price) {
    const p = price.pricing;
    facts.push({ sec: 'pricing', key: p.status === 'free' ? 'free' : p.tiers ? 'variable' : 'paid', status: 'verified' });
    why.push(`pricing:${p.status}${p.tiers ? ' (tiers)' : ''}`);
  }
  for (const a of activities.filter((x) => x.venueId === venue.venueId)) {
    if (ageDays(a.evidence.retrievedAt, asOf) > 90) continue;
    facts.push({ sec: 'activities', key: a.label, status: 'verified', kind: a.kind, minMonths: a.minMonths, maxMonthsExclusive: a.maxMonthsExclusive });
    why.push(`activity:${a.label}`);
  }
  return { facts, why };
}

async function run({ claimsFile, repo, asOf }) {
  const data = JSON.parse(fs.readFileSync(claimsFile, 'utf8')).export ?? JSON.parse(fs.readFileSync(claimsFile, 'utf8'));
  const admission = (await import(path.join(repo, 'src/data/reviewed-admission-claims.ts'))).REVIEWED_ADMISSION;
  const activities = [...(await import(path.join(repo, 'src/data/reviewed-activity-evidence.ts'))).REVIEWED_ACTIVITY_EVIDENCE];
  return FIVE.map((name) => {
    const venue = (data.venues ?? []).find((v) => v.name === name);
    if (!venue) return { name, level: 'NOT IN PRODUCTION', ready: false, missing: ['venue not found'], used: [] };
    const { facts, why } = factsFor(venue, { admission, activities, asOf });
    const r = readiness(facts, { view: 'auto', layerA: { hours: Boolean(venue.providerHours) } });
    return { name, level: r.level, ready: r.level !== 'discoverable', missing: r.missing, used: why };
  });
}

module.exports = { run, factsFor, FIVE };

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
  run({ claimsFile: args[0], repo: path.resolve(flag('--repo') ?? path.join(__dirname, '..', '..')), asOf: flag('--as-of') ?? new Date().toISOString().slice(0, 10) }).then((rows) => {
    for (const r of rows) console.log(`${r.ready ? 'READY    ' : 'NOT READY'} ${r.name.padEnd(34)} ${r.level}${r.missing.length ? '  missing: ' + r.missing.join(', ') : ''}`);
    if (flag('--json')) fs.writeFileSync(flag('--json'), JSON.stringify(rows, null, 1));
    process.exit(rows.every((r) => r.ready) ? 0 : 1);
  });
}
