#!/usr/bin/env node
/**
 * Builds the FINAL publishing manifest from the owner's decisions. It writes files only: no database, no provider, nothing published.
 *
 *   node scripts/pilot/build-final-manifest.cjs --ab docs/pilot/beta/decisions/audit-packAB.jsonl \
 *        --c <Pack C review-decisions.jsonl> --key docs/pilot/beta/decisions/packC-scoring-key.json \
 *        --approver human:<name> --review-basis "<text>" --out-dir <dir> [--as-of YYYY-MM-DD] [--drop-rules museum-closed-mondays]
 *

 * ALTERNATIVE BASIS (--ai-verified <chain.jsonl>, in place of --c/--key): Pack C decisions come from an AI-assisted source verification
 * (docs/pilot/beta/verification), which is NOT human review and NOT a passed control check. No Pack C quality gate applies, because none
 * is claimed; instead every Pack C claim is labelled as AI-assisted and awaiting the founder's approval, is written with its own
 * source_type / approved_by (never `human:`), and the manifest keeps the Pack A/B (founder-reviewed) claims in a separate section.
 *
 * With --c/--key: refuses (no manifest) if Pack C does not meet its quality bar: at least 3 of the 4 planted controls caught. Otherwise writes:
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
const abFile = need('--ab'); const aiFile = flag('--ai-verified'); const cFile = aiFile ? null : need('--c'); const keyFile = aiFile ? null : need('--key');
const approver = need('--approver'); const basis = need('--review-basis'); const outDir = need('--out-dir');
const asOf = flag('--as-of') ?? new Date().toISOString().slice(0, 10);
const dropRules = (flag('--drop-rules') ?? 'museum-closed-mondays').split(',').filter(Boolean);
const read = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

// 1. Score Pack C. A reviewer who misses more than one planted error has not met the bar, and nothing is built from their decisions.
let cAudit; let report = null;
if (aiFile) cAudit = read(aiFile);
else {
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  ({ audit: cAudit, report } = scorePackC(read(cFile), key));
}
if (report && !report.controlsBarMet) {
  console.error(`REFUSED: Pack C controls caught ${report.controls.caught} of ${report.controls.planted} (bar: 3). No manifest was built. Re-read the cards with the owner before anything is published.`);
  process.exit(1);
}

// 2. Merge the decisions. Pack A/B come from the audit trail already recorded; Pack C from the scored chain (real cards only).
const tmp = path.join(fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'fm-')), 'all.jsonl');
const merged = [...read(abFile).map((e, i) => ({ ...e, n: i + 1, src: 'A/B' })), ...cAudit.map((e, i) => ({ ...e, n: 1000 + i, src: aiFile ? 'C-ai' : 'C' }))];
const aiIds = new Set(aiFile ? cAudit.map((e) => e.itemId) : []);
const AI_PROVENANCE = { approvedBy: 'source_verified_ai_v1', sourceType: 'ai_assisted_source_verification' };
const provenance = Object.fromEntries([...aiIds].map((id) => [id, AI_PROVENANCE]));
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
const claims = build({ items, approver, dropRules, textEdits, asOf, label, provenance });
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
// AI-assisted activity entries carry their own excerpt (the supported part of the source only) and an honest review note.
const aiRec = aiFile ? JSON.parse(fs.readFileSync(path.join(path.dirname(aiFile), 'packC-ai-verification.json'), 'utf8')).claims : [];
const excerptsFile = path.join(path.dirname(tmp), 'activity-excerpts.json'); const notesFile = path.join(path.dirname(tmp), 'activity-notes.json');
fs.writeFileSync(excerptsFile, JSON.stringify(Object.fromEntries(aiRec.filter((c) => c.publish?.excerpt).map((c) => [c.itemId, c.publish.excerpt]))));
fs.writeFileSync(notesFile, JSON.stringify(Object.fromEntries(aiRec.filter((c) => c.publish?.reviewNote).map((c) => [c.itemId, c.publish.reviewNote]))));
const snippet = activityIds.length
  ? execFileSync('node', [path.join(__dirname, 'emit-reviewed-data.cjs'), '--activity', '--only-items', activityIds.map((c) => c.id).join(','), '--edits', editsFile, '--excerpts', excerptsFile, '--notes', notesFile], { encoding: 'utf8' })
  : '';
fs.writeFileSync(path.join(outDir, 'code', 'activity-evidence.snippet.ts'), snippet);

// 5. Expected live readiness: the 21 decisions the five venues were judged on, less everything that is not approved or edited.
const approvedIds = new Set(decided.filter((e) => e.decision === 'approve' || e.decision === 'edit').map((e) => e.itemId));
const baseline = betaFiveReadiness();
const exclude = baseline.decisions.filter((id) => !approvedIds.has(id));
// A companion decision (for example an accessible-toilet fact that replaces a general-toilets inference) counts once it is approved or edited.
const include = [...approvedIds].filter((id) => !baseline.decisions.includes(id) && aiIds.has(id));
const expected = betaFiveReadiness(undefined, { exclude, include });

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
const aiMode = Boolean(aiFile);
const record = aiMode ? JSON.parse(fs.readFileSync(path.join(path.dirname(aiFile), 'packC-ai-verification.json'), 'utf8')) : null;
const recOf = (id) => record?.claims.find((c) => c.itemId === id);
L.push('# Publishing manifest: DRAFT for your review', '', `Built ${asOf}. **Nothing here has been published, merged or changed in production.** Publication needs your separate approval.`, '');
L.push(`**Review basis: ${basis}**`, '');
if (aiMode) {
  L.push('> **Evidence classes in this manifest.** Packs A and B: your own decisions (founder-reviewed, not independent). Pack C: **AI-assisted source verification awaiting your approval. It is NOT independent human-reviewed evidence and NOT a passed Pack C control check** (round 1 caught 1 of 4 planted errors, round 2 caught 0 of 4; the bar is 3). Pack C claims are written to the database as `source_type = ai_assisted_source_verification`, `approved_by = source_verified_ai_v1`, never as `human:` approvals.', '');
} else L.push(`Pack C controls: ${report.controls.caught} of ${report.controls.planted} planted errors caught (bar: 3). Reviewer: ${report.reviewer}. Decisions on real cards: ${report.realDecisions}.`, '');
const abClaims = claims.filter((c) => !aiIds.has(c.item));
const aiClaims = claims.filter((c) => aiIds.has(c.item));
const row = (c) => `| ${venueName(c.venueId + ':')} | \`${c.fieldKey}\` | ${shown(c).replace(/\|/g, '/')} | ${c.evidence.url.replace(/^https?:\/\//, '')} | ${c.evidence.readAt} | ${c.validUntil} |`;
L.push(aiMode ? `## 1a. Founder-reviewed claims, Packs A and B (${abClaims.length})` : `## 1. Human-approved evidence claims (${abClaims.length}), applied as one guarded transaction with a rollback`, '', '| Venue | Claim | What a parent sees | Source | Read on | Valid until |', '|---|---|---|---|---|---|');
for (const c of abClaims) L.push(row(c));
if (aiMode) {
  L.push('', `## 1b. AI-assisted source-verified claims, Pack C, awaiting your approval (${aiClaims.length})`, '', 'Each was re-checked against the stored official-page text (quotation found, page hash matched, domain is the venue\'s own). Wording is the supported wording only; what was removed and why is in `docs/pilot/beta/verification/PACK_C_AI_VERIFICATION.md`.', '', '| Venue | Claim | What a parent sees | Source | Read on | Valid until |', '|---|---|---|---|---|---|');
  for (const c of aiClaims) {
    const w = recOf(c.item)?.publish?.wording ?? shown(c);
    L.push(`| ${venueName(c.venueId + ':')} | \`${c.fieldKey}\` | ${w.replace(/\|/g, '/')} | ${c.evidence.url.replace(/^https?:\/\//, '')} | ${c.evidence.readAt} | ${c.validUntil} |`);
  }
}
L.push('', 'A facility claim records only yes or no, with the venue\'s own quotation attached; general parking, Blue Badge parking, toilets and accessible toilets are separate claims and separate rows in the app, and a nearby car park or road name lives in the quotation, not in the yes/no value. Claims for Natural History Museum, Mudchute and Gunnersbury are outside the five beta venues but are part of the signed-off cards.', '');
L.push(`apply.sql sha256 \`${sha(apply)}\`; rollback.sql sha256 \`${sha(rollback)}\`. A claim that is later wrong is withdrawn (status disputed), never deleted. Expiry: facility claims 30 days from the reading, official hours 45, rules 30; nothing is extended without a new reading.`, '');
L.push('## 2. Code changes (a pull request you approve and merge; nothing ships until then)', '');
L.push('- **Pricing** (founder-reviewed, Pack A/B), branch `data/beta-pricing-zoo-science` (head 5018712, no PR opened, not merged; the two activity entries below are already on it): London Zoo, four day-type price tables with under-3s free, shown as a range because the page does not say which dates are which; Science Museum, general admission free. Price evidence expires 6 Apr 2027 (paid, 180 days) and 8 Oct 2027 (free, 365 days).');
if (activityIds.length) {
  L.push(`- **Activities**, \`code/activity-evidence.snippet.ts\` for \`src/data/reviewed-activity-evidence.ts\` (${aiMode ? 'AI-assisted source-verified, awaiting your approval' : 'approved'}); valid 90 days from the reading, to 6 Jan 2027:`);
  for (const c of activityIds) L.push(`  - ${venueName(c.id)} \`${c.id.split(':')[1]}\`: "${c.editedText ?? ''}"`);
} else L.push('- **Activities**: none approved.');
L.push('', '## 3. Unresolved or unsupported (nothing about these is published)', '');
if (!unresolved.length) L.push('- None.');
else for (const u of unresolved) {
  const r = recOf(u.id);
  L.push(`- ${venueName(u.id)} \`${u.id.split(':')[1]}\`: **${u.decision}**. ${r ? r.notEstablished : (u.note ?? '')}`.trim());
}
if (aiMode) {
  L.push('- London Zoo `activities.zootown`, the booking rule and the £1 session fee: **Unknown / not published**. The zoo\'s own FAQ contradicts itself on advance booking, and the fee is a ticket price with no field here.');
  L.push('- **Recorded-source limitation, NOT upgraded:** Science Museum `familyFacilities.parking` and `accessibility.accessibleParking` rest on the recorded read of 8 Oct (page hash `751a89c00ea27a0f`) and its recorded surrounding text, not a fresh fetch; the site blocks our crawler and this sandbox cannot reach it. The status of both stays "verified from recorded source". A direct current-page check by a person (https://www.sciencemuseum.org.uk/visit/getting-here, about 10 seconds) is the only thing that would upgrade it, and it is required before these two claims are renewed on 7 Nov.');
}
L.push('', '## 4. Expected live readiness once sections 1 and 2 are published', '', '| Venue | Expected | Still missing |', '|---|---|---|');
for (const v of expected.venues.filter((x) => ['Royal Air Force Museum London', 'Horniman Museum and Gardens', "Discover Children's Story Centre", 'London Zoo', 'Science Museum'].includes(x.name))) L.push(`| ${v.name} | ${v.ready ? '**recommendation-ready**' : 'not ready'} | ${v.missing.join(', ') || 'none'} |`);
if (aiMode) L.push('', 'What each depends on: London Zoo and Science Museum cost depends on the pricing PR in section 2 (not yet merged); their activity evidence depends on the two activity entries; their family essentials rest on the accessible-toilet claims only (general toilets stay Unknown in the app; Science Museum also states baby changing, which is not decided in this batch). Discover stays held back by its price, which cannot be verified.');
L.push('', 'These are projections from the decisions above; the live check (`live-readiness.cjs`) proves them against production after publication. If you decline any Pack C item, the affected venue drops as the table in section 3 states.', '');
if (aiMode) {
  L.push('## 5. Expiry, refresh and the Christmas closures', '', '| What | Expires | Refresh |', '|---|---|---|',
    '| London Zoo and Science Museum facility claims (Pack C) | 7 Nov 2026 | Manual re-read: both sites block the crawler, so these cannot refresh automatically |',
    '| Discover and Horniman facility claims | 7 Nov 2026 | Refetch can renew the quotation; a person re-confirms any change |',
    '| Pack A/B rules (including Christmas and New Year closures) and hours | 7 Nov (rules), 22 Nov (hours) | London Zoo and Science Museum: manual |',
    '| Activity entries (The Garden, ZooTown) | 6 Jan 2027 | Manual re-read |',
    '| London Zoo ticket prices (variable) | **7 Nov 2026** (30 days), then shown only as "last known, may have changed" | Manual re-read of the ticket page |',
    '| Science Museum free admission | 8 Oct 2027 | Manual |', '');
  L.push('**Closures apply only on their dates.** Each closure rule carries explicit year dates (Christmas 24 to 26 Dec 2026, New Year 31 Dec 2026 to 1 Jan 2027, NHM 9 Oct 2026), is evaluated against the visit date, and does nothing on any other day, including 25 Dec 2027.', '');
  L.push('**What happens to Christmas when the evidence expires on 7 Nov, if nobody renews it.** An expired rule claim stops being served, so the planner would fall back to the venue\'s regular weekly hours and could plan a visit on 25 Dec as an ordinary day. That is a real gap, not a hypothetical one. It is closed by renewal, not by weakening the 30-day standard: (1) in the week of 2 Nov, re-read the Science Museum and Discover opening pages and publish a renewal batch for the closure rules and hours (30 days from that reading, to early Dec); (2) in the week of 30 Nov to 4 Dec, do it again, which carries the closure rules past 1 Jan 2027 and covers both Christmas and New Year. I can set both as dated reminders if you approve; nothing renews itself.', '');
  L.push('**Science Museum direct check.** Science Museum parking and Blue Badge spaces are recorded-source only. Before the first renewal, a person should open https://www.sciencemuseum.org.uk/visit/getting-here and confirm the three sentences quoted in `PACK_C_AI_VERIFICATION.md`.', '');
  L.push('## 5b. What a parent sees, checked through the real app code', '', 'Parking, Blue Badge parking, toilets and accessible toilets are four separate rows, each read from its own claim (tests in `facility-distinctions.test.ts`). An accessible-toilet claim never fills the Toilets row; a general-parking "no" is shown beside a separate Blue Badge row, which is why Blue Badge claims were added for Horniman, Discover and the Science Museum (the source states them in the same passage). ZooTown is counted for children from 12 months to under 9 years only; a newborn or a 6-month-old is not shown as suited to it.', '');
  L.push('## 6. What needs your approval, in order', '',
    '1. **Accept the Pack C classification**: AI-assisted source verification, not human review, not a passed control check.',
    '2. **Approve (or strike) each Pack C claim in 1b, including the three Blue Badge claims added this round, and each activity entry in section 2.** Anything you strike is dropped and the venue table above is recomputed.',
    '3. **Approve applying the claims batch** (`claims/apply.sql`, one guarded transaction; `claims/rollback.sql` withdraws exactly those rows).',
    '4. **Approve merging the code PR** (pricing + activity entries) so London Zoo and Science Museum pricing and ZooTown/The Garden ship.',
    '5. After publication I run `live-readiness.cjs` against production and the parent journey (Home, Venue Detail, Create a Plan, Saved Plan), and report.', '');
}
fs.writeFileSync(path.join(outDir, 'MANIFEST.md'), L.join('\n'));
