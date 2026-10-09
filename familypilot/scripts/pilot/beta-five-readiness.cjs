/**
 * The one deterministic readiness test for the first-beta venues.
 *
 * Question it answers: which review decisions are REQUIRED for five venues to reach "recommendation-ready", and why are the other
 * five not ready? Nothing here is a judgement call. The inputs are committed files (profiles, reconciliation CSV, baseline claims),
 * the rules are `readiness.cjs`, and the result is a pure function of them, so the same checkout always prints the same table.
 *
 *   Scope       the wave-1 safety cards plus the named cards in `NAMED_CARDS`. Nothing from waves 2 or 3 is assumed approved.
 *   Counting     "if approved" view: a card counts only on the assumption a person approves it. Adjacent facilities never count
 *                (a playground next to the venue is not the venue's playground).
 *   Necessity    `required` lists the cards without which the venue falls below recommendation-ready (leave-one-out), so every
 *                decision in the 21 is shown to be load-bearing for at least one venue, or flagged if it is not.
 *
 * Usage: node scripts/pilot/beta-five-readiness.cjs [--json]
 */
const fs = require('fs');
const path = require('path');
const { readiness } = require('./readiness.cjs');

const PILOT_DIR = path.join(__dirname, '..', '..', '..', 'docs', 'pilot');

/** The 12 non-wave-1 cards the five venues need, as `section.key` per venue name. */
const NAMED_CARDS = {
  'Horniman Museum and Gardens': ['transport.parking'],
  "Discover Children's Story Centre": ['pricing.paid', 'transport.parking', 'toilets.toilets'],
  'London Zoo': ['pricing.variable', 'transport.parking', 'activities.zootown', 'toilets.toilets'],
  'Science Museum': ['pricing.free', 'transport.parking', 'activities.the-garden', 'toilets.toilets'],
};

/**
 * What the provider layer and the main published claims already supply and the profiles do not carry. Stated here, not inferred,
 * so a reader can see every assumption the result rests on. Hours come from the provider layer except where it has none.
 */
const PROVIDER_HOURS = { 'Battersea Park': false };
const FREE_ADMISSION_PUBLISHED = new Set(['Royal Air Force Museum London', 'Horniman Museum and Gardens', 'Mudchute Park and Farm', 'Gunnersbury Park']);
const PUBLISHED_ACTIVITY = {
  "Discover Children's Story Centre": [{ sec: 'activities', key: 'baby-toddler-space', status: 'verified', kind: 'provision', minMonths: 0, maxMonthsExclusive: 36 }],
  'Babylon Park London': [{ sec: 'activities', key: 'soft-play', status: 'verified', kind: 'provision', minMonths: 12, maxMonthsExclusive: 48 }],
  'Battersea Park': [{ sec: 'activities', key: 'playground', status: 'verified', kind: 'provision', minMonths: 48, maxMonthsExclusive: 180 }],
};
/** Published venue-claim fields that map onto a readiness section/key. */
const FIELD = {
  'familyFacilities.toilets': ['toilets', 'toilets'],
  'familyFacilities.babyChanging': ['toilets', 'babyChanging'],
  'accessibility.accessibleToilet': ['toilets', 'accessibleToilet'],
  'familyFacilities.cafe': ['food', 'cafe'],
  'familyFacilities.playground': ['play', 'playground'],
  'familyFacilities.parking': ['transport', 'parking'],
  pushchairSuitability: ['pushchair', 'access'],
};

/** RFC 4180: quoted fields may hold commas, doubled quotes and newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

function load(dir = PILOT_DIR) {
  const baseline = JSON.parse(fs.readFileSync(path.join(dir, 'baseline-claims.json'), 'utf8')).venues;
  const profiles = fs.readdirSync(path.join(dir, 'profiles')).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, 'profiles', f), 'utf8')));
  const rows = parseCsv(fs.readFileSync(path.join(dir, 'reconciliation-171.csv'), 'utf8'));
  return { baseline, profiles, rows };
}

const cardId = (profile, f) => `${profile.id.replace('fp-google-', '')}:${f.sec}.${f.key}`;
const countable = (f) => f.value !== 'adjacent';

function publishedFacts(profile, baseline) {
  const facts = [];
  for (const c of baseline[profile.id] ?? []) {
    const m = FIELD[c.field];
    if (m) facts.push({ sec: m[0], key: m[1], status: 'verified' });
  }
  if (FREE_ADMISSION_PUBLISHED.has(profile.name)) facts.push({ sec: 'pricing', key: 'free', status: 'verified' });
  facts.push(...(PUBLISHED_ACTIVITY[profile.name] ?? []));
  return facts;
}

function evaluate(profile, ctx, approvedCards) {
  const rowOf = new Map(ctx.rows.map((r) => [r.id, r]));
  const facts = publishedFacts(profile, ctx.baseline);
  for (const f of profile.facts) {
    if (!countable(f)) continue;
    const id = cardId(profile, f);
    const row = rowOf.get(id);
    // Already verified in the profile and not waiting on a decision: counts as published.
    if (f.status === 'verified' && (!row || row.tier === 'deferred')) { facts.push(f); continue; }
    if (approvedCards.has(id)) facts.push({ ...f, status: 'review' });
  }
  return readiness(facts, { view: 'approved', layerA: { hours: PROVIDER_HOURS[profile.name] ?? true } });
}

function betaFiveReadiness(dir = PILOT_DIR) {
  const ctx = load(dir);
  const profileById = new Map(ctx.profiles.map((p) => [p.id.replace('fp-google-', ''), p]));
  const wave1 = ctx.rows.filter((r) => r.wave === '1 safety').map((r) => r.id);

  const named = [];
  for (const p of ctx.profiles) {
    for (const key of NAMED_CARDS[p.name] ?? []) {
      const f = p.facts.find((x) => `${x.sec}.${x.key}` === key);
      if (!f) throw new Error(`named card ${p.name} ${key} not in profile`);
      named.push(cardId(p, f));
    }
  }
  const approved = new Set([...wave1, ...named]);

  const venues = ctx.profiles.map((p) => {
    const result = evaluate(p, ctx, approved);
    const mine = [...approved].filter((id) => id.startsWith(`${p.id.replace('fp-google-', '')}:`)).sort();
    const required = result.level === 'discoverable' ? [] : mine.filter((id) => {
      const rest = new Set(approved); rest.delete(id);
      return evaluate(p, ctx, rest).level === 'discoverable';
    });
    return { name: p.name, level: result.level, ready: result.level !== 'discoverable', cards: mine, required, missing: result.missing };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const needed = new Set(venues.flatMap((v) => v.required));
  return {
    decisions: [...approved].sort(),
    wave1: wave1.slice().sort(),
    named: named.slice().sort(),
    notLoadBearing: [...approved].filter((id) => !needed.has(id)).sort(),
    venues,
    profileCount: profileById.size,
  };
}

module.exports = { betaFiveReadiness, parseCsv, NAMED_CARDS };

if (require.main === module) {
  const out = betaFiveReadiness();
  if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`${out.decisions.length} decisions (${out.wave1.length} wave-1 safety + ${out.named.length} named)`);
    for (const v of out.venues) {
      console.log(`\n${v.ready ? 'READY    ' : 'NOT READY'} ${v.name}`);
      if (v.ready) { console.log(`  decisions: ${v.cards.length}; load-bearing: ${v.required.join(', ') || 'none (ready without them)'}`); }
      else console.log(`  missing: ${v.missing.join(', ')}`);
    }
    if (out.notLoadBearing.length) console.log(`\nDecisions no venue's readiness depends on: ${out.notLoadBearing.join(', ')}`);
  }
}
