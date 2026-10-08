#!/usr/bin/env node
/**
 * Does the independent check layer catch errors it was not written to look for? Seeded-error validation.
 *
 *   node scripts/pilot/review-seeded.cjs [--json docs/pilot/review-seeded.json]
 *
 * Takes every real accepted or proposed item, makes a copy with ONE realistic error put in, and asks whether the checks notice.
 * "Noticed" means at least a warning (so the item would reach a person); "stopped" means a failure (so it would be rejected
 * automatically). The error types are the ones a verbatim match cannot see: the right words about the wrong thing.
 *
 * It also reports the other side: of the REAL items, how many do the checks flag, so the cost of the checks is as visible as
 * their benefit. A check set that flags everything catches everything.
 */
const fs = require('node:fs');
const path = require('node:path');
const { runChecks, worst, venueIndex, MUST_MENTION, FOREIGN } = require('./review-checks.cjs');

const dir = path.join(__dirname, '..', '..', '..', 'docs', 'pilot', 'profiles');
const idx = venueIndex();
const profiles = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const real = [];
for (const p of profiles) for (const f of p.facts) if (f.status === 'verified' || f.status === 'review') real.push({ p, f, v: idx.get(p.id) });

const clone = (f) => JSON.parse(JSON.stringify(f));
const key = (f) => `${f.sec}.${f.key}`;
const otherFact = (p, f) => p.facts.find((g) => (g.status === 'verified' || g.status === 'review') && g.evidence && key(g) !== key(f) && g.evidence.quote !== f.evidence.quote);
const bump = (text) => {
  const m = text.match(/\d+(?:\.\d+)?/);
  return m ? text.replace(m[0], String(Math.round((Number(m[0]) + 3) * 100) / 100)) : null;
};

const GENERATORS = {
  'a figure changed (price, time or age)': ({ f }) => { const t = bump(f.text); if (!t) return null; const c = clone(f); c.text = t; return c; },
  'the quote is about a different facility': ({ p, f }) => {
    if (!MUST_MENTION[key(f)]) return null;
    const o = otherFact(p, f); if (!o || MUST_MENTION[key(f)].test(String(o.evidence.quote).toLowerCase())) return null;
    const c = clone(f); c.evidence = { ...c.evidence, quote: o.evidence.quote }; return c;
  },
  'the quote is from a different venue\'s site': ({ p, f }) => {
    const o = real.find((r) => r.p.id !== p.id && r.f.evidence && key(r.f) === key(f)) ?? real.find((r) => r.p.id !== p.id && r.f.evidence);
    if (!o) return null; const c = clone(f); c.evidence = { ...c.evidence, quote: o.f.evidence.quote, url: o.f.evidence.url }; return c;
  },
  'a yes became a no': ({ f }) => { if (f.value !== 'yes' || !MUST_MENTION[key(f)]) return null; const c = clone(f); c.value = 'no'; c.text = `No ${f.key}.`; return c; },
  'the quote names another site of the same operator': ({ p, f }) => {
    const names = FOREIGN[idx.get(p.id).slug] ?? []; if (!names.length) return null;
    const c = clone(f); c.evidence = { ...c.evidence, quote: `${c.evidence.quote} (at ${names[0]})` }; return c;
  },
  'the notice is out of date': ({ f }) => { const c = clone(f); c.evidence = { ...c.evidence, quote: `${c.evidence.quote} until July 2025` }; return c; },
  'the proposal claims more than the quote (listed words)': ({ f }) => { const c = clone(f); c.text = `${f.text} It is free and fully accessible throughout.`; return c; },
  'an invented count (digits)': ({ f }) => { const c = clone(f); c.text = `${f.text} There are about 40 of them.`; return c; },
  // HELD OUT: phrases chosen before looking at what the checks list, in words the over-reach check does NOT know. A check tuned to
  // its own test would score 100 here; this is the honest measure of how far it generalises.
  'the proposal adds a claim in words the checks do not list': ({ f, p }) => {
    const phrases = ['Suitable for babies from birth.', 'No booking is needed.', 'Dogs are welcome.', 'Staff will help carry buggies.', 'Quiet most mornings.'];
    const c = clone(f); c.text = `${f.text} ${phrases[(p.name.length + f.key.length) % phrases.length]}`; return c;
  },
  'the proposal is about something else': ({ p, f }) => { const o = otherFact(p, f); if (!o || o.sec === f.sec) return null; const c = clone(f); c.text = o.text; return c; },
};

const result = {};
for (const [name, make] of Object.entries(GENERATORS)) {
  let applicable = 0, noticed = 0, stopped = 0;
  const missed = [];
  for (const r of real) {
    const seeded = make(r);
    if (!seeded) continue;
    applicable += 1;
    // Credit only what the SEEDED error caused: a finding the real item did not already have. An item that was already doubted does not
    // count as having "caught" an error it was not asked about.
    const before = new Set(runChecks(r.f, r.v).filter((c) => c.level !== 'pass').map((c) => `${c.id}:${c.level}`));
    const added = runChecks(seeded, r.v).filter((c) => c.level !== 'pass' && !before.has(`${c.id}:${c.level}`));
    if (added.some((c) => c.level === 'fail')) { stopped += 1; noticed += 1; } else if (added.length) noticed += 1; else if (missed.length < 3) missed.push(`${r.p.name} ${key(r.f)}`);
  }
  result[name] = { applicable, noticed, stopped, noticedPct: applicable ? Math.round((noticed / applicable) * 100) : null, missedExamples: missed };
}
const flagged = { fail: 0, warn: 0, pass: 0 };
for (const r of real) flagged[worst(runChecks(r.f, r.v))] += 1;
const out = { builtOn: '2026-10-08', realItems: real.length, realFlagged: flagged, errorTypes: result };
if (process.argv.includes('--json')) fs.writeFileSync(process.argv[process.argv.indexOf('--json') + 1], JSON.stringify(out, null, 1));
console.log(`real items ${real.length}: ${flagged.pass} clean, ${flagged.warn} warned, ${flagged.fail} failed\n`);
for (const [n, r] of Object.entries(result)) console.log(`${String(r.noticedPct).padStart(4)}%  ${String(r.noticed).padStart(3)}/${String(r.applicable).padEnd(3)} (${r.stopped} stopped)  ${n}${r.missedExamples.length ? `   missed e.g. ${r.missedExamples[0]}` : ''}`);
