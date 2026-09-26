#!/usr/bin/env node
/**
 * P0 Venue Intelligence: the zero-write baseline readiness audit.
 *
 * WRITES NOTHING. Reads `place_records`, `venue_family_metadata`, `venue_claims` and
 * `venue_enrichment_drafts` and reports what FamilyPilot could honestly tell a parent today.
 *
 *   node scripts/audit-venue-readiness.js                     # live, needs SUPABASE_URL + service key
 *   node scripts/audit-venue-readiness.js --file catalogue.txt # offline: id~status~<22 state codes>
 *   node scripts/audit-venue-readiness.js --file c.txt --json
 *
 * The offline fixture is one line per venue with one character per field, in FIELD_INVENTORY order.
 * It is transferred from the database with an md5 computed in SQL and verified locally, because a
 * truncated transfer once made a corpus look complete when it was eight rows short.
 */

const fs = require('fs');
const {
  FIELD_INVENTORY,
  FIELD_STATES,
  auditCatalogue,
  readinessTier,
  buildVenueRows,
} = require('../server/enrichment/_lib/venue-readiness-audit');

/** Fixture code -> state. `.` is unknown, which is the default and must stay the default. */
const CODE_TO_STATE = {
  F: 'confirmed_fresh',
  R: 'confirmed_refresh_due',
  S: 'stale',
  C: 'conflicting',
  D: 'candidate_not_publishable',
  U: 'unsupported',
  '.': 'unknown',
};

function fromFile(path) {
  return fs
    .readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() && line.includes('~'))
    .map((line, index) => {
      const [familypilotPlaceId, enrichmentStatus, codes] = line.split('~');
      if ((codes ?? '').length !== FIELD_INVENTORY.length) {
        throw new Error(
          `line ${index + 1}: expected ${FIELD_INVENTORY.length} state codes, got ${(codes ?? '').length}`,
        );
      }
      const fieldStates = {};
      [...codes].forEach((code, position) => {
        const state = CODE_TO_STATE[code];
        if (!state) throw new Error(`line ${index + 1}: unknown state code ${JSON.stringify(code)}`);
        fieldStates[FIELD_INVENTORY[position].key] = state;
      });
      return { familypilotPlaceId, enrichmentStatus, fieldStates };
    });
}

async function fromDatabase() {
  const { getSupabaseAdmin } = require('../server/enrichment/_lib/supabase-admin');
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('No Supabase credentials: pass --file for an offline run.');

  // Read-only, and explicitly so: this script never calls a writer.
  const [places, metadata, claims, drafts] = await Promise.all([
    supabase.from('place_records').select('familypilot_place_id, name, lat, lng, category, photos, opening_hours, website'),
    supabase.from('venue_family_metadata').select('*'),
    supabase.from('venue_claims').select('familypilot_place_id, field_key, value_json, status, approved_by, valid_until'),
    supabase.from('venue_enrichment_drafts').select('familypilot_place_id, status').eq('status', 'pending_review'),
  ]);
  for (const result of [places, metadata, claims, drafts]) {
    if (result.error) throw new Error(result.error.message);
  }

  return buildVenueRows({
    places: places.data ?? [],
    metadata: metadata.data ?? [],
    claims: claims.data ?? [],
    pendingDrafts: drafts.data ?? [],
  });
}

function pct(n, total) {
  return total === 0 ? '0.0%' : `${((n / total) * 100).toFixed(1)}%`;
}

async function main() {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf('--file');
  const venues = fileIndex >= 0 ? fromFile(args[fileIndex + 1]) : await fromDatabase();

  const expectedIndex = args.indexOf('--expect-venues');
  const expected = expectedIndex >= 0 ? { venues: Number(args[expectedIndex + 1]) } : {};

  const result = auditCatalogue(venues, { expected });
  const { summary, byField, gatedHoldingUsableFacts } = result;

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify({ ...result, venues: venues.map((v) => ({ ...v, readiness: readinessTier(v) })) }, null, 2));
    return;
  }

  const total = summary.venues;
  console.log(`\nP0 Venue Intelligence baseline (ZERO WRITE)\n${'='.repeat(74)}`);
  console.log(`venues                          ${total}`);
  console.log(`fields per venue                ${summary.fields}`);
  console.log(`venue/field cells               ${summary.cells}`);
  console.log(`every cell in exactly one state ${summary.accountsForEveryCell ? 'yes' : 'NO -- LEDGER BROKEN'}`);
  if (summary.expectedVenues != null) {
    console.log(`production says venues          ${summary.expectedVenues}`);
    console.log(`unexplained                     ${summary.unexplainedVenues}  ${summary.reconciles ? '(reconciles)' : 'NO -- COVERAGE GAP'}`);
  }

  console.log('\nThe question that matters: can FamilyPilot explain itself to a parent?');
  for (const tier of ['T0', 'T1', 'T2', 'T3', 'T4']) {
    const n = summary.byTier[tier] ?? 0;
    const label = { T0: 'status-gated: serves no facts at all', T1: 'identity only: servable, zero facts',
      T2: 'thin: some facts, no coherent story', T3: 'explainable: facility + environment',
      T4: 'confidently recommendable (planner-ready)' }[tier];
    console.log(`  ${tier}  ${String(n).padStart(3)}  ${pct(n, total).padStart(6)}  ${label}`);
  }
  console.log(`\n  recommendation-ready (T4)     ${summary.recommendationReady}   ${pct(summary.recommendationReady, total)}`);
  console.log(`  explainable at all (T3+T4)    ${summary.explainable}   ${pct(summary.explainable, total)}`);

  console.log('\nVerified work the status gate is discarding');
  console.log(`  gated venues holding usable facts  ${summary.gatedHoldingUsableFacts}`);
  console.log(`  usable facts discarded             ${summary.discardedUsableFacts}`);
  for (const v of gatedHoldingUsableFacts) {
    console.log(`    - ${v.familypilotPlaceId}  ${v.usableFacts} fact(s)`);
  }

  console.log('\nField coverage            usable   %of all   servable   %  origin      state breakdown');
  const ordered = [...FIELD_INVENTORY].sort((a, b) => (byField[b.key].usable - byField[a.key].usable) || a.key.localeCompare(b.key));
  for (const field of ordered) {
    const row = byField[field.key];
    const states = FIELD_STATES.filter((s) => row[s] > 0).map((s) => `${s}=${row[s]}`).join(' ');
    console.log(
      `  ${field.key.padEnd(22)}${String(row.usable).padStart(4)}  ${pct(row.usable, total).padStart(7)}` +
      `   ${String(row.usableAndServable).padStart(4)}  ${pct(row.usableAndServable, total).padStart(6)}` +
      `  ${field.origin.padEnd(9)}  ${states}`,
    );
  }

  console.log('\nCells by state');
  for (const state of FIELD_STATES) {
    console.log(`  ${state.padEnd(28)}${String(summary.byState[state]).padStart(5)}  ${pct(summary.byState[state], summary.cells)}`);
  }
  console.log();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
