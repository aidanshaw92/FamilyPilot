#!/usr/bin/env node
/**
 * Re-decides whose page each STORED evidence row is, under the current website-identity rules, and reports what would
 * change. Dry run by default; nothing is fetched and no Google request of any kind is made.
 *
 * WHY THIS EXISTS
 *
 * `subject_scope` is recorded when a page is fetched and never revisited. The identity rules have since learned three
 * things (source-identity.js): a trailing language or front-page segment is not a section (`madametussauds.com/london/en/`),
 * a venue's name is its own name without an operator suffix ("Walthamstow Wetlands, London Wildlife Trust"), and a
 * reviewed list of extra official roots (official-source-overrides.js `OFFICIAL_ROOTS`: Dulwich Park's friends' site,
 * Crystal Palace Park's visitor site, Primrose Hill's own Royal Parks page). Pages stored before those rules keep their old verdict, so their
 * true facts stay withheld ("There is no parking onsite" at Madame Tussauds). This script is how the stored rows catch up
 * without a crawl.
 *
 * WHAT A WRITE DOES, AND WHY IT IS LOCKED
 *
 * A row that becomes eligible can let a fact on it be approved into a NEW served claim, and auto-approve runs off the
 * every-minute enrichment cron. So, exactly like `backfill-subject-scope.mjs`, the write is double-locked: `--write` AND
 * `RESCOPE_CONFIRM=yes`. The owner reviews the dry-run report (each newly eligible row is listed with the facts it
 * carries) before anything is written. A written row keeps its previous verdict in `subject_scope_reason`
 * (`rescoped_2026_10 from <old scope>: <new reason>`), so the change is auditable and reversible row by row.
 *
 * Usage:
 *   node scripts/rescope-evidence.mjs                                   # dry run against the database
 *   node scripts/rescope-evidence.mjs --input ev.json --catalogue c.json # dry run against exported rows (offline)
 *   node scripts/rescope-evidence.mjs --json                             # machine-readable
 *   RESCOPE_CONFIRM=yes node scripts/rescope-evidence.mjs --write                       # widening changes only
 *   RESCOPE_CONFIRM=yes node scripts/rescope-evidence.mjs --write --include-narrowing   # and rows losing eligibility
 *
 * `--as-of YYYY-MM-DD` (default today) marks which newly eligible facts are still inside the 14-day window in which
 * auto-approve may use a reading; older ones need a fresh `refetch_official` read (no Google) to count.
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { classifySubjectScope, isEligibleScope } = require(join(root, 'server/enrichment/_lib/source-identity.js'));
const { officialWebsiteFor, officialRootsFor } = require(join(root, 'server/enrichment/_lib/official-source-overrides.js'));

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const WRITE = args.includes('--write');
const AS_JSON = args.includes('--json');
const INPUT = flag('--input');
const CATALOGUE = flag('--catalogue');
const AS_OF = flag('--as-of') ?? new Date().toISOString().slice(0, 10);
const FRESH_DAYS = 14;
const TAG = 'rescoped_2026_10';
/**
 * A row that would LOSE eligibility is reported, never written by default. Most are the Historic England register pages
 * of venues that now start from their council page (official-source-overrides.js), correctly not visitor pages; but a
 * served claim may cite one, so narrowing is a separate decision with its own flag.
 */
const INCLUDE_NARROWING = args.includes('--include-narrowing');

if (WRITE && process.env.RESCOPE_CONFIRM !== 'yes') {
  console.error(
    'Refusing to write without RESCOPE_CONFIRM=yes.\n\n' +
      'A row that becomes eligible can let withheld evidence be approved into a new served claim, and auto-approve runs\n' +
      'off the every-minute enrichment cron. Review the dry run first, and consider pausing the cron.',
  );
  process.exit(2);
}
if (WRITE && INPUT) {
  console.error('--write reads and writes the database; it cannot be combined with --input.');
  process.exit(2);
}

/** Identities exactly as `evidence-pipeline` hands them to the classifier. */
const identity = (p) => ({
  familypilotPlaceId: p.familypilotPlaceId,
  name: p.name,
  website: officialWebsiteFor(p.familypilotPlaceId, p.website),
  officialRoots: officialRootsFor(p.familypilotPlaceId),
});

let places;
let rows;
let supabase = null;
if (INPUT) {
  places = JSON.parse(readFileSync(CATALOGUE, 'utf8'));
  rows = JSON.parse(readFileSync(INPUT, 'utf8')).map((r) => ({
    id: r.id, familypilot_place_id: r.vid, source_url: r.url, page_title: r.title, subject_scope: r.scope,
    fetch_status: r.fs, retrieved_at: r.d, facts: r.facts ?? [],
  }));
} else {
  const { getSupabaseAdmin } = require(join(root, 'server/enrichment/_lib/supabase-admin.js'));
  supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error('Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or pass --input.');
    process.exit(2);
  }
  const readAll = async (table, columns) => {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return out;
  };
  places = (await readAll('place_records', 'familypilot_place_id, name, website')).map((p) => ({
    familypilotPlaceId: p.familypilot_place_id, name: p.name, website: p.website,
  }));
  rows = (await readAll('venue_source_evidence', 'id, familypilot_place_id, source_url, page_title, subject_scope, fetch_status, retrieved_at, extracted_evidence'))
    .map((r) => ({
      ...r,
      facts: (Array.isArray(r.extracted_evidence) ? r.extracted_evidence : []).map((f) => ({ f: f.field, v: f.value, c: f.confidence, t: f.evidenceText })),
    }));
}

const catalogue = places.filter((p) => p.website).map(identity);
const byId = new Map(places.map((p) => [p.familypilotPlaceId, identity(p)]));
const asOf = Date.parse(AS_OF);

const changes = [];
for (const row of rows) {
  const venue = byId.get(row.familypilot_place_id);
  if (!venue || !row.subject_scope) continue; // unclassified rows belong to backfill-subject-scope.mjs
  const verdict = classifySubjectScope({ sourceUrl: row.source_url, pageTitle: row.page_title ?? null, venue, catalogue });
  if (!verdict?.scope || verdict.scope === row.subject_scope) continue;
  const usable = ['ok', 'cached', 'fetched_truncated'].includes(row.fetch_status);
  const ageDays = (asOf - Date.parse(row.retrieved_at)) / 86_400_000;
  changes.push({
    id: row.id,
    venue: venue.name,
    venueId: venue.familypilotPlaceId,
    url: row.source_url,
    from: row.subject_scope,
    to: verdict.scope,
    reason: verdict.reason,
    becomesEligible: !isEligibleScope(row.subject_scope) && isEligibleScope(verdict.scope),
    becomesIneligible: isEligibleScope(row.subject_scope) && !isEligibleScope(verdict.scope),
    usable,
    withinFreshWindow: usable && ageDays <= FRESH_DAYS,
    retrievedAt: String(row.retrieved_at).slice(0, 10),
    facts: usable ? row.facts.filter((f) => f.c === 'high' && f.v !== 'unknown').map((f) => `${f.f}=${f.v}: ${String(f.t ?? '').slice(0, 140)}`) : [],
  });
}

const eligible = changes.filter((c) => c.becomesEligible);
const summary = {
  mode: WRITE ? 'write' : 'dry-run',
  asOf: AS_OF,
  rowsRead: rows.length,
  rowsChanging: changes.length,
  becomeEligible: eligible.length,
  becomeIneligible: changes.filter((c) => c.becomesIneligible).length,
  venuesGainingEligibleRows: new Set(eligible.map((c) => c.venueId)).size,
  eligibleRowsWithHighConfidenceFacts: eligible.filter((c) => c.facts.length > 0).length,
  thoseStillInsideFreshWindow: eligible.filter((c) => c.facts.length > 0 && c.withinFreshWindow).length,
};

if (AS_JSON) {
  console.log(JSON.stringify({ summary, changes }, null, 2));
} else {
  console.log(JSON.stringify(summary, null, 2));
  for (const c of eligible.filter((x) => x.facts.length > 0)) {
    console.log(`\n${c.venue}  ${c.from} -> ${c.to} (${c.reason})  read ${c.retrievedAt}${c.withinFreshWindow ? '' : '  [older than 14 days]'}\n  ${c.url}`);
    for (const f of c.facts) console.log(`    ${f}`);
  }
}

if (!WRITE) process.exit(0);

/** One row at a time, and only where the stored verdict is still the one this run read: a concurrent crawl wins. */
let written = 0;
let skipped = 0;
for (const c of changes.filter((x) => x.becomesEligible || INCLUDE_NARROWING)) {
  const { data, error } = await supabase
    .from('venue_source_evidence')
    .update({ subject_scope: c.to, subject_scope_reason: `${TAG} from ${c.from}: ${c.reason}` })
    .eq('id', c.id)
    .eq('subject_scope', c.from)
    .select('id');
  if (error) throw new Error(`update ${c.id}: ${error.message}`);
  if (data && data.length > 0) written += 1;
  else skipped += 1;
}
console.log(`\nwritten: ${written}, skipped (changed by someone else since the read): ${skipped}`);
