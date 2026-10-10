#!/usr/bin/env node
/**
 * Build the pilot profiles from their authored facts and the pages they quote.
 *
 *   node scripts/pilot/build-profiles.cjs --pages /path/pages.json [--only science-museum] [--today 2026-10-08] [--out ../docs/pilot/profiles]
 *
 * For every fact with a sentence: the sentence must be found, whitespace-normalised, on a page of the venue's own site whose
 * address ends with the stated suffix. A sentence that is not found STOPS the build. A found sentence is then put through
 * the gate in profile-lib.cjs, which decides verified or review, and (for a fact the gate would accept) the independent
 * checks in review-checks.cjs, which can send it to a person. Facts without a sentence stay hypothesis or unknown.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { gate, norm, SECTIONS } = require('./profile-lib.cjs');
const { runChecks, worst } = require('./review-checks.cjs');

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const pagesFile = flag('--pages');
const only = flag('--only');
const today = flag('--today', '2026-10-08');
const outDir = flag('--out', path.join(__dirname, '..', '..', '..', 'docs', 'pilot', 'profiles'));
if (!pagesFile) { console.error('--pages is required'); process.exit(2); }

// One or more page files, comma separated. Shapes: the runner's research.json ({venues:[...]}) or {pages:[...]} (flattened).
const pages = pagesFile.split(',').flatMap((file) => {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(raw.pages)
    ? raw.pages.filter((p) => p.text || p.fullText).map((p) => ({ venue: p.venue, url: p.url, title: p.title, readAt: p.read ?? p.readAt, text: p.text ?? p.fullText }))
    : raw.venues.flatMap((v) => v.pages.filter((p) => p.fullText).map((p) => ({ venue: v.name, url: p.url, title: p.title, readAt: p.readAt, text: p.fullText })));
});

// Amendments: where two blind semantic verifications (docs/pilot/SEMANTIC_VERIFICATION.md) found a proposal wider than the sentence
// recorded for it, the proposal is narrowed to what the sentence supports. The original wording is kept on the fact, so the change is
// auditable and nothing is silently rewritten.
const amendments = fs.existsSync(path.join(__dirname, 'profiles', 'amendments.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'profiles', 'amendments.json'), 'utf8')) : {};
// The record of the two blind semantic verifications. It is evidence, never an approval: it can only make an item need a person, or give
// the person something to read; it never publishes anything and never turns a held item into an accepted one.
const svFile = path.join(__dirname, '..', '..', '..', 'docs', 'pilot', 'semantic-verification.json');
const semantic = new Map((fs.existsSync(svFile) ? JSON.parse(fs.readFileSync(svFile, 'utf8')).items : []).map((i) => [i.id, i]));
const files = fs.readdirSync(path.join(__dirname, 'profiles')).filter((f) => f.endsWith('.cjs')).filter((f) => !only || f.startsWith(only));
let failures = 0;
const summary = [];
fs.mkdirSync(outDir, { recursive: true });

for (const file of files) {
  const src = require(path.join(__dirname, 'profiles', file));
  const venuePages = pages.filter((p) => p.venue === src.name);
  const built = [];
  for (const f0 of src.facts) {
    const amendment = amendments[`${file.replace(/\.cjs$/, '')}:${f0.sec}.${f0.key}`];
    const f = amendment ? { ...f0, t: amendment.text } : f0;
    const out = { sec: f.sec, key: f.key, value: f.v ?? null, text: f.t };
    if (amendment) out.amended = { from: f0.t, verdicts: amendment.verdicts };
    if (!SECTIONS.includes(f.sec)) throw new Error(`${file}: unknown section ${f.sec}`);
    if (f.kind) out.kind = f.kind;
    if (f.ages) { out.minMonths = f.ages[0]; out.maxMonthsExclusive = f.ages[1]; }
    if (f.label) out.label = f.label;
    if (f.scope) out.scope = f.scope;
    if (f.gtk) out.goodToKnow = true;
    if (f.held) out.held = true; // two official statements disagree: a person cannot approve either until the venue says which
    if (f.carried) {
      out.status = 'review';
      out.evidence = { url: f.carried.url, readAt: f.carried.readAt, quote: f.carried.quote, carriedFrom: f.carried.from };
      out.reviewReasons = ['carried from an earlier reading; today\'s page does not show the figure'];
    } else if (f.q) {
      const suffix = f.u ?? '';
      const candidates = venuePages.filter((p) => {
        const pathPart = p.url.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') || '/';
        return suffix === '/' ? pathPart === '/' || pathPart === '' : pathPart.replace(/\/$/, '').endsWith(suffix.replace(/\/$/, ''));
      });
      // A fact may rest on several sentences of the SAME page (`q` as an array): each is found verbatim on it, and the proposal may
      // use only what they say together. One sentence per fact is not required; the proposal being wider than its quotes is the
      // defect the independent checks look for (review-checks.cjs).
      const quotes = Array.isArray(f.q) ? f.q : [f.q];
      const hit = candidates.find((p) => quotes.every((q) => norm(p.text).includes(norm(q))));
      if (!hit) {
        failures += 1;
        console.error(`NOT FOUND  ${src.name} ${f.sec}.${f.key}  suffix=${suffix}  pages=${candidates.length}\n    "${quotes.map((q) => q.slice(0, 110)).join('" + "')}"`);
        out.status = 'error';
        built.push(out);
        continue;
      }
      out.evidence = { url: hit.url, readAt: hit.readAt.slice(0, 10), quote: quotes.join(' … '), ...(quotes.length > 1 ? { quotes } : {}), pageSha256: crypto.createHash('sha256').update(hit.text).digest('hex').slice(0, 16) };
      if ((f.st ?? 'fact') === 'fact') {
        const g = gate(f, { url: hit.url, readAt: hit.readAt.slice(0, 10) }, today);
        out.status = g.status;
        if (g.reasons.length) out.reviewReasons = g.reasons;
        // The independent checks run on every fact the gate would accept, and a fact that fails or is doubted by one is not accepted
        // without a person. The gate asks "is this the right KIND of fact"; these ask "does the evidence say what the proposal says".
        if (out.status === 'verified') {
          const found = runChecks({ ...out, evidence: out.evidence }, { slug: file.replace(/\.cjs$/, ''), site: src.site }).filter((c) => c.level !== 'pass');
          if (found.length) {
            out.status = 'review';
            out.reviewReasons = [...(out.reviewReasons ?? []), ...found.map((c) => `independent check (${c.id}): ${c.detail}`)];
          }
        }
      } else {
        out.status = f.st; // a hypothesis keeps its basis sentence but is never shown as a fact
      }
    } else {
      out.status = f.st ?? 'unknown';
      if (out.status === 'fact') { failures += 1; console.error(`FACT WITHOUT SENTENCE ${src.name} ${f.sec}.${f.key}`); }
    }
    const sv = semantic.get(`${src.id.replace('fp-google-', '')}:${f.sec}.${f.key}`);
    if (sv) {
      out.semantic = { A: sv.finalA, B: sv.finalB };
      if (out.status === 'verified' && !(sv.finalA === 'supports' && sv.finalB === 'supports')) {
        out.status = 'review';
        out.reviewReasons = [...(out.reviewReasons ?? []), `independent semantic verification: ${sv.finalA} / ${sv.finalB}, so the wording may go beyond the sentence`];
      }
    }
    if (f.n) out.note = f.n;
    if (f.gap) out.gap = f.gap;
    if (f.conflict) out.conflict = f.conflict;
    built.push(out);
  }
  const counts = built.reduce((m, f) => ((m[f.status] = (m[f.status] ?? 0) + 1), m), {});
  const profile = { schemaVersion: 1, id: src.id, name: src.name, category: src.category, builtOn: today, counts, ...(src.sources ? { sources: src.sources } : {}), facts: built };
  fs.writeFileSync(path.join(outDir, file.replace(/\.cjs$/, '.json')), JSON.stringify(profile, null, 2) + '\n');
  summary.push({ name: src.name, ...counts });
}
console.table(summary);
if (failures) { console.error(`${failures} sentence(s) not found: fix the quote or the page suffix.`); process.exit(1); }
