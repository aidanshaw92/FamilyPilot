#!/usr/bin/env node
/**
 * Runs the PROPOSED open-data ledger SQL (docs/ledger/001_open_data_ledger.proposed.sql) against a throw-away, in-memory Postgres
 * (PGlite) and checks that it does what the proposal says: the constraints refuse what they should, valid rows are accepted, a
 * batch rolls back cleanly, and no existing table is altered. It connects to nothing and writes nothing outside memory.
 *
 *   npm install --no-save @electric-sql/pglite
 *   node scripts/verify-ledger-proposal.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let PGlite;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
} catch {
  console.error('PGlite is not installed. Run: npm install --no-save @electric-sql/pglite');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const up = readFileSync(join(here, '../docs/ledger/001_open_data_ledger.proposed.sql'), 'utf8');
const down = readFileSync(join(here, '../docs/ledger/002_open_data_ledger.rollback.sql'), 'utf8');

const db = new PGlite();
let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); if (!ok) failed += 1; };
const refuses = async (sql, params = []) => { try { await db.query(sql, params); return false; } catch { return true; } };

// The part of production the proposal touches: place_records (as it is today, trimmed) and the two roles Supabase provides.
await db.exec(`
  create role anon; create role authenticated;
  create table public.place_records (
    id uuid primary key default gen_random_uuid(),
    familypilot_place_id text not null unique,
    external_id text not null, provider text not null check (provider in ('mock','google','osm','familypilot')),
    name text not null, category text not null, lat double precision not null, lng double precision not null,
    fetched_at timestamptz not null default now(), unique (provider, external_id)
  );
  insert into public.place_records (familypilot_place_id, external_id, provider, name, category, lat, lng)
  values ('fp-google-A', 'google:A', 'google', 'A Google Venue', 'museum', 51.49, -0.18);
`);
const before = (await db.query(`select column_name from information_schema.columns where table_name = 'place_records' order by 1`)).rows.map((r) => r.column_name).join(',');
const rowsBefore = (await db.query('select count(*)::int as n from public.place_records')).rows[0].n;

await db.exec(up);
check(true, 'the proposed migration runs');

const after = (await db.query(`select column_name from information_schema.columns where table_name = 'place_records' order by 1`)).rows.map((r) => r.column_name).join(',');
check(before === after, 'place_records has exactly the same columns');
check((await db.query('select count(*)::int as n from public.place_records')).rows[0].n === rowsBefore, 'no existing row was touched');

const batch = (over = {}) => ({ source: 'osm-geofabrik-greater-london', provider: 'osm', source_version: '2026-10-14', source_url: 'https://example.invalid/x', licence: 'ODbL-1.0', licence_url: 'https://example.invalid/l', attribution: '© OpenStreetMap contributors', share_alike: true, retrieved_at: '2026-10-14T20:00:00Z', retrieved_by: 'script@abc123', row_count: 2, ...over });
const insertBatch = (b) => db.query(
  `insert into public.place_import_batches (source, provider, source_version, source_url, licence, licence_url, attribution, share_alike, retrieved_at, retrieved_by, row_count)
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
  [b.source, b.provider, b.source_version, b.source_url, b.licence, b.licence_url, b.attribution, b.share_alike, b.retrieved_at, b.retrieved_by, b.row_count]);

check(await refuses(`insert into public.place_import_batches (source, provider, source_version, source_url, licence, licence_url, attribution, share_alike, retrieved_at, retrieved_by, row_count) values ('s','osm','v','u','ODbL-1.0','l','   ',true,now(),'x',1)`), 'a batch with no attribution is refused');
check(await refuses(`insert into public.place_import_batches (source, provider, source_version, source_url, licence, licence_url, attribution, share_alike, retrieved_at, retrieved_by, row_count) values ('s','osm','v','u','ODbL-1.0','l','a',false,now(),'x',1)`), 'an ODbL batch that is not marked share-alike is refused');
check(await refuses(`insert into public.place_import_batches (source, provider, source_version, source_url, licence, licence_url, attribution, share_alike, retrieved_at, retrieved_by, row_count) values ('s','osm','v','u','OGL-3.0','l','a',true,now(),'x',1)`), 'an OGL batch marked share-alike is refused');
check(await refuses(`insert into public.place_import_batches (source, provider, source_version, source_url, licence, licence_url, attribution, share_alike, retrieved_at, retrieved_by, row_count) values ('s','google','v','u','OGL-3.0','l','a',false,now(),'x',1)`), 'google is not an allowed open-data provider');

const b = (await insertBatch(batch())).rows[0].id;
const ogl = (await insertBatch(batch({ source: 'os-open-greenspace', provider: 'os_open_greenspace', licence: 'OGL-3.0', share_alike: false, attribution: 'Contains OS data © Crown copyright and database right 2026' }))).rows[0].id;
check(Boolean(b && ogl), 'a valid ODbL batch and a valid OGL batch are accepted');

const place = (id, batchId, over = {}) => ({ fid: `fp-osm-${id}`, batch: batchId, rec: `way/${id}@v1`, name: 'A Playground', group: 'parks', subtype: 'playground', lat: 51.5, lng: -0.12, tags: { leisure: 'playground' }, status: 'unknown', evidence: null, ...over });
const insertPlace = (p) => db.query(
  `insert into public.open_data_places (familypilot_place_id, import_batch_id, source_record_id, name, group_id, subtype, lat, lng, source_tags, operating_status, status_evidence, identity_checked_at)
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, '2026-10-14T20:00:00Z') returning id`,
  [p.fid, p.batch, p.rec, p.name, p.group, p.subtype, p.lat, p.lng, JSON.stringify(p.tags), p.status, p.evidence]);

const p1 = (await insertPlace(place(1, b))).rows[0].id;
await insertPlace(place(2, b, { name: 'A Trampoline Park', group: 'play', subtype: 'trampoline_park', tags: { leisure: 'trampoline_park' } }));
await insertPlace(place(3, ogl, { fid: 'fp-os-gs-3', rec: 'GS-3', name: 'A Public Park', tags: { function: 'Public Park Or Garden' } }));
check(true, 'valid places from two batches are accepted');

check(await refuses(`insert into public.open_data_places (familypilot_place_id, import_batch_id, source_record_id, name, group_id, lat, lng, identity_checked_at) values ('x', null, 'r', 'n', 'parks', 51.5, -0.1, now())`), 'a place with no batch is refused');
check(await refuses(`insert into public.open_data_places (familypilot_place_id, import_batch_id, source_record_id, name, group_id, lat, lng, identity_checked_at) values ('x', '${b}', 'r2', 'n', 'swimming', 51.5, -0.1, now())`), 'a place in a group that does not exist is refused');
check(await refuses(`insert into public.open_data_places (familypilot_place_id, import_batch_id, source_record_id, name, group_id, lat, lng, identity_checked_at) values ('x', '${b}', 'r3', 'n', 'parks', 48.8, 2.3, now())`), 'a place outside the London box is refused');
check(await refuses(`insert into public.open_data_places (familypilot_place_id, import_batch_id, source_record_id, name, group_id, lat, lng, identity_checked_at) values ('x', '${b}', 'way/1@v1', 'n', 'parks', 51.5, -0.1, now())`), 'the same source record twice in one batch is refused');
check(await refuses(`insert into public.open_data_places (familypilot_place_id, import_batch_id, source_record_id, name, group_id, lat, lng, operating_status, identity_checked_at) values ('x', '${b}', 'r5', 'n', 'parks', 51.5, -0.1, 'permanently_closed', now())`), 'a closure with no evidence is refused');
check(!(await refuses(`insert into public.open_data_places (familypilot_place_id, import_batch_id, source_record_id, name, group_id, lat, lng, operating_status, status_evidence, identity_checked_at) values ('y', '${b}', 'r6', 'n', 'parks', 51.5, -0.1, 'permanently_closed', 'tagged disused:leisure=playground in the extract', now())`)), 'a closure with its evidence is accepted');
await db.query(`delete from public.open_data_places where familypilot_place_id = 'y'`);

await db.query(`insert into public.open_data_place_links (open_data_place_id, familypilot_place_id, match_method, match_confidence) values ($1, 'fp-google-A', 'name_and_distance', 0.93)`, [p1]);
check(await refuses(`insert into public.open_data_place_links (open_data_place_id, familypilot_place_id, match_method) values ($1, 'fp-google-DOES-NOT-EXIST', 'manual')`, [p1]), 'a link to a place that is not stored is refused');
check(await refuses(`insert into public.open_data_place_links (open_data_place_id, familypilot_place_id, match_method) values ($1, 'fp-google-A', 'guess')`, [p1]), 'a link by an unlisted method is refused');

// Security: roles, as Supabase has them.
await db.exec('set role anon');
check((await db.query('select count(*)::int as n from public.open_data_places')).rows[0].n === 3, 'the public key can read the places');
check(await refuses('select * from public.place_import_batches'), 'the public key cannot read the batch ledger');
check(await refuses('select * from public.open_data_place_links'), 'the public key cannot read the links');
check(await refuses(`delete from public.open_data_places`), 'the public key cannot change the places');
await db.exec('reset role');

// Rollback of one batch.
await db.exec('begin');
const gone = (await db.query('delete from public.open_data_places where import_batch_id = $1', [b]));
await db.query('delete from public.place_import_batches where id = $1', [b]);
await db.exec('commit');
check(gone.affectedRows === 2, 'withdrawing the ODbL batch removes exactly its 2 places', `${gone.affectedRows}`);
check((await db.query('select count(*)::int as n from public.open_data_places')).rows[0].n === 1, 'the other batch is untouched');
check((await db.query('select count(*)::int as n from public.open_data_place_links')).rows[0].n === 0, 'the link went with its place');
check((await db.query('select count(*)::int as n from public.place_records')).rows[0].n === rowsBefore, 'the Google place is still there');

// Full rollback.
await db.exec(down);
const left = (await db.query(`select table_name from information_schema.tables where table_schema = 'public' order by 1`)).rows.map((r) => r.table_name);
check(left.join(',') === 'place_records', 'the full rollback leaves only the table that was there before', left.join(','));

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
