#!/usr/bin/env node
/**
 * Routes every accepted or proposed item to the cheapest safe kind of attention, using checks that do not trust the author.
 *
 *   node scripts/pilot/review-triage.cjs [--json docs/pilot/review-triage.json] [--md docs/pilot/REVIEW_TRIAGE.md]
 *                                        [--pack /local/path/pack.json --pages pages.json,gap.json] [--seed 7]
 *
 * ROUTES
 *   auto-reject         an independent check FAILED: the proposal is unsupported by its own evidence. Not published, listed with
 *                       the reason, and a person can overturn it (reversible).
 *   individual          a person reads the item alone: it can exclude or mislead (price, accessibility, negative, age-bearing,
 *                       a conflict, a part-of-venue claim, a rule or hours reading that can refuse a date or a household), or a
 *                       check WARNED, or it is held.
 *   batch               low-impact, every check passed, equivalent to others: decided as a group, after the group's sample items
 *                       (one in five, at least one) have been read individually. If any sampled item is rejected the whole
 *                       group becomes individual.
 *   accepted            the gate accepted it and every check passed.
 *   accepted-spot-check the same, picked (deterministically, one in ten, at least one per venue) to be read anyway, because an
 *                       automatic acceptance nobody ever looks at is not a control.
 *
 * Workload figures are MODELLED from words to read, not measured. Measured time needs a person at the review pack (see
 * docs/pilot/REVIEW_PROCESS.md for the protocol); nothing should be forecast for 50 or 700 venues from the model.
 */
const fs = require('node:fs');
const path = require('node:path');
const { runChecks, worst, venueIndex, norm } = require('./review-checks.cjs');
const { sha } = require('./review-audit.cjs');
const { rulesFor } = require('./rules.cjs');
const { hoursFor } = require('./hours.cjs');

const args = process.argv.slice(2);
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const seed = flag('--seed') ?? '7';
const dir = path.join(__dirname, '..', '..', '..', 'docs', 'pilot');
const idx = venueIndex();
const profiles = fs.readdirSync(path.join(dir, 'profiles')).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, 'profiles', f), 'utf8')));

const WORDS_PER_SECOND = 3.5;
const DECISION_SECONDS = 6;
const GLANCE_SECONDS = 2; // an item decided with its group, read in passing
const GROUP_OVERHEAD_SECONDS = 10;
const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;

const HIGH_REASON = /negative claim|accessibility claim|price or a free-entry|says who a place is for|conflicts with|applies to part of the venue/;
const HIGH_SEC = new Set(['access', 'pricing']);
const HIGH_KEY = /closure|restriction|theatre|monday|lifts|stale/;

const items = [];
for (const p of profiles) {
  const v = idx.get(p.id);
  const gateFacts = new Set([...rulesFor(p), ...hoursFor(p)].map((r) => r.fact));
  for (const f of p.facts) {
    if (f.status !== 'verified' && f.status !== 'review') continue;
    const checks = runChecks(f, v);
    const level = worst(checks);
    const fieldKey = `${f.sec}.${f.key}`;
    const reasons = (f.reviewReasons ?? []);
    const high = Boolean(f.held) || HIGH_SEC.has(f.sec) || HIGH_KEY.test(f.key) || gateFacts.has(fieldKey) || reasons.some((r) => HIGH_REASON.test(r));
    let route;
    if (f.status === 'review') route = level === 'fail' ? 'auto-reject' : high || level === 'warn' ? 'individual' : 'batch';
    else route = level === 'pass' ? 'accepted' : 'individual';
    items.push({
      id: `${p.id.replace('fp-google-', '')}:${fieldKey}`, venueId: p.id, venue: p.name, field: fieldKey, status: f.status, route, impact: high ? 'high' : 'low',
      proposed: f.text, value: f.value ?? null, quote: f.evidence?.quote, url: f.evidence?.url, readOn: f.evidence?.readAt,
      reasons, held: Boolean(f.held), findings: checks.filter((c) => c.level !== 'pass').map((c) => ({ id: c.id, level: c.level, detail: c.detail })),
      words: words(f.evidence?.quote) + words(f.text) + words(reasons.join(' ')),
    });
  }
}

// Spot checks of the automatic acceptances: deterministic, one in ten, at least one per venue.
const accepted = items.filter((i) => i.route === 'accepted');
const need = Math.max(Math.ceil(accepted.length / 10), new Set(accepted.map((i) => i.venue)).size);
const pickedIds = new Set();
for (const venue of new Set(accepted.map((i) => i.venue))) {
  pickedIds.add(accepted.filter((i) => i.venue === venue).sort((a, b) => sha(a.id + seed).localeCompare(sha(b.id + seed)))[0].id);
}
for (const i of [...accepted].sort((a, b) => sha(a.id + seed).localeCompare(sha(b.id + seed)))) if (pickedIds.size < need) pickedIds.add(i.id);
for (const i of items) if (pickedIds.has(i.id)) i.route = 'accepted-spot-check';

// Batch groups: equivalent items across venues, each with its sample.
const groups = new Map();
for (const i of items.filter((x) => x.route === 'batch')) {
  // Equivalent means the same kind of statement: a yes/no fact groups by its answer; a free-text value (a station, a surface) by field only.
  const key = `${i.field}|${i.value === 'yes' || i.value === 'no' ? i.value : '*'}`;
  (groups.get(key) ?? groups.set(key, []).get(key)).push(i);
}
const batchGroups = [...groups.entries()].map(([key, members]) => {
  const sorted = [...members].sort((a, b) => sha(a.id + seed).localeCompare(sha(b.id + seed)));
  const sampleSize = Math.max(1, Math.ceil(members.length / 5));
  const sample = sorted.slice(0, sampleSize).map((m) => m.id);
  members.forEach((m) => { m.batchGroup = key; m.inSample = sample.includes(m.id); });
  return { key, field: members[0].field, value: members[0].value, size: members.length, sample, members: members.map((m) => m.id) };
});
// A group of one is not a batch: it is read alone.
for (const g of batchGroups.filter((g) => g.size === 1)) {
  const item = items.find((i) => i.id === g.members[0]);
  item.route = 'individual'; delete item.batchGroup; delete item.inSample;
}
const realGroups = batchGroups.filter((g) => g.size > 1);

const itemSeconds = (i) => i.words / WORDS_PER_SECOND + DECISION_SECONDS;
const review = items.filter((i) => i.status === 'review');
const baselineSeconds = review.reduce((s, i) => s + itemSeconds(i), 0);
let triageSeconds = 0;
for (const i of items) {
  if (i.route === 'individual' || i.route === 'accepted-spot-check') triageSeconds += itemSeconds(i);
  else if (i.route === 'batch') triageSeconds += i.inSample ? itemSeconds(i) : GLANCE_SECONDS;
  else if (i.route === 'auto-reject') triageSeconds += GLANCE_SECONDS;
}
triageSeconds += realGroups.length * GROUP_OVERHEAD_SECONDS;

const count = (r) => items.filter((i) => i.route === r).length;
const summary = {
  builtOn: '2026-10-08', seed, items: items.length, reviewItems: review.length,
  routes: { 'auto-reject': count('auto-reject'), individual: count('individual'), batch: count('batch'), accepted: count('accepted'), 'accepted-spot-check': count('accepted-spot-check') },
  batchGroups: realGroups.length, batchGroupSizes: realGroups.map((g) => g.size).sort((a, b) => b - a),
  modelled: { assumptions: { WORDS_PER_SECOND, DECISION_SECONDS, GLANCE_SECONDS, GROUP_OVERHEAD_SECONDS }, allItemsOneByOneMinutes: +(baselineSeconds / 60).toFixed(1), triageMinutes: +(triageSeconds / 60).toFixed(1), note: 'Modelled from words to read. Not measured.' },
};

const pages = new Map();
for (const i of items) { const k = `${i.venue}|${i.url}`; (pages.get(k) ?? pages.set(k, []).get(k)).push(i.id); }
summary.pagesToOpen = { forEveryReviewItem: new Set(review.map((i) => i.url)).size, forTheTargetedQueue: new Set(items.filter((i) => ['individual', 'accepted-spot-check'].includes(i.route)).map((i) => i.url)).size };

if (flag('--json')) fs.writeFileSync(flag('--json'), JSON.stringify({ summary, batchGroups: realGroups, items }, null, 1));

if (flag('--pack')) {
  // LOCAL ONLY: carries the surrounding words from the venues' pages, which stay out of the repository.
  const pageFiles = (flag('--pages') ?? '').split(',').filter(Boolean);
  const texts = pageFiles.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).pages.filter((p) => p.text).map((p) => ({ venue: p.venue, url: p.url.replace(/\/$/, ''), text: p.text })));
  const around = (i) => {
    const page = texts.find((p) => p.venue === i.venue && p.url === String(i.url).replace(/\/$/, ''));
    if (!page) return null;
    const t = page.text.replace(/\s+/g, ' ');
    const first = String(i.quote).split(' … ')[0];
    const at = t.toLowerCase().indexOf(norm(first).slice(0, 60));
    if (at < 0) return null;
    return { before: t.slice(Math.max(0, at - 260), at), quote: t.slice(at, at + first.length), after: t.slice(at + first.length, at + first.length + 260) };
  };
  const queue = items.filter((i) => i.route !== 'accepted').map((i) => ({ ...i, context: around(i) }));
  fs.writeFileSync(flag('--pack'), JSON.stringify({ summary, batchGroups: realGroups, queue }, null, 1));
}

// ---- the readable report
const out = [];
const w = (s = '') => out.push(s);
w('# Review triage: where a person\'s time goes');
w();
w('Generated by `scripts/pilot/review-triage.cjs`. Every figure of **time** below is modelled from words to read; none is measured.');
w();
w(`| Route | Items | What happens |`);
w(`|---|---|---|`);
const WHAT = {
  'auto-reject': 'An independent check failed. Not published; listed with the reason; a person can overturn it.',
  individual: 'A person reads it alone, with the quote in its page context.',
  batch: 'Decided with equivalent items after a sample of each group is read.',
  accepted: 'Accepted by the gate and every independent check.',
  'accepted-spot-check': 'Accepted the same way, and read anyway (one in ten, at least one per venue).',
};
for (const r of ['auto-reject', 'individual', 'batch', 'accepted', 'accepted-spot-check']) w(`| ${r} | ${summary.routes[r]} | ${WHAT[r]} |`);
w();
w(`${items.length} items (${review.length} proposed, ${items.length - review.length} accepted). ${realGroups.length} batch groups (sizes ${summary.batchGroupSizes.join(', ') || 'none'}).`);
w();
w('## Modelled workload');
w();
w(`Reading every proposed item one at a time: **${summary.modelled.allItemsOneByOneMinutes} minutes**. With triage (individual items and spot-checks read in full, batch groups by sample, rejections glanced at): **${summary.modelled.triageMinutes} minutes**. Source pages to open: ${summary.pagesToOpen.forEveryReviewItem} for every proposed item, ${summary.pagesToOpen.forTheTargetedQueue} for the targeted queue.`);
w();
w(`Triage does not make this queue faster, and it was not built to: ${items.filter((i) => i.status === 'review' && i.impact === 'high').length} of the ${review.length} proposed items are high-impact by design (prices, accessibility, negatives, ages, rules and conflicts are where a wrong "yes" costs a family a wasted journey), and ${items.filter((i) => i.status === 'review' && i.impact === 'low' && !i.findings.length).length} are low-impact and clean. What it adds is control: every automatic acceptance has a chance of being read, every item an independent check doubts is routed to a person with the reason, and unsupported proposals are stopped before anyone reads them. The honest answer to "how long will 50 venues take" is: unknown until a person has worked a real session with the timers on.`);
w();
w('## Batch groups');
w();
w('| Equivalent items | Size | Sample read first |');
w('|---|---|---|');
for (const g of realGroups.sort((a, b) => b.size - a.size)) w(`| ${g.field}${g.value === 'yes' || g.value === 'no' ? ` = ${g.value}` : ''} | ${g.size} | ${g.sample.length} |`);
if (!realGroups.length) w('| (none) | | |');
w();
w('## Items an independent check flagged');
w();
w('| Venue | Item | Route | Finding |');
w('|---|---|---|---|');
for (const i of items.filter((x) => x.findings.length)) w(`| ${i.venue} | ${i.field} | ${i.route} | ${i.findings.map((f) => `${f.id}: ${f.detail}`).join('; ')} |`);
if (flag('--md')) fs.writeFileSync(flag('--md'), out.join('\n') + '\n');
console.log(JSON.stringify(summary, null, 1));
