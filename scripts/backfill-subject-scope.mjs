#!/usr/bin/env node
/**
 * Classifies the `subject_scope` of stored evidence rows that have none.
 *
 * WHY THIS EXISTS
 *
 * `venue_source_evidence.subject_scope` records whether a fetched page is about the venue it was
 * stored under. `isEligibleScope` fails closed on NULL, so a row stored before
 * `20260926140000_venue_source_evidence_subject_scope.sql` may not establish a fact today. The
 * codebase already knew this and deferred it on purpose -- `trusted-evidence.js` says so in as many
 * words: "Repairing what is already published is Phase 6 and belongs behind its own gate." What was
 * missing was the size of it.
 *
 * Measured on 2026-10-01: 763 rows across 121 venues have a NULL scope, and of the 242 claims
 * currently served to parents across 74 venues, 165 (68%) cite one of them.
 *
 * NULL means UNCLASSIFIED, NOT FALSE. None of those claims is shown to be wrong, and nothing here
 * invalidates, disputes, deletes or falsifies anything. This script only fills in the classification
 * that was never recorded, using the same `classifySubjectScope` the pipeline applies at crawl time,
 * from the stored URL and page title. It fetches nothing, and it makes no Google request of any kind.
 *
 * ⚠️  THE HAZARD, AND WHY THIS IS DRY-RUN BY DEFAULT
 *
 * Writing a scope is not inert. `auto-approve.js` checks `isEligibleScope` before approving a draft,
 * so a row that becomes eligible can let evidence that was previously withheld be auto-approved into
 * a NEW served claim. `familypilot-automatic-enrichment` runs EVERY MINUTE. A write here can therefore
 * publish claims to parents within the hour, with nobody having reviewed them -- which is precisely
 * the "unreviewed production repair" the deferral exists to prevent.
 *
 * So: the dry run is the default and prints what it would do. `--write` additionally requires
 * BACKFILL_CONFIRM=yes in the environment, and the owner should expect new claims to appear.
 * Consider pausing the enrichment cron for the duration.
 *
 * Usage:
 *   node scripts/backfill-subject-scope.mjs                 # dry run, reports only
 *   node scripts/backfill-subject-scope.mjs --json          # dry run, machine-readable
 *   BACKFILL_CONFIRM=yes node scripts/backfill-subject-scope.mjs --write
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).
 */
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const { classifySubjectScope, isEligibleScope } = require(
  join(root, 'server/enrichment/_lib/source-identity.js'),
);
const { getSupabaseAdmin } = require(join(root, 'server/enrichment/_lib/supabase-admin.js'));

const WRITE = process.argv.includes('--write');
const AS_JSON = process.argv.includes('--json');
const PAGE = 1000;

if (WRITE && process.env.BACKFILL_CONFIRM !== 'yes') {
  console.error(
    'Refusing to write without BACKFILL_CONFIRM=yes.\n\n' +
      'Filling a subject_scope can make previously withheld evidence eligible, and auto-approve runs\n' +
      'off the back of the every-minute enrichment cron, so new claims may be published to parents\n' +
      'shortly after this completes. Re-run with BACKFILL_CONFIRM=yes if that is intended.',
  );
  process.exit(2);
}

const supabase = getSupabaseAdmin();
if (!supabase) {
  console.error('Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(2);
}

/** Every row is read in pages, because a truncated read would silently skip rows. */
async function readAll(table, columns, filter) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

const places = await readAll('place_records', 'familypilot_place_id, name, website');
/** The same shape `evidence-pipeline` hands the classifier: every catalogue venue with a website. */
const catalogue = places
  .filter((p) => p.website)
  .map((p) => ({ familypilotPlaceId: p.familypilot_place_id, name: p.name, website: p.website }));
const byId = new Map(places.map((p) => [p.familypilot_place_id, p]));

const rows = await readAll(
  'venue_source_evidence',
  'id, familypilot_place_id, source_url, page_title, subject_scope',
  (q) => q.is('subject_scope', null),
);

const counts = new Map();
const perVenue = new Map();
const updates = [];
let unknownVenue = 0;
let unclassifiable = 0;

for (const row of rows) {
  const place = byId.get(row.familypilot_place_id);
  if (!place) {
    unknownVenue += 1;
    continue;
  }
  let verdict;
  try {
    verdict = classifySubjectScope({
      sourceUrl: row.source_url,
      pageTitle: row.page_title ?? null,
      venue: { familypilotPlaceId: place.familypilot_place_id, name: place.name, website: place.website },
      catalogue,
    });
  } catch {
    unclassifiable += 1;
    continue;
  }
  if (!verdict?.scope) {
    unclassifiable += 1;
    continue;
  }

  counts.set(verdict.scope, (counts.get(verdict.scope) ?? 0) + 1);
  const agg = perVenue.get(place.name) ?? { eligible: 0, ineligible: 0 };
  if (isEligibleScope(verdict.scope)) agg.eligible += 1;
  else agg.ineligible += 1;
  perVenue.set(place.name, agg);

  updates.push({ id: row.id, subject_scope: verdict.scope, subject_scope_reason: verdict.reason });
}

const eligible = updates.filter((u) => isEligibleScope(u.subject_scope)).length;
const report = {
  mode: WRITE ? 'write' : 'dry-run',
  nullScopeRows: rows.length,
  classified: updates.length,
  wouldBeEligible: eligible,
  wouldBeIneligible: updates.length - eligible,
  unknownVenue,
  unclassifiable,
  byScope: Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1])),
};

if (AS_JSON) {
  console.log(JSON.stringify({ report, perVenue: Object.fromEntries(perVenue) }, null, 2));
} else {
  console.log('\n=== subject_scope backfill ===');
  console.log(JSON.stringify(report, null, 2));
  console.log('\nVenues whose unclassified evidence would come out INELIGIBLE (fails closed):');
  const ineligibleVenues = [...perVenue.entries()]
    .filter(([, v]) => v.ineligible > 0)
    .sort((a, b) => b[1].ineligible - a[1].ineligible);
  if (ineligibleVenues.length === 0) console.log('  (none)');
  for (const [name, v] of ineligibleVenues) {
    console.log(`  ${String(v.ineligible).padStart(3)} ineligible, ${String(v.eligible).padStart(3)} eligible  ${name}`);
  }
}

if (!WRITE) {
  console.log(
    '\nDry run: nothing was written. Re-run with --write and BACKFILL_CONFIRM=yes to apply.\n' +
      'Expect auto-approve to publish new claims shortly afterwards; consider pausing the\n' +
      'familypilot-automatic-enrichment cron first.',
  );
  process.exit(0);
}

/**
 * Written one row at a time against its own id, and only where `subject_scope` is STILL null. An
 * upsert would rewrite rows a concurrent crawl had classified in the meantime; this cannot.
 */
let written = 0;
let skipped = 0;
for (const update of updates) {
  const { data, error } = await supabase
    .from('venue_source_evidence')
    .update({ subject_scope: update.subject_scope, subject_scope_reason: update.subject_scope_reason })
    .eq('id', update.id)
    .is('subject_scope', null)
    .select('id');
  if (error) throw new Error(`update ${update.id}: ${error.message}`);
  if (data && data.length > 0) written += 1;
  else skipped += 1;
}

console.log(`\nwritten: ${written}, skipped (classified by someone else since the read): ${skipped}`);
