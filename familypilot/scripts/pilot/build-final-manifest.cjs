#!/usr/bin/env node
/**
 * Builds the FINAL publishing manifest from the owner's decisions. It writes files only: no database, no provider, nothing published.
 *
 *   node scripts/pilot/build-final-manifest.cjs --ab docs/pilot/beta/decisions/audit-packAB.jsonl \
 *        --c <Pack C review-decisions.jsonl> --key docs/pilot/beta/decisions/packC-scoring-key.json \
 *        --approver human:<name> --review-basis "<text>" --out-dir <dir> [--as-of YYYY-MM-DD] [--drop-rules museum-closed-mondays]
 *
 * Refuses (no manifest) if Pack C does not meet its quality bar: at least 3 of the 4 planted controls caught. Otherwise writes:
 *   MANIFEST.md             the owner's one-page read: (1) human-approved claims, (2) pricing and activity code changes, (3) unresolved or
 *                           unsupported items, (4) the expected live readiness of each of the five venues, and the review basis
 *   claims/apply.sql, claims/rollback.sql, claims/manifest.json    the claims batch (publish-batch.cjs)
 *   code/activity-evidence.snippet.ts                              the approved activity entries for src/data/reviewed-activity-evidence.ts
 *   decisions.json          every decision this is built from
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const { run: scorePackC } = require('./packc-score.cjs');
const { build, sqlFor, readDecisions, CODE_FIELDS } = require('./publish-batch.cjs');
const { betaFiveReadiness } = require('./beta-five-readiness.cjs');

const flag = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const need = (n) => { const v = flag(n); if (!v) { console.error(`missing ${n}`); process.exit(2); } return v; };
const abFile = need('--ab'); const cFile = need('--c'); const keyFile = need('--key');
const approver = need('--approver'); const basis = need('--review-basis'); const outDir = need('--out-dir');
const asOf = flag('--as-of') ?? new Date().toISOString().slice(0, 10);
const dropRules = (flag('--drop-rules') ?? 'museum-closed-mondays').split(',').filter(Boolean);
const read = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

// 1. Score Pack C. A reviewer who misses more than one planted error has not met the bar, and nothing is built from their decisions.
const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
const { audit: cAudit, report } = scorePackC(read(cFile), key);
if (!report.controlsBarMet) {
  console.error(`REFUSED: Pack C controls caught ${report.controls.caught} of ${report.controls.planted} (bar: 3). No manifest was built. Re-read the cards with the owner before anything is published.`);
  process.exit(1);
}

// 2. Merge the decisions. Pack A/B come from the audit trail already recorded; Pack C from the scored chain (real cards only).
const tmp = path.join(fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'fm-')), 'all.jsonl');
const merged = [...read(abFile).map((e, i) => ({ ...e, n: i + 1, src: 'A/B' })), ...cAudit.map((e, i) => ({ ...e, n: 1000 + i, src: 'C' }))];
fs.writeFileSync(tmp, merged.map((e) => JSON.stringify(e)).join('\n') + '\n');
const decisions = readDecisions(tmp);
const decided = [...decisions.values()];

// 3. Claims batch (rules, hours, facility facts) from approved and edited cards; prices and activities ship as code.
const items = []; const textEdits = {}; const codeItems = []; const unresolved = [];
for (const [id, e] of decisions) {
  const field = id.split(/:(.+)/)[1];
  if (e.decision !== 'approve' && e.decision !== 'edit') { unresolved.push({ id, decision: e.decision, note: e.note ?? '' }); continue; }
  if (CODE_FIELDS.test(field)) { codeItems.push({ id, decision: e.decision, editedText: e.editedText ?? null }); continue; }
  items.push(id);
  if (e.decision === 'edit') textEdits[id] = e.editedText;
}
const label = path.basename(outDir);
const claims = build({ items, approver, dropRules, textEdits, asOf, label });
const { apply, rollback } = sqlFor(claims, approver, label, basis);
fs.mkdirSync(path.join(outDir, 'claims'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'code'), { recursive: true });
fs.writeFileSync(path.join(outDir, 'claims', 'apply.sql'), apply);
fs.writeFileSync(path.join(outDir, 'claims', 'rollback.sql'), rollback);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
fs.writeFileSync(path.join(outDir, 'claims', 'manifest.json'), JSON.stringify({
  label, approver, reviewBasis: basis, builtAsOf: asOf, items, edits: textEdits, dropRules,
  claims: claims.map((c) => ({ id: c.id, venueId: c.venueId, fieldKey: c.fieldKey, validUntil: c.validUntil, item: c.item, source: c.evidence.url, quote: c.evidence.quote, value: c.value })),
  applySha256: sha(apply), rollbackSha256: sha(rollback),
}, null, 1));

// 4. Activity code entries for approved activity cards (the owner's edited wording becomes the label).
const activityIds = codeItems.filter((c) => /:activities\./.test(c.id));
const activityEdits = Object.fromEntries(activityIds.filter((c) => c.editedText).map((c) => [c.id, c.editedText]));
const editsFile = path.join(path.dirname(tmp), 'activity-edits.json');
fs.writeFileSync(editsFile, JSON.stringify(activityEdits));
const snippet = activityIds.length
  ? execFileSync('node', [path.join(__dirname, 'emit-reviewed-data.cjs'), '--activity', '--only-items', activityIds.map((c) => c.id).join(','), '--edits', editsFile], { encoding: 'utf8' })
  : '';
fs.writeFileSync(path.join(outDir, 'code', 'activity-evidence.snippet.ts'), snippet);

// 5. Expected live readiness: the 21 decisions the five venues were judged on, less everything that is not approved or edited.
const approvedIds = new Set(decided.filter((e) => e.decision === 'approve' || e.decision === 'edit').map((e) => e.itemId));
const baseline = betaFiveReadiness();
const exclude = baseline.decisions.filter((id) => !approvedIds.has(id));
const expected = betaFiveReadiness(undefined, { exclude });

// 6. The one-page manifest.
const venueName = (id) => { const m = id.split(':')[0]; return (require('node:fs').readdirSync(path.join(__dirname, '..', '..', '..', 'docs', 'pilot', 'profiles')).map((f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs', 'pilot', 'profiles', f), 'utf8'))).find((p) => p.id.endsWith(m)) ?? {}).name ?? m; };

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const days = (d) => { const s = [...d].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); return s.length === 7 ? 'every day' : s.map((x) => DAY[x]).join(', '); };
const hhmm = (t) => (t ? t : '');
/** A claim as a parent would read it, not as JSON. */
function shown(c) {
  const v = c.value;
  if (c.fieldKey.startsWith('hours.')) {
    const when = [v.from ? `from ${v.from}` : '', v.until ? `until ${v.until}` : ''].filter(Boolean).join(' ');
    return `${v.area ? v.area + ': ' : ''}${days(v.days)} ${hhmm(v.open)} to ${v.close ? v.close : v.closeText ?? 'unspecified'}${v.lastEntry ? `, last entry ${v.lastEntry}` : ''}${when ? ` (${when})` : ''}`;
  }
  if (c.fieldKey.startsWith('rules.')) return v.text;
  const label = { 'familyFacilities.parking': 'Parking', 'familyFacilities.toilets': 'Toilets' }[c.fieldKey] ?? c.fieldKey;
  return `${label}: ${v}`;
}
const L = [];
L.push('# Publishing manifest for approval', '', `Built ${asOf}. **Nothing here has been published.** Approver on record: \`${approver}\`.`, '', `**Review basis: ${basis}**`, '');
L.push(`Pack C controls: ${report.controls.caught} of ${report.controls.planted} planted errors caught (bar: 3). Reviewer: ${report.reviewer}. Decisions on real cards: ${report.realDecisions}.`, '');
L.push(`## 1. Human-approved evidence claims (${claims.length}), applied as one guarded transaction with a rollback`, '', '| Venue | Claim | What a parent sees | Valid until |', '|---|---|---|---|');
for (const c of claims) {
  L.push(`| ${venueName(c.venueId + ':')} | \`${c.fieldKey}\` | ${shown(c).replace(/\|/g, '/')} | ${c.validUntil} |`);
}
L.push('', 'A parking or toilets claim records only yes or no, with the venue\'s own quotation attached; detail such as Blue Badge bays or a nearby car park lives in that quotation, not in the yes/no value. Claims for Natural History Museum, Mudchute and Gunnersbury are outside the five beta venues but are part of the signed-off cards.', '');
L.push(`apply.sql sha256 \`${sha(apply)}\`; rollback.sql sha256 \`${sha(rollback)}\`. A claim that is later wrong is withdrawn (status disputed), never deleted.`, '');
L.push('## 2. Code changes (a pull request you approve and merge; nothing ships until then)', '');
L.push('- **Pricing**, branch `data/beta-pricing-zoo-science` (not merged): London Zoo, four day-type price tables with under-3s free, shown as a range because the page does not say which dates are which; Science Museum, general admission free. Built from cards 11 and 12 as you signed them off.');
L.push(activityIds.length ? `- **Activities**, \`code/activity-evidence.snippet.ts\` for \`src/data/reviewed-activity-evidence.ts\`: ${activityIds.map((c) => `${venueName(c.id)} (${c.id.split('.')[1]})`).join('; ')}.` : '- **Activities**: none approved.');
L.push('', '## 3. Unresolved or unsupported (nothing about these is published)', '');
if (!unresolved.length) L.push('- None.'); else for (const u of unresolved) L.push(`- ${venueName(u.id)} \`${u.id.split(':')[1]}\`: **${u.decision}**. ${u.note}`.trim());
L.push('', '## 4. Expected live readiness once sections 1 and 2 are published', '', '| Venue | Expected | Still missing |', '|---|---|---|');
for (const v of expected.venues.filter((x) => ['Royal Air Force Museum London', 'Horniman Museum and Gardens', "Discover Children's Story Centre", 'London Zoo', 'Science Museum'].includes(x.name))) L.push(`| ${v.name} | ${v.ready ? '**recommendation-ready**' : 'not ready'} | ${v.missing.join(', ') || 'none'} |`);
L.push('', 'These are projections from the approved decisions; the live check (`live-readiness.cjs`) proves them against production after publication.', '');
fs.writeFileSync(path.join(outDir, 'MANIFEST.md'), L.join('\n'));
fs.writeFileSync(path.join(outDir, 'decisions.json'), JSON.stringify({ reviewBasis: basis, packC: { reviewer: report.reviewer, controls: report.controls.detail, secondReaderSample: report.auditSample }, decisions: decided }, null, 1));
console.log(`manifest built: ${claims.length} claims, ${codeItems.length} code items, ${unresolved.length} unresolved -> ${outDir}`);
