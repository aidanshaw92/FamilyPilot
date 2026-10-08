#!/usr/bin/env node
/**
 * The reviewer workflow: who decides what, how many decisions that is, and a session a real person can run and time.
 *
 *   node scripts/pilot/review-workflow.cjs --json ../docs/pilot/review-workflow.json
 *   node scripts/pilot/review-workflow.cjs --pack-in /local/full-pack.json --role reviewer|expert --out /local/pack.json --manifest /local/manifest.json
 *
 * THE RULES THIS ENCODES
 *   1. A person decides every fact that could be published. There is no "accepted without a person" tier: the earlier 72 automatic
 *      acceptances are now low-risk grouped decisions with a sample read first.
 *   2. A model reading is a FLAG for the person, never evidence. Two models agreeing proves nothing: in the blind verification 48 of
 *      170 quote-matching items went beyond their quote. A flag moves an item UP a tier; nothing a model says moves one down or out.
 *   3. Only a mechanical failure removes an item from the human queue as unsupported (a number the quote lacks, a page that is not
 *      the venue's), and only into a visible, reversible reject list. An item no field can hold is parked, a duplicate merged, a
 *      restatement of an active production claim deferred: none of those publishes anything.
 *   4. The source context stays on every card: the venue's own words, in the words around them, with the page to open.
 *
 * TIERS (for what is left)
 *   expert    can refuse a date or a household, contradict a provider, put a price in front of a parent, or hide a venue by a "no" on
 *             access: venue rules, official hours, pricing, held items, access-bearing negatives
 *   reviewer  a wrong "yes" costs a family a wasted journey: any other high-impact item, any "no", anything an independent check
 *             warned about, anything a model flagged or that was narrowed because it went beyond its quote
 *   grouped   low-impact, clean, equivalent to others (a plain "yes" for toilets, café, playground...): decided as a group after a
 *             sample of the group is read (one in five, at least three); a rejected sample makes the whole group individual
 */
const fs = require('node:fs');
const path = require('node:path');
const { disposition } = require('./disposition.cjs');
const { CLAIM_MAP } = require('./profile-claims.cjs');
const { rulesFor } = require('./rules.cjs');
const { hoursFor } = require('./hours.cjs');
const { sha } = require('./review-audit.cjs');

const docs = path.join(__dirname, '..', '..', '..', 'docs', 'pilot');
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Fields where a wrong "no" removes a venue from a household's day, or a wrong "yes" misleads someone who cannot easily recover. */
const ACCESS_FIELD = /^(access|pushchair)\.|^toilets\.(accessibleToilet|changingPlaces)$|^transport\.blueBadge$/;

/**
 * Can this rule refuse a date or a household by itself? A whole-venue closure, a restriction that covers the core visit, a whole-venue
 * pushchair rule. A closure of one area, a caution, a booking note and a step-free gap in one part of a site inform; they never refuse.
 */
const refusesAlone = (rule) =>
  (rule.kind === 'closure' && rule.scope === 'venue') ||
  ((rule.kind === 'pushchair' || rule.kind === 'step_free') && (rule.coversCoreVisit === true || rule.scope === 'venue'));

/** Why an item needs an expert, as words on the card. Empty: it does not. */
function expertReasons(it) {
  const why = [];
  if (it.held) why.push('two sources disagree, or it was carried from an earlier reading');
  if (it.refusingRule) why.push('a whole-venue closure or a restriction on the core visit: it can refuse a date or a household');
  if (it.hours) why.push('an official-hours reading: it can contradict the provider\'s hours');
  if (/^pricing\./.test(it.field)) why.push('a price or entry fact in front of a parent');
  if (ACCESS_FIELD.test(it.field) && String(it.value) === 'no') why.push('a "no" on access can take a venue out of a household\'s day');
  return [...new Set(why)];
}

function reviewerReasons(it) {
  const why = [];
  if (it.ruleOrHours && !it.refusingRule && !it.hours) why.push('a rule that informs (an area closure, a caution, a booking note): it cannot refuse a date or a household on its own');
  if (it.impact === 'high') why.push('high impact: a wrong "yes" costs a family a wasted journey');
  if (String(it.value) === 'no') why.push('a "no" can hide a venue');
  if (it.findings?.length) why.push('an independent check doubted it');
  if (it.modelFlag) why.push('a model reading flagged it (a flag for you, not evidence)');
  if (it.amended) why.push('narrowed to what its sentence supports');
  return why;
}

/** The only function that assigns a tier. Pure, so it is tested. */
function classify(it) {
  if (/^NO HOME|note only/.test(it.dest)) return { tier: 'parked', why: ['nothing in the app can hold it yet'] };
  if (it.duplicateOf) return { tier: 'merged', why: [`the same sentence as ${it.duplicateOf}`] };
  if (it.restatesProduction) return { tier: 'deferred', why: ['production already serves this value from an active claim'] };
  if (it.route === 'auto-reject') return { tier: 'rejected', why: ['an independent check failed: the proposal is unsupported by its own evidence'] };
  const e = expertReasons(it);
  if (e.length) return { tier: 'expert', why: e };
  const r = reviewerReasons(it);
  if (r.length) return { tier: 'reviewer', why: r };
  return { tier: 'grouped', why: ['low impact, every independent check passed, equivalent to others'] };
}

function build() {
  const profiles = fs.readdirSync(path.join(docs, 'profiles')).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(docs, 'profiles', f), 'utf8')));
  const triage = new Map(JSON.parse(fs.readFileSync(path.join(docs, 'review-triage.json'), 'utf8')).items.map((t) => [t.id, t]));
  const baseline = JSON.parse(fs.readFileSync(path.join(docs, 'baseline-claims.json'), 'utf8')).venues;
  const sv = new Map(JSON.parse(fs.readFileSync(path.join(docs, 'semantic-verification.json'), 'utf8')).items.map((i) => [i.id, i]));
  const rows = [];
  const seenSentence = new Map();
  for (const p of profiles) {
    const rules = rulesFor(p);
    const hours = hoursFor(p);
    const ruleFacts = new Set([...rules, ...hours].map((r) => r.fact));
    for (const f of p.facts) {
      if (f.status !== 'verified' && f.status !== 'review') continue;
      const field = `${f.sec}.${f.key}`;
      const id = `${p.id.replace('fp-google-', '')}:${field}`;
      const t = triage.get(id) ?? {};
      const v = sv.get(id);
      const verdict = v ? [v.finalA ?? v.A, v.finalB ?? v.B] : f.semantic ? [f.semantic.A, f.semantic.B] : null;
      const sentence = `${p.id}|${f.evidence?.url}|${norm(f.evidence?.quote)}`;
      const duplicateOf = seenSentence.get(sentence);
      if (!duplicateOf) seenSentence.set(sentence, id);
      const m = CLAIM_MAP[field] ?? (field === 'transport.parking' ? ['familyFacilities.parking', f.value === 'no' ? 'no' : 'yes'] : null);
      const restatesProduction = Boolean(m && (baseline[p.id] ?? []).some((c) => c.field === m[0] && String(c.value) === String(m[1])));
      const it = {
        id, venue: p.name, venueId: p.id, field, value: f.value ?? null, text: f.text, url: f.evidence?.url,
        previouslyAutomatic: f.status === 'verified', held: Boolean(f.held), ruleOrHours: ruleFacts.has(field),
        refusingRule: rules.some((r) => r.fact === field && refusesAlone(r.rule)), hours: hours.some((h) => h.fact === field),
        impact: t.impact ?? 'high', route: t.route ?? 'individual', findings: t.findings ?? [], dest: disposition(f, ruleFacts),
        // A flag exists when the two readings were not both "supports", or when the proposal had to be narrowed. Agreement is not a clearance.
        modelFlag: Boolean(verdict && !(verdict[0] === 'supports' && verdict[1] === 'supports')),
        modelReadings: verdict, amended: Boolean(f.amended), duplicateOf, restatesProduction,
      };
      Object.assign(it, classify(it));
      rows.push(it);
    }
  }
  return rows;
}

/** Equivalent low-risk items, grouped by what they claim; a group of three or fewer is read item by item. */
function groupsOf(rows, seed = '7') {
  const g = new Map();
  for (const it of rows.filter((r) => r.tier === 'grouped')) {
    const key = `${it.field}|${it.value === 'yes' || it.value === 'no' ? it.value : '*'}`;
    (g.get(key) ?? g.set(key, []).get(key)).push(it);
  }
  const groups = [];
  const alone = [];
  for (const [key, members] of g) {
    if (members.length <= 3) { alone.push(...members); continue; }
    const sorted = [...members].sort((a, b) => sha(a.id + seed).localeCompare(sha(b.id + seed)));
    const sampleSize = Math.min(members.length, Math.max(3, Math.ceil(members.length / 5)));
    groups.push({ key, size: members.length, sample: sorted.slice(0, sampleSize).map((m) => m.id), members: members.map((m) => m.id) });
  }
  return { groups, alone };
}

function summarise(rows) {
  const by = (t) => rows.filter((r) => r.tier === t);
  const { groups, alone } = groupsOf(rows);
  const groupedReads = groups.reduce((n, g) => n + g.sample.length, 0) + alone.length;
  const humanReads = by('expert').length + by('reviewer').length + groupedReads;
  return {
    items: rows.length,
    removedFromQueue: { parked: by('parked').length, merged: by('merged').length, deferred: by('deferred').length, rejected: by('rejected').length },
    tiers: { expert: by('expert').length, reviewer: by('reviewer').length, grouped: by('grouped').length },
    grouped: { groups: groups.length, groupSizes: groups.map((g) => g.size).sort((a, b) => b - a), sampleReads: groups.reduce((n, g) => n + g.sample.length, 0), readIndividually: alone.length, groupApprovals: groups.length },
    humanDecisions: { expertReads: by('expert').length, reviewerReads: by('reviewer').length, groupedReads, groupApprovals: groups.length, totalReads: humanReads, totalDecisions: humanReads + groups.length },
    previouslyAutomaticNowDecidedByAPerson: rows.filter((r) => r.previouslyAutomatic && ['expert', 'reviewer', 'grouped'].includes(r.tier)).length,
    modelFlagged: { inQueue: rows.filter((r) => r.modelFlag && ['expert', 'reviewer', 'grouped'].includes(r.tier)).length, movedUpBecauseOfIt: rows.filter((r) => r.tier === 'reviewer' && r.modelFlag && !r.findings.length && r.impact !== 'high' && String(r.value) !== 'no').length },
    byExpertReason: Object.fromEntries([...by('expert').flatMap((r) => r.why)].reduce((m, w) => m.set(w, (m.get(w) ?? 0) + 1), new Map())),
    pages: new Set(rows.filter((r) => ['expert', 'reviewer', 'grouped'].includes(r.tier)).map((r) => r.url)).size,
  };
}

// ---- session pack ---------------------------------------------------------------------------------------------------------
/** Realistic errors for the hidden controls: ones the checks do not flag, so only reading the card catches them. */
const CONTROL_ERRORS = [
  { kind: 'adds a claim in ordinary words', make: (i) => ({ proposed: `${i.proposed} Suitable for babies from birth.` }) },
  { kind: 'adds a claim in ordinary words', make: (i) => ({ proposed: `${i.proposed} No booking is needed.` }) },
  { kind: 'yes became no', make: (i) => (i.value === 'yes' && /\b(is|are)\b/i.test(i.proposed) ? { value: 'no', proposed: i.proposed.replace(/\b(is|are)\b/i, '$1 not') } : null) },
  { kind: 'a figure changed', make: (i) => { const m = String(i.proposed).match(/\d+(?:\.\d+)?/); return m ? { proposed: i.proposed.replace(m[0], String(Math.round((Number(m[0]) + 3) * 100) / 100)) } : null; } },
];

function sessionPack(rows, fullPack, role, seed = '7') {
  const byId = new Map(fullPack.queue.map((q) => [q.id, q]));
  const pick = (list, n) => [...list].sort((a, b) => sha(a.id + seed).localeCompare(sha(b.id + seed))).slice(0, n);
  const spread = (list, n) => { // as many different venues as possible
    const seen = new Set(); const out = [];
    for (const it of [...list].sort((a, b) => sha(a.id + seed).localeCompare(sha(b.id + seed)))) { if (out.length >= n) break; if (!seen.has(it.venue)) { seen.add(it.venue); out.push(it); } }
    for (const it of list) { if (out.length >= n) break; if (!out.includes(it)) out.push(it); }
    return out;
  };
  const manifest = { role, seed, tierOf: {}, controls: {} };
  let chosen = [];
  let batchGroups = [];
  if (role === 'expert') {
    const expert = rows.filter((r) => r.tier === 'expert');
    // One of each kind of expert reason first, then fill.
    const kinds = new Map();
    for (const it of expert) { const k = it.why[0]; (kinds.get(k) ?? kinds.set(k, []).get(k)).push(it); }
    const first = [...kinds.values()].map((list) => pick(list, 1)[0]);
    chosen = [...first, ...pick(expert.filter((r) => !first.includes(r)), Math.max(0, 12 - first.length))].slice(0, 12);
  } else {
    chosen = spread(rows.filter((r) => r.tier === 'reviewer'), 14);
    const { groups } = groupsOf(rows);
    const two = groups.sort((a, b) => b.size - a.size).slice(0, 2);
    batchGroups = two;
    for (const g of two) chosen.push(...g.sample.map((id) => rows.find((r) => r.id === id)));
    const [firstMember] = two.flatMap((g) => g.members.filter((m) => !g.sample.includes(m)));
    void firstMember;
  }
  const queue = [];
  for (const it of chosen) {
    const q = byId.get(it.id);
    if (!q) continue;
    const group = batchGroups.find((g) => g.members.includes(it.id));
    queue.push({
      ...q, route: group ? 'batch' : 'individual', tier: it.tier, tierLabel: { expert: 'Expert decision', reviewer: 'Trained reviewer', grouped: 'Grouped, low risk' }[it.tier],
      reasons: [...it.why, ...(q.reasons ?? []).filter((r) => !/^independent/.test(r))].filter((r, i, a) => a.indexOf(r) === i),
      ...(group ? { batchGroup: group.key, inSample: group.sample.includes(it.id) } : {}),
    });
    manifest.tierOf[it.id] = it.tier;
  }
  if (role !== 'expert') {
    // Hidden controls: real items with one error in the proposal, indistinguishable on the card. They measure whether the reading catches errors.
    const pool = rows.filter((r) => r.tier === 'reviewer' && !queue.some((q) => q.id === r.id));
    let n = 0;
    for (const err of CONTROL_ERRORS) {
      const base = pick(pool.filter((r) => byId.has(r.id) && err.make(byId.get(r.id)) && !manifest.controls[`ctl:${r.id}`]), 1)[0];
      if (!base) continue;
      const original = byId.get(base.id);
      const changed = err.make(original);
      const id = `ctl:${base.id}`;
      queue.push({ ...original, ...changed, id, route: 'individual', tier: 'reviewer', tierLabel: 'Trained reviewer', findings: [], reasons: ['high impact: a wrong "yes" costs a family a wasted journey'] });
      manifest.controls[id] = { kind: err.kind, realItem: base.id };
      n += 1;
    }
    void n;
  }
  // Shuffle with a fixed seed so controls are not last, then number the cards.
  queue.sort((a, b) => sha(a.id + seed + 'order').localeCompare(sha(b.id + seed + 'order')));
  return { pack: { summary: fullPack.summary, batchGroups: batchGroups.map((g) => ({ key: g.key, field: g.key.split('|')[0], value: g.key.split('|')[1], size: g.size, sample: g.sample, members: g.members })), queue }, manifest };
}

module.exports = { classify, expertReasons, reviewerReasons, build, groupsOf, summarise, sessionPack, CONTROL_ERRORS };

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
  const rows = build();
  if (flag('--pack-in')) {
    const role = flag('--role') === 'expert' ? 'expert' : 'reviewer';
    const { pack, manifest } = sessionPack(rows, JSON.parse(fs.readFileSync(flag('--pack-in'), 'utf8')), role, flag('--seed') ?? '7');
    fs.writeFileSync(flag('--out'), JSON.stringify(pack, null, 1));
    fs.writeFileSync(flag('--manifest'), JSON.stringify(manifest, null, 1));
    console.log(`${role}: ${pack.queue.length} cards (${Object.keys(manifest.controls).length} hidden controls); manifest ${flag('--manifest')}`);
  } else {
    const summary = summarise(rows);
    if (flag('--json')) fs.writeFileSync(flag('--json'), JSON.stringify({ builtOn: '2026-10-08', summary, groups: groupsOf(rows).groups, items: rows.map(({ modelReadings, ...r }) => ({ ...r, modelReadings })) }, null, 1) + '\n');
    console.log(JSON.stringify(summary, null, 1));
  }
}
