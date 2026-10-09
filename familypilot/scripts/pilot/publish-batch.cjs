#!/usr/bin/env node
/**
 * Builds a PUBLISHING BATCH for venue rules and official hours that a named person has approved, together with its rollback.
 * It writes files only. It never connects to a database; running the SQL is a separate, explicitly authorised production write.
 *
 *   node scripts/pilot/publish-batch.cjs --items "<itemId>,<itemId>" --approver human:aidan --out-dir batch-wave1 \
 *        [--warn-only <ruleId,...>] [--as-of 2026-10-09]
 *
 *   itemId = the review queue id, e.g. ChIJPy8Y5kIFdkgRxGSXw4Xjt3s:opening.closure (docs/pilot/reconciliation-171.csv)
 *
 * What a batch is: one `venue_claims` row per rule (`rules.<id>`) or hours reading (`hours.<id>`) that item justifies, inserted
 * ACTIVE with the person's `human:` approver, its source page, quotation and reading date, valid for 30 days (rules) or 45 (hours).
 * That is the only thing the app needs to start refusing a date or showing the venue's hours; it is read from the claims at
 * request time. Nothing else is touched. The claim ids are derived from the batch, so the rollback names exactly what the batch
 * wrote, and re-running the same batch is a no-op (the guard stops it).
 *
 * `--warn-only` strips `coversCoreVisit` from the named rules, which is the difference between "warns" and "can refuse a household".
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { rulesFor } = require('./rules.cjs');
const { hoursFor } = require('./hours.cjs');
const { CLAIM_MAP } = require('./profile-claims.cjs');

const PROFILES = path.join(__dirname, '..', '..', '..', 'docs', 'pilot', 'profiles');
const flag = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const addDays = (iso, n) => new Date(new Date(iso).getTime() + n * 86400000).toISOString().slice(0, 10);
const lit = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
/** UUID derived from the batch, so ids are stable across a rebuild and never collide with anything else. */
function uuid(seed) {
  const h = crypto.createHash('sha1').update(seed).digest();
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

function build({ items, approver, warnOnly = [], asOf, label = 'batch', textEdits = {}, dropRules = [], provenance = {} }) {
  if (!/^human:[a-z0-9._-]{2,}$/i.test(approver ?? '') || /assum|auto|pilot/i.test(approver)) throw new Error('approver must be a named person, e.g. human:aidan (nothing automatic or assumed can publish a rule)');
  const profiles = new Map(fs.readdirSync(PROFILES).filter((f) => f.endsWith('.json')).map((f) => { const p = JSON.parse(fs.readFileSync(path.join(PROFILES, f), 'utf8')); return [p.id, p]; }));
  // Facts added after the review queue was built (the Pack C AI-assisted verification), kept apart from the ten pilot profiles.
  const extraFile = path.join(PROFILES, '..', 'beta', 'verification', 'extra-facts.json');
  if (fs.existsSync(extraFile)) {
    const extra = JSON.parse(fs.readFileSync(extraFile, 'utf8')).facts ?? {};
    for (const [venueId, facts] of Object.entries(extra)) if (profiles.has(venueId)) profiles.set(venueId, { ...profiles.get(venueId), facts: [...profiles.get(venueId).facts, ...facts] });
  }
  const claims = [];
  for (const item of items) {
    const [placeKey, field] = item.split(/:(.+)/);
    const venueId = [...profiles.keys()].find((id) => id === placeKey || id.endsWith(placeKey));
    if (!venueId) throw new Error(`no pilot venue for item ${item}`);
    const profile = profiles.get(venueId);
    const found = [];
    for (const { rule, fact, evidence } of rulesFor(profile)) {
      if (fact !== field) continue;
      const { id, text, ...rest } = rule;
      // A reviewer can drop a structured reading the page does not state (for example an inferred "closed on Mondays").
      if (dropRules.includes(id)) continue;
      if (warnOnly.includes(id)) delete rest.coversCoreVisit;
      // A reviewer's edit replaces the wording only of a rule whose text IS the reviewed sentence (not one with its own fixed text).
      const [fsec, fkey] = fact.split(/\.(.+)/);
      const reviewed = profile.facts.find((f) => f.sec === fsec && f.key === fkey);
      const finalText = textEdits[item] && reviewed && text === reviewed.text ? textEdits[item] : text;
      found.push({ fieldKey: `rules.${id}`, value: { ...rest, text: finalText }, evidence, days: 30 });
    }
    for (const { rule, fact, evidence } of hoursFor(profile)) {
      if (fact !== field) continue;
      const { id, ...rest } = rule;
      found.push({ fieldKey: `hours.${id}`, value: rest, evidence, days: 45 });
    }
    // A plain facility fact (toilets, baby changing, a café, parking, step-free): one `familyFacilities.*` / `accessibility.*` claim, valid 30 days.
    // `adjacent` (for example a playground next door) is not a claim and publishes nothing.
    if (!found.length) {
      const [sec, key] = field.split(/\.(.+)/);
      const fact = profile.facts.find((f) => f.sec === sec && f.key === key);
      const mapped = field === 'transport.parking' ? ['familyFacilities.parking', fact?.value === 'no' ? 'no' : 'yes'] : CLAIM_MAP[field];
      if (fact && mapped && fact.value !== 'adjacent' && (fact.status === 'verified' || fact.status === 'review') && !fact.held && fact.evidence) {
        found.push({ fieldKey: mapped[0], value: mapped[1], evidence: fact.evidence, days: 30 });
      }
    }
    if (!found.length) throw new Error(`item ${item} yields no rule, hours reading or publishable fact (prices and activities ship as reviewed data in a code change, not as claims)`);
    for (const f of found) {
      if (!f.evidence?.quote || !f.evidence?.url || !f.evidence?.readAt) throw new Error(`${f.fieldKey}: no source, quotation or reading date`);
      if (addDays(f.evidence.readAt, f.days) < asOf) throw new Error(`${f.fieldKey}: the reading of ${f.evidence.readAt} is already past its ${f.days}-day window; it must be re-read first`);
      claims.push({ id: uuid(`${label}|${venueId}|${f.fieldKey}|${approver}|${f.evidence.readAt}`), venueId, item, ...f, ...(provenance[item] ?? {}), validUntil: addDays(f.evidence.readAt, f.days) });
    }
  }
  const seen = new Set();
  for (const c of claims) { const k = `${c.venueId}|${c.fieldKey}`; if (seen.has(k)) throw new Error(`two claims for ${k} in one batch`); seen.add(k); }
  return claims;
}

function sqlFor(claims, approver, label, basis = null) {
  const venues = [...new Set(claims.map((c) => c.venueId))];
  const actors = [...new Set(claims.map((c) => c.approvedBy ?? approver))];
  const actorList = actors.map(lit).join(', ');
  const rows = claims.map((c) => `  (${lit(c.id)}, ${lit(c.venueId)}, ${lit(c.fieldKey)}, ${lit(JSON.stringify(c.value))}::jsonb, 'high', ${lit(c.evidence.url)}, ${lit(c.evidence.quote)}, ${lit(c.sourceType ?? 'human_reviewed_official_page')}, ${lit(c.evidence.readAt)}, ${lit(c.validUntil)}, ${lit(c.approvedBy ?? approver)}, 'active')`);
  const apply = `-- Publishing batch ${label}: ${claims.length} rule/hours claims at ${venues.length} venues, approved by ${approver}. Paste as ONE run.${basis ? `\n-- Review basis: ${basis}` : ''}
-- Guards abort the whole transaction (nothing is kept) unless: every venue exists, none of these claims is already active, and
-- the batch is the only change. Expected result printed last: ${claims.length} active rows.
begin;
do $$
declare missing integer; clash integer;
begin
  select count(*) into missing from unnest(array[${venues.map(lit).join(', ')}]::text[]) v(id) where not exists (select 1 from public.place_records p where p.familypilot_place_id = v.id);
  if missing > 0 then raise exception 'Batch aborted: % venue(s) are not in place_records. Nothing was changed.', missing; end if;
  select count(*) into clash from public.venue_claims c where c.status = 'active' and (c.familypilot_place_id, c.field_key) in (${claims.map((c) => `(${lit(c.venueId)}, ${lit(c.fieldKey)})`).join(', ')});
  if clash > 0 then raise exception 'Batch aborted: % of these fields already have an active claim (was this batch already run?). Nothing was changed.', clash; end if;
end $$;
insert into public.venue_claims (id, familypilot_place_id, field_key, value_json, confidence, source_url, evidence_excerpt, source_type, checked_at, valid_until, approved_by, status) values
${rows.join(',\n')};
do $$
declare n integer;
begin
  select count(*) into n from public.venue_claims where id in (${claims.map((c) => lit(c.id)).join(', ')}) and status = 'active' and approved_by in (${actorList});
  if n <> ${claims.length} then raise exception 'Batch aborted: % of ${claims.length} rows are active. Nothing was changed.', n; end if;
end $$;
commit;
select count(*) as active_batch_rows from public.venue_claims where id in (${claims.map((c) => lit(c.id)).join(', ')}) and status = 'active';
`;
  const rollback = `-- Rollback of publishing batch ${label}. Paste as ONE run. Withdraws exactly the ${claims.length} claims the batch wrote (they become 'disputed':
-- nothing is deleted, and the app stops using them at once). Touches nothing else. Expected result printed last: 0 active rows.
begin;
update public.venue_claims set status = 'disputed', updated_at = now()
 where id in (${claims.map((c) => lit(c.id)).join(', ')}) and status = 'active' and approved_by in (${actorList});
do $$
declare n integer;
begin
  select count(*) into n from public.venue_claims where id in (${claims.map((c) => lit(c.id)).join(', ')}) and status = 'active';
  if n <> 0 then raise exception 'Rollback aborted: % batch rows are still active. Nothing was changed.', n; end if;
end $$;
commit;
select count(*) as active_batch_rows from public.venue_claims where id in (${claims.map((c) => lit(c.id)).join(', ')}) and status = 'active';
`;
  return { apply, rollback };
}

/**
 * Reads the review page's export (or an audit trail) and returns what each item's LATEST live decision is. A revert withdraws the entry it
 * targets. Items that are not approved or edited (unknown, reject) are never published.
 */
function readDecisions(file) {
  const raw = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const dead = new Set();
  for (const e of [...raw].reverse()) if (e.decision === 'revert' && !dead.has(e.n ?? e.seq)) dead.add(e.targets);
  const latest = new Map();
  for (const e of raw) if (e.decision !== 'revert' && !dead.has(e.n ?? e.seq)) latest.set(e.itemId, e);
  return latest;
}
/** Prices and activities ship as reviewed data in a code change, not as claims. */
const CODE_FIELDS = /^(pricing|activities)\./;

/** The items a decisions file lets this tool publish, the reviewer's edited wording, and what it deliberately leaves out. */
function fromDecisions(file) {
  const items = []; const textEdits = {}; const skipped = [];
  for (const [id, e] of readDecisions(file)) {
    const field = id.split(/:(.+)/)[1];
    if (e.decision !== 'approve' && e.decision !== 'edit') { skipped.push(`${id} (${e.decision}: not published)`); continue; }
    if (CODE_FIELDS.test(field)) { skipped.push(`${id} (ships as reviewed data in a code change)`); continue; }
    items.push(id);
    if (e.decision === 'edit') textEdits[id] = e.editedText;
  }
  return { items, textEdits, skipped };
}

module.exports = { build, sqlFor, uuid, readDecisions, fromDecisions, CODE_FIELDS };

if (require.main === module) {
  let items = (flag('--items') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  let textEdits = {};
  let skipped = [];
  if (flag('--decisions')) {
    const d = fromDecisions(flag('--decisions'));
    items = [...new Set([...items, ...d.items])]; textEdits = d.textEdits; skipped = d.skipped;
  }
  const outDir = flag('--out-dir');
  if (!items.length || !outDir || !flag('--approver')) { console.error('usage: publish-batch.cjs (--items a,b | --decisions export.jsonl) --approver human:name --out-dir dir [--warn-only ruleId,...] [--drop-rules ruleId,...] [--as-of YYYY-MM-DD]'); process.exit(2); }
  const approver = flag('--approver');
  const asOf = flag('--as-of') ?? new Date().toISOString().slice(0, 10);
  const label = path.basename(outDir);
  const claims = build({ items, approver, warnOnly: (flag('--warn-only') ?? '').split(',').filter(Boolean), dropRules: (flag('--drop-rules') ?? '').split(',').filter(Boolean), textEdits, asOf, label });
  const { apply, rollback } = sqlFor(claims, approver, label);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'apply.sql'), apply);
  fs.writeFileSync(path.join(outDir, 'rollback.sql'), rollback);
  const manifest = { label, approver, builtAsOf: asOf, items, skipped, edits: textEdits, claims: claims.map((c) => ({ id: c.id, venueId: c.venueId, fieldKey: c.fieldKey, validUntil: c.validUntil, item: c.item, source: c.evidence.url, quote: c.evidence.quote, value: c.value })), applySha256: crypto.createHash('sha256').update(apply).digest('hex'), rollbackSha256: crypto.createHash('sha256').update(rollback).digest('hex') };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`${claims.length} claims at ${new Set(claims.map((c) => c.venueId)).size} venues -> ${outDir}/{apply.sql,rollback.sql,manifest.json}`);
  for (const c of claims) console.log(`  ${c.fieldKey.padEnd(34)} ${c.venueId.slice(-12)} valid to ${c.validUntil}`);
}
