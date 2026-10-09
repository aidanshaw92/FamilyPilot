#!/usr/bin/env node
/**
 * Rehearses a publishing batch end to end on a THROWAWAY local PostgreSQL (never production): schema from the real migration,
 * the venues, some pre-existing active claims standing in for production's, then
 *   apply -> the app's own projection shows the rules and hours -> apply again is refused -> rollback -> the app shows none of them
 *   and every pre-existing claim is byte-for-byte as before -> apply again under a new label works (re-publication after a rollback).
 *
 *   PSQL_ARGS='-h /tmp/pgtest -p 5499 -d rehearsal' [PSQL_PREFIX='su postgres -c'] node scripts/pilot/rehearse-batch.cjs --items a,b --approver human:x [--warn-only ...]
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { build, sqlFor } = require('./publish-batch.cjs');
const root = path.join(__dirname, '..', '..', '..');
const { projectActiveClaimsToPayload } = require(path.join(root, 'server/enrichment/_lib/claims-store.js'));
const { PROJECTED_RULES } = require(path.join(root, 'server/enrichment/_lib/venue-rules.js'));
const { PROJECTED_OFFICIAL_HOURS } = require(path.join(root, 'server/enrichment/_lib/official-hours.js'));

const flag = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const PSQL_ARGS = process.env.PSQL_ARGS;
const PSQL_PREFIX = process.env.PSQL_PREFIX;
if (!PSQL_ARGS) { console.error('set PSQL_ARGS (connection arguments for a THROWAWAY database)'); process.exit(2); }
const command = (file) => (PSQL_PREFIX ? `${PSQL_PREFIX} "psql ${PSQL_ARGS} -Atq -v ON_ERROR_STOP=1 -f ${file} 2>&1"` : `psql ${PSQL_ARGS} -Atq -v ON_ERROR_STOP=1 -f ${file} 2>&1`);
const run = (sql, expectFail = false) => {
  const f = path.join(os.tmpdir(), `rehearse-${crypto.randomUUID()}.sql`);
  fs.writeFileSync(f, sql); fs.chmodSync(f, 0o644);
  try { return { ok: true, out: execSync(command(f), { encoding: 'utf8' }).trim() }; }
  catch (e) { if (!expectFail) throw new Error(`${e.stdout ?? e.message}`); return { ok: false, out: String(e.stdout ?? e.message).trim() }; }
  finally { fs.rmSync(f, { force: true }); }
};
let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed += 1; };

const items = (flag('--items') ?? '').split(',').filter(Boolean);
const approver = flag('--approver');
const warnOnly = (flag('--warn-only') ?? '').split(',').filter(Boolean);
const asOf = flag('--as-of') ?? '2026-10-09';
const claims = build({ items, approver, warnOnly, asOf, label: 'rehearsal-A' });
const venues = [...new Set(claims.map((c) => c.venueId))];

// Schema: the real columns and constraints of venue_claims (migration 20260906...), minimal place_records.
run(`drop table if exists venue_claims cascade; drop table if exists place_records cascade;
create table place_records(familypilot_place_id text primary key);
create table venue_claims(id uuid primary key default gen_random_uuid(), familypilot_place_id text not null references place_records(familypilot_place_id) on delete cascade, field_key text not null, value_json jsonb not null, confidence text check (confidence in ('high','medium','low','unknown')), source_url text, evidence_excerpt text, source_type text, source_evidence_id uuid, checked_at date not null, valid_until date, approved_at timestamptz not null default now(), approved_by text not null, approved_from_draft_id uuid, status text not null default 'active' check (status in ('active','disputed','expired','superseded')), supersedes_claim_id uuid references venue_claims(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index idx_venue_claims_one_active_per_field on venue_claims(familypilot_place_id, field_key) where status='active';
${venues.map((v) => `insert into place_records values ('${v}');`).join('\n')}
${venues.map((v, i) => `insert into venue_claims(id, familypilot_place_id, field_key, value_json, confidence, source_url, checked_at, valid_until, approved_by, status) values (gen_random_uuid(), '${v}', 'familyFacilities.babyChanging', '"yes"', 'high', 'https://example.org', '2026-10-01', '2026-10-31', 'source_evidence_auto_v2', 'active'), (gen_random_uuid(), '${v}', 'familyFacilities.cafe', '"yes"', 'high', 'https://example.org', '2026-10-01', '2026-10-31', 'source_evidence_auto_v2', 'active');`).join('\n')}`);

const dump = () => JSON.parse(run(`select coalesce(json_agg(json_build_object('id', id, 'venueId', familypilot_place_id, 'fieldKey', field_key, 'valueJson', value_json, 'status', status, 'confidence', confidence, 'sourceUrl', source_url, 'evidenceExcerpt', evidence_excerpt, 'checkedAt', checked_at, 'validUntil', valid_until, 'approvedBy', approved_by) order by id), '[]') from venue_claims;`).out);
const batchIds = new Set(claims.map((c) => c.id));
const claimsB = build({ items, approver, warnOnly, asOf, label: 'rehearsal-B' });
for (const c of claimsB) batchIds.add(c.id);
const fingerprint = (rows) => crypto.createHash('md5').update(JSON.stringify(rows.filter((r) => !batchIds.has(r.id)).map((r) => [r.id, r.fieldKey, r.status, JSON.stringify(r.valueJson)]))).digest('hex');
const seen = (rows, venueId) => { const p = projectActiveClaimsToPayload(rows.filter((r) => r.venueId === venueId)); return { rules: (p[PROJECTED_RULES] ?? []).map((r) => r.id), hours: (p[PROJECTED_OFFICIAL_HOURS] ?? []).length, facts: p }; };
const factOf = (payload, fieldKey) => fieldKey.split('.').reduce((o, k) => (o == null ? undefined : o[k]), payload);

const before = dump();
const fpBefore = fingerprint(before);
console.log(`batch: ${claims.length} claims at ${venues.length} venues; ${before.length} pre-existing active claims`);
const A = sqlFor(claims, approver, 'rehearsal-A');

console.log('apply');
const applied = run(A.apply);
check(/\b${claims.length}\s*$/.test(applied.out.replace(/\s+/g, ' ')) || applied.out.trim().endsWith(String(claims.length)), `prints ${claims.length} active batch rows (${applied.out.split('\n').pop()})`);
const afterApply = dump();
check(afterApply.length === before.length + claims.length, `exactly ${claims.length} rows added, nothing else`);
check(fingerprint(afterApply) === fpBefore, 'every pre-existing claim is unchanged');
const live = venues.map((v) => [v, seen(afterApply, v)]);
check(claims.filter((c) => c.fieldKey.startsWith('rules.')).every((c) => live.find(([v]) => v === c.venueId)[1].rules.includes(c.fieldKey.slice(6))), 'the app projects every rule in the batch');
check(claims.filter((c) => c.fieldKey.startsWith('hours.')).length === 0 || live.some(([, s]) => s.hours > 0), 'the app projects the hours readings');
const facilityClaims = claims.filter((c) => /^(familyFacilities|accessibility)\./.test(c.fieldKey));
check(facilityClaims.every((c) => factOf(live.find(([v]) => v === c.venueId)[1].facts, c.fieldKey) === c.value), `the app projects every facility fact in the batch (${facilityClaims.length})`);

console.log('apply again (must refuse)');
const again = run(A.apply, true);
check(!again.ok && /already have an active claim/.test(again.out), 'the guard refuses a second run');
check(dump().length === afterApply.length, 'and the refused run changed nothing');

console.log('rollback');
const rb = run(A.rollback);
check(/\b0\s*$/.test(rb.out.trim()), `prints 0 active batch rows (${rb.out.split('\n').pop()})`);
const afterRb = dump();
check(afterRb.length === afterApply.length, 'no row was deleted (history is kept)');
check(afterRb.filter((r) => claims.some((c) => c.id === r.id)).every((r) => r.status === 'disputed'), 'every batch row is now disputed');
check(fingerprint(afterRb) === fpBefore, 'every pre-existing claim is unchanged after the rollback');
check(venues.every((v) => { const s = seen(afterRb, v); return s.rules.length === 0 && s.hours === 0 && facilityClaims.filter((c) => c.venueId === v).every((c) => factOf(s.facts, c.fieldKey) !== c.value || /toilets/.test(c.fieldKey) && factOf(s.facts, c.fieldKey) === 'yes' && false); }), 'the app now projects none of the batch (back to before)');

console.log('re-publish under a new label after a rollback');
const B = sqlFor(claimsB, approver, 'rehearsal-B');
const rePub = run(B.apply);
check(dump().filter((r) => r.status === 'active' && claimsB.some((c) => c.id === r.id)).length === claims.length, `re-publication works (${rePub.out.split('\n').pop()} active)`);

console.log('a batch whose venue is missing is refused');
const missing = run(sqlFor([{ ...claimsB[0], venueId: 'fp-google-DOES-NOT-EXIST', id: crypto.randomUUID() }], approver, 'x').apply, true);
check(!missing.ok && /not in place_records/.test(missing.out), 'unknown venue aborts');

console.log(failed ? `\n${failed} FAILED` : '\nrehearsal passed');
process.exit(failed ? 1 : 0);
