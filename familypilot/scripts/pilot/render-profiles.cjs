#!/usr/bin/env node
/**
 * Renders the ten profiles as one readable document: what a parent could be told, with each statement's status, source and
 * reading date, and the honest unknowns. Generated; edit the profile sources, not the output.
 *
 *   node scripts/pilot/render-profiles.cjs > docs/pilot/PROFILES.md
 */
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '..', '..', '..', 'docs', 'pilot');
const profiles = fs.readdirSync(path.join(dir, 'profiles')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, 'profiles', f), 'utf8')));
const readiness = JSON.parse(fs.readFileSync(path.join(dir, 'readiness.json'), 'utf8')).rows;
const TITLES = {
  activities: 'What children can do', pushchair: 'Pushchairs and buggies', toilets: 'Toilets and baby changing', transport: 'Getting there and parking',
  food: 'Food', play: 'Play facilities', access: 'Accessibility', opening: 'Opening', pricing: 'Admission and price', considerations: 'Worth knowing before you go',
};
const MARK = { verified: '✔', review: '◐', hypothesis: '≈', unknown: '?' };
const LEVEL = { discoverable: 'Discoverable', 'recommendation-ready': 'Recommendation-ready', 'highly-personalised': 'Highly personalised' };
const age = (m) => (m < 24 ? `${m} months` : `${Math.round(m / 12)} years`);

console.log('# The ten pilot profiles\n');
console.log('Generated from `docs/pilot/profiles/*.json` (built by `scripts/pilot/build-profiles.cjs` from each venue\'s own pages, read on 2026-10-08).\n');
console.log('**Key.** ✔ verified: passed the gate with no person · ◐ proposed: the sentence is real but a person decides · ≈ hypothesis: never shown as a fact · ? unknown: the pages read do not say.\n');
console.log('| Venue | Before | After, no person | After, if every proposal is approved | Still missing |\n|---|---|---|---|---|');
for (const r of readiness) console.log(`| ${r.name} | ${LEVEL[r.before]} | ${LEVEL[r.afterAuto]} | **${LEVEL[r.afterApproved]}** | ${r.approvedMissing.join(', ') || '-'} |`);
console.log('');
for (const p of profiles.sort((a, b) => a.name.localeCompare(b.name))) {
  const r = readiness.find((x) => x.name === p.name);
  console.log(`\n## ${p.name}\n`);
  for (const s of p.sources ?? []) console.log(`> **Source unavailable.** ${s.host} (${s.role}): HTTP ${s.http}, ${s.status}, observed ${s.observedOn}; ${s.note} Not retried (${s.retry}). Alternatives that are permitted: ${s.alternatives.join('; ')}.\n`);
  console.log(`${p.counts.verified ?? 0} verified · ${p.counts.review ?? 0} proposed · ${p.counts.unknown ?? 0} unknown · ${p.counts.hypothesis ?? 0} hypothesis. Level if every proposal is approved: **${LEVEL[r.afterApproved]}**.\n`);
  for (const sec of Object.keys(TITLES)) {
    const facts = p.facts.filter((f) => f.sec === sec);
    if (!facts.length) continue;
    console.log(`**${TITLES[sec]}**\n`);
    for (const f of facts) {
      const ages = f.minMonths != null ? ` _(${age(f.minMonths)} to under ${age(f.maxMonthsExclusive)}${f.kind ? `, ${f.kind}` : ''})_` : '';
      const src = f.evidence ? ` [source](${f.evidence.url}) · read ${f.evidence.readAt}${f.evidence.carriedFrom ? ' · carried from an earlier reading' : ''}` : '';
      const why = f.status === 'review' && f.reviewReasons?.length ? ` _Needs a person: ${f.reviewReasons.join('; ')}._` : '';
      const note = f.note ? ` _${f.note}_` : '';
      console.log(`- ${MARK[f.status]} ${f.text}${ages}${src}${why}${note}`);
    }
    console.log('');
  }
}
