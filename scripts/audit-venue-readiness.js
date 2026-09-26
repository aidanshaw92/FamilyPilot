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
  CLAIM_STATES,
  PROVIDER_STATES,
  DERIVED_STATES,
  auditCatalogue,
  readinessTier,
  buildVenueRows,
} = require('../server/enrichment/_lib/venue-readiness-audit');

/**
 * Fixture codes, one vocabulary per origin.
 *
 * Provider and derived fields deliberately do NOT share the claim vocabulary: "the venue has a
 * photo" and "a source confirmed baby changing three days ago" are different kinds of statement,
 * and the first revision of this audit merged them into one `confirmed_fresh` total that meant
 * nothing.
 */
const CLAIM_CODES = {
  F: 'confirmed_fresh',
  R: 'confirmed_refresh_due',
  S: 'stale',
  C: 'conflicting',
  D: 'candidate_not_publishable',
  U: 'unsupported',
  '.': 'unknown',
};
const PROVIDER_CODES = { P: 'present', M: 'missing' };
const DERIVED_CODES = { A: 'available', N: 'unavailable' };

function codeTableFor(origin) {
  if (origin === 'claim') return CLAIM_CODES;
  if (origin === 'provider') return PROVIDER_CODES;
  return DERIVED_CODES;
}

/** `id~status~activeClaimCount~<one code per field>` */
function fromFile(path) {
  return fs
    .readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() && line.includes('~'))
    .map((line, index) => {
      const [familypilotPlaceId, enrichmentStatus, activeClaims, codes] = line.split('~');
      if ((codes ?? '').length !== FIELD_INVENTORY.length) {
        throw new Error(
          `line ${index + 1}: expected ${FIELD_INVENTORY.length} state codes, got ${(codes ?? '').length}`,
        );
      }
      const fieldStates = {};
      [...codes].forEach((code, position) => {
        const field = FIELD_INVENTORY[position];
        const state = codeTableFor(field.origin)[code];
        if (!state) {
          throw new Error(`line ${index + 1}: unknown state code ${JSON.stringify(code)} for ${field.origin} field ${field.key}`);
        }
        fieldStates[field.key] = state;
      });
      return {
        familypilotPlaceId,
        enrichmentStatus,
        activeClaimCount: Number(activeClaims),
        fieldStates,
      };
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
    supabase.from('venue_claims').select('familypilot_place_id, field_key, value_json, status, approved_by, valid_until, checked_at'),
    // draft_json is needed: a candidate is a FIELD, not a venue.
    supabase.from('venue_enrichment_drafts').select('familypilot_place_id, status, draft_json').eq('status', 'pending_review'),
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
  const { summary, byField, blockedHoldingUsableFacts } = result;

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify({ ...result, venues: venues.map((v) => ({ ...v, readiness: readinessTier(v) })) }, null, 2));
    return;
  }

  const total = summary.venues;
  console.log(`\nP0 Venue Intelligence baseline (ZERO WRITE)\n${'='.repeat(78)}`);
  console.log(`venues                          ${total}`);
  console.log(`claim cells   ${String(summary.claimCells).padStart(5)}  ledger balances ${summary.claimLedgerBalances ? 'yes' : 'NO'}`);
  console.log(`provider cells${String(summary.providerCells).padStart(5)}  ledger balances ${summary.providerLedgerBalances ? 'yes' : 'NO'}`);
  console.log(`derived cells ${String(summary.derivedCells).padStart(5)}  ledger balances ${summary.derivedLedgerBalances ? 'yes' : 'NO'}`);
  if (summary.expectedVenues != null) {
    console.log(`production says venues          ${summary.expectedVenues}`);
    console.log(`unexplained                     ${summary.unexplainedVenues}  ${summary.reconciles ? '(reconciles)' : 'NO -- COVERAGE GAP'}`);
  }

  console.log('\nCan FamilyPilot explain itself to a parent?  (consumer-path semantics)');
  for (const tier of ['T0', 'T1', 'T2', 'T3', 'T4']) {
    const n = summary.byTier[tier] ?? 0;
    const label = {
      T0: 'consumer serves no family facts (ai_draft, or no active claims)',
      T1: 'identity only: servable, zero usable facts',
      T2: 'thin: some facts, no coherent story',
      T3: 'explainable: facility + environment',
      T4: 'confidently recommendable (planner-ready)',
    }[tier];
    console.log(`  ${tier}  ${String(n).padStart(3)}  ${pct(n, total).padStart(6)}  ${label}`);
  }
  console.log(`\n  recommendation-ready (T4)     ${summary.recommendationReady}   ${pct(summary.recommendationReady, total)}`);
  console.log(`  explainable at all (T3+T4)    ${summary.explainable}   ${pct(summary.explainable, total)}`);

  console.log('\nFacts withheld by the consumer block (ai_draft only)');
  console.log(`  venues                        ${summary.blockedHoldingUsableFacts}`);
  console.log(`  usable claim-backed facts     ${summary.factsWithheldByConsumerBlock}`);
  for (const v of blockedHoldingUsableFacts) {
    console.log(`    - ${v.familypilotPlaceId}  [${v.enrichmentStatus}]  ${v.usableFacts} fact(s)`);
  }

  console.log('\nClaim-backed fields       usable   %of134  servable   %      state breakdown');
  const claimFields = FIELD_INVENTORY.filter((f) => f.origin === 'claim')
    .sort((a, b) => (byField[b.key].usable - byField[a.key].usable) || a.key.localeCompare(b.key));
  for (const field of claimFields) {
    const row = byField[field.key];
    const states = CLAIM_STATES.filter((s) => row[s] > 0).map((s) => `${s}=${row[s]}`).join(' ');
    console.log(
      `  ${field.key.padEnd(22)}${String(row.usable).padStart(4)}  ${pct(row.usable, total).padStart(7)}` +
      `   ${String(row.servable).padStart(4)}  ${pct(row.servable, total).padStart(6)}   ${states}`,
    );
  }

  console.log('\nProvider fields (availability, NOT claim freshness)');
  for (const field of FIELD_INVENTORY.filter((f) => f.origin === 'provider')) {
    const row = byField[field.key];
    console.log(`  ${field.key.padEnd(22)}present=${String(row.present).padStart(3)}  missing=${String(row.missing).padStart(3)}  ${pct(row.present, total)}`);
  }
  console.log('\nDerived fields (capability, NOT confirmed data)');
  for (const field of FIELD_INVENTORY.filter((f) => f.origin === 'derived')) {
    const row = byField[field.key];
    console.log(`  ${field.key.padEnd(22)}available=${String(row.available).padStart(3)}  unavailable=${String(row.unavailable).padStart(3)}  ${pct(row.available, total)}`);
  }

  console.log('\nClaim cells by state');
  for (const state of CLAIM_STATES) {
    console.log(`  ${state.padEnd(28)}${String(summary.claimStateTotals[state]).padStart(5)}  ${pct(summary.claimStateTotals[state], summary.claimCells)}`);
  }
  console.log(`\nprovider: ${JSON.stringify(summary.providerStateTotals)}   derived: ${JSON.stringify(summary.derivedStateTotals)}`);
  console.log();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
