#!/usr/bin/env node
/**
 * Build the pilot profiles from their authored facts and the pages they quote.
 *
 *   node scripts/pilot/build-profiles.cjs --pages /path/pages.json [--only science-museum] [--today 2026-10-08] [--out ../docs/pilot/profiles]
 *
 * For every fact with a sentence: the sentence must be found, whitespace-normalised, on a page of the venue's own site whose
 * address ends with the stated suffix. A sentence that is not found STOPS the build. A found sentence is then put through
 * the gate in profile-lib.cjs, which decides verified or review. Facts without a sentence stay hypothesis or unknown.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { gate, norm, SECTIONS } = require('./profile-lib.cjs');

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

const files = fs.readdirSync(path.join(__dirname, 'profiles')).filter((f) => f.endsWith('.cjs')).filter((f) => !only || f.startsWith(only));
let failures = 0;
const summary = [];
fs.mkdirSync(outDir, { recursive: true });

for (const file of files) {
  const src = require(path.join(__dirname, 'profiles', file));
  const venuePages = pages.filter((p) => p.venue === src.name);
  const built = [];
  for (const f of src.facts) {
    const out = { sec: f.sec, key: f.key, value: f.v ?? null, text: f.t };
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
      const hit = candidates.find((p) => norm(p.text).includes(norm(f.q)));
      if (!hit) {
        failures += 1;
        console.error(`NOT FOUND  ${src.name} ${f.sec}.${f.key}  suffix=${suffix}  pages=${candidates.length}\n    "${f.q.slice(0, 110)}"`);
        out.status = 'error';
        built.push(out);
        continue;
      }
      out.evidence = { url: hit.url, readAt: hit.readAt.slice(0, 10), quote: f.q, pageSha256: crypto.createHash('sha256').update(hit.text).digest('hex').slice(0, 16) };
      if ((f.st ?? 'fact') === 'fact') {
        const g = gate(f, { url: hit.url, readAt: hit.readAt.slice(0, 10) }, today);
        out.status = g.status;
        if (g.reasons.length) out.reviewReasons = g.reasons;
      } else {
        out.status = f.st; // a hypothesis keeps its basis sentence but is never shown as a fact
      }
    } else {
      out.status = f.st ?? 'unknown';
      if (out.status === 'fact') { failures += 1; console.error(`FACT WITHOUT SENTENCE ${src.name} ${f.sec}.${f.key}`); }
    }
    if (f.n) out.note = f.n;
    if (f.gap) out.gap = f.gap;
    if (f.conflict) out.conflict = f.conflict;
    built.push(out);
  }
  const counts = built.reduce((m, f) => ((m[f.status] = (m[f.status] ?? 0) + 1), m), {});
  const profile = { schemaVersion: 1, id: src.id, name: src.name, category: src.category, builtOn: today, counts, facts: built };
  fs.writeFileSync(path.join(outDir, file.replace(/\.cjs$/, '.json')), JSON.stringify(profile, null, 2) + '\n');
  summary.push({ name: src.name, ...counts });
}
console.table(summary);
if (failures) { console.error(`${failures} sentence(s) not found: fix the quote or the page suffix.`); process.exit(1); }
