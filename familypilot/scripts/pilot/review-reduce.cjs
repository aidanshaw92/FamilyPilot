#!/usr/bin/env node
/**
 * How many decisions a person actually has to make, and why, stage by stage.
 *
 *   node scripts/pilot/review-reduce.cjs [--json ../docs/pilot/review-reduction.json]
 *
 * Reads the built profiles, the triage routing, production's active claims for these venues (baseline-claims.json) and the record of the
 * two blind semantic verifications (../docs/pilot/semantic-verification.json). Writes nothing else and approves nothing.
 *
 * A STAGE MAY REMOVE AN ITEM FROM THE HUMAN QUEUE ONLY IF IT CANNOT PUBLISH ANYTHING. Parking an item (nothing can hold it), merging a
 * duplicate, deferring a restatement of what production already serves, and rejecting an unsupported proposal all publish nothing.
 * Nothing here moves an item from "a person must decide" to "published": independent AI verification is evidence for the person, never
 * a substitute for them.
 */
const fs = require('node:fs');
const path = require('node:path');
const { disposition } = require('./disposition.cjs');
const { CLAIM_MAP } = require('./profile-claims.cjs');
const { rulesFor } = require('./rules.cjs');
const { hoursFor } = require('./hours.cjs');

const docs = path.join(__dirname, '..', '..', '..', 'docs', 'pilot');
const flag = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const profiles = fs.readdirSync(path.join(docs, 'profiles')).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(docs, 'profiles', f), 'utf8')));
const triage = JSON.parse(fs.readFileSync(path.join(docs, 'review-triage.json'), 'utf8')).items;
const baseline = JSON.parse(fs.readFileSync(path.join(docs, 'baseline-claims.json'), 'utf8')).venues;
const sv = JSON.parse(fs.readFileSync(path.join(docs, 'semantic-verification.json'), 'utf8'));
const verdictOf = new Map(sv.items.map((i) => [i.id, i]));
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const route = new Map(triage.map((t) => [t.id, t]));

const rows = [];
for (const p of profiles) {
  const ruleFacts = new Set([...rulesFor(p), ...hoursFor(p)].map((r) => r.fact));
  for (const f of p.facts) {
    if (f.status !== 'review') continue;
    const id = `${p.id.replace('fp-google-', '')}:${f.sec}.${f.key}`;
    const t = route.get(id) ?? {};
    const fieldKey = `${f.sec}.${f.key}`;
    const dest = disposition(f, ruleFacts);
    const v = verdictOf.get(id);
    rows.push({ id, venue: p.name, venueId: p.id, field: fieldKey, text: f.text, value: f.value, sentence: norm(f.evidence?.quote), url: f.evidence?.url, held: Boolean(f.held), dest, impact: t.impact ?? 'high', route: t.route ?? 'individual', verdict: v ? { A: v.finalA ?? v.A, B: v.finalB ?? v.B } : null, ruleOrHours: ruleFacts.has(fieldKey), amended: Boolean(f.amended) });
  }
}

const stages = [];
let live = rows.slice();
const take = (name, why, pred) => { const flags = live.map((r) => pred(r)); const gone = live.filter((_, i) => flags[i]); live = live.filter((_, i) => !flags[i]); stages.push({ name, why, removed: gone.length, remaining: live.length, items: gone.map((r) => r.id) }); return gone; };

stages.push({ name: 'Held for a person', why: 'Everything the gate or an independent check would not accept on its own.', removed: 0, remaining: live.length, items: [] });
take('Parked: nothing in the app can hold it', 'No claim type, rule, hours or reviewed-data home. Approving it would publish nothing, so reviewing it now is wasted. It stays in the profile as a source note and is reviewed the day a field exists for it.', (r) => /^NO HOME|note only/.test(r.dest));

// merged: same venue + page + sentence as a kept item
const seen = new Map();
take('Merged: the same sentence already in the queue', 'One reading, one decision: a second proposal from the identical sentence on the identical page is decided with the first.', (r) => { const k = `${r.venueId}|${r.url}|${r.sentence}`; if (seen.has(k)) return true; seen.set(k, r.id); return false; });

// redundant with production
const claimValue = (r) => { const m = CLAIM_MAP[r.field]; return m ? m : r.field === 'transport.parking' ? ['familyFacilities.parking', r.value === 'no' ? 'no' : 'yes'] : null; };
take('Deferred: restates what production already serves', 'An active production claim for the same venue, field and value already says it. Production\'s own refresh keeps it current; a person adds nothing by approving a restatement.', (r) => { const m = claimValue(r); if (!m) return false; return (baseline[r.venueId] ?? []).some((c) => c.field === m[0] && String(c.value) === String(m[1])); });

take('Rejected: the evidence does not support it', 'Both independent verifiers found it unsupported, or a mechanical check failed. Not published; listed with the reason; a person can overturn it.', (r) => r.route === 'auto-reject' || (r.verdict && r.verdict.A === 'unsupported' && r.verdict.B === 'unsupported'));

const remaining = live;
const split = (pred) => remaining.filter(pred).length;
const ownerLevel = (r) => r.held || (r.ruleOrHours && /closure|restriction|hours|theatre|monday|lifts|mezzanine|steep|stale|height/.test(r.field)) || /^pricing\./.test(r.field);
const verified = (r) => r.verdict && r.verdict.A === 'supports' && r.verdict.B === 'supports';
const summary = {
  startedWith: rows.length,
  stages: stages.map(({ items, ...s }) => s),
  humanDecisions: remaining.length,
  of: {
    needExpertOrOwner: split(ownerLevel),
    standardReviewerQueue: split((r) => !ownerLevel(r) && r.impact === 'high'),
    lowImpactBatch: split((r) => !ownerLevel(r) && r.impact !== 'high'),
  },
  independentlyVerified: { bothSupport: split(verified), notBothSupport: split((r) => !verified(r)) },
  byDestination: remaining.reduce((m, r) => ((m[r.dest] = (m[r.dest] ?? 0) + 1), m), {}),
  pagesToOpen: new Set(remaining.map((r) => r.url)).size,
  withheld: stages.slice(1).map((s) => ({ stage: s.name, items: s.items })),
  remaining: remaining.map((r) => ({ id: r.id, venue: r.venue, field: r.field, dest: r.dest, impact: r.impact, owner: ownerLevel(r), verifiers: r.verdict })),
};
if (flag('--json')) fs.writeFileSync(flag('--json'), JSON.stringify(summary, null, 1) + '\n');
console.log(JSON.stringify({ startedWith: summary.startedWith, stages: summary.stages, humanDecisions: summary.humanDecisions, of: summary.of, independentlyVerified: summary.independentlyVerified, pagesToOpen: summary.pagesToOpen }, null, 1));
