#!/usr/bin/env node
/**
 * P0 Venue Intelligence: the zero-write baseline readiness audit.
 *
 * WRITES NOTHING. Reads `place_records`, `venue_family_metadata`, `venue_claims` and
 * `venue_enrichment_drafts` and reports what FamilyPilot could honestly tell a parent today.
 *
 *   node scripts/audit-venue-readiness.js                      # live, needs SUPABASE_URL + service key
 *   node scripts/audit-venue-readiness.js --corpus <dir>       # offline, from a checksummed snapshot
 *   node scripts/audit-venue-readiness.js --corpus <dir> --json
 *
 * The offline corpus is four files -- `places.txt`, `meta.txt`, `claims.txt`, `drafts.txt` -- each a
 * line-per-row projection of the production table, transferred with an md5 computed in SQL and
 * verified locally. It feeds the SAME classification code the live run uses: the corpus decides no
 * verdicts, only the inputs. `decodeCorpus` in the audit module documents exactly what is carried
 * and what is stood in for, and its guards are exercised by the test suite.
 */

const fs = require('fs');
const path = require('path');
const {
  FIELD_INVENTORY,
  CLAIM_STATES,
  SOURCE_AFFINITY,
  decodeCorpus,
  auditCatalogue,
  readinessTier,
  buildVenueRows,
} = require('../server/enrichment/_lib/venue-readiness-audit');

function fromCorpus(dir, today) {
  const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8');
  return buildVenueRows(
    decodeCorpus({
      places: read('places.txt'),
      metadata: read('meta.txt'),
      claims: read('claims.txt'),
      drafts: read('drafts.txt'),
    }),
    today,
  );
}

async function fromDatabase(today) {
  const { getSupabaseAdmin } = require('../server/enrichment/_lib/supabase-admin');
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('No Supabase credentials: pass --corpus <dir> for an offline run.');

  // Read-only, and explicitly so: this script never calls a writer.
  const [places, metadata, claims, drafts] = await Promise.all([
    supabase.from('place_records').select('familypilot_place_id, name, lat, lng, category, photos, opening_hours, website'),
    supabase.from('venue_family_metadata').select('*'),
    // source_url is what makes source-to-venue affinity measurable; without it every claim reads as unestablished.
    supabase.from('venue_claims').select('familypilot_place_id, field_key, value_json, status, approved_by, valid_until, checked_at, source_url'),
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
  }, today);
}

function pct(n, total) {
  return total === 0 ? '0.0%' : `${((n / total) * 100).toFixed(1)}%`;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };

  /**
   * The snapshot date is explicit so the published baseline can be replayed from the same rows on
   * any later day. It is threaded all the way down to the canonical `isClaimActive`, which is why
   * that predicate had to become date-injectable.
   */
  const today = arg('--today') ?? new Date().toISOString().slice(0, 10);
  const corpus = arg('--corpus');
  const venues = corpus ? fromCorpus(corpus, today) : await fromDatabase(today);

  const expectedIndex = args.indexOf('--expect-venues');
  const expected = expectedIndex >= 0 ? { venues: Number(args[expectedIndex + 1]) } : {};

  const result = auditCatalogue(venues, { expected }, today);
  const { summary, byField, blockedHoldingUsableFacts } = result;

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify({
      ...result,
      venues: venues.map((v) => ({
        ...v,
        readiness: readinessTier(v),
        readinessIdentitySafe: readinessTier(v, { identitySafeOnly: true }),
      })),
    }, null, 2));
    return;
  }

  const total = summary.venues;
  console.log(`\nP0 Venue Intelligence baseline (ZERO WRITE)\n${'='.repeat(78)}`);
  console.log(`snapshot date                   ${summary.today}${corpus ? `  (offline corpus ${corpus})` : '  (live)'}`);
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

  /**
   * The second reading of the same rows. It is printed next to the first, never instead of it: the
   * consumer serves the contested facts today, so a report that showed only the strict figure would
   * misdescribe what parents see, and one that showed only the served figure would assume every
   * source attached to a venue describes it.
   */
  console.log('\nSource-to-venue affinity  (SUSPICION signal, not a verdict this audit acts on)');
  for (const affinity of SOURCE_AFFINITY) {
    const all = summary.sourceAffinityTotals[affinity];
    const served = summary.servedSourceAffinityTotals[affinity];
    console.log(
      `  ${affinity.padEnd(14)}${String(all).padStart(5)} usable  ${pct(all, summary.usableFacts).padStart(7)}` +
      `   ${String(served).padStart(5)} served  ${pct(served, summary.servedFacts).padStart(7)}`,
    );
  }
  console.log(`\n  usable claim-backed facts     ${summary.usableFacts}`);
  console.log(`  of those, served to parents   ${summary.servedFacts}   ${pct(summary.servedFacts, summary.usableFacts)}`);
  console.log(`  served AND identity-safe      ${summary.servedIdentitySafeFacts}   ${pct(summary.servedIdentitySafeFacts, summary.servedFacts)} of served`);

  console.log('\nSame tiers, restricted to facts whose source this audit can tie to the venue');
  for (const tier of ['T0', 'T1', 'T2', 'T3', 'T4']) {
    const served = summary.byTier[tier] ?? 0;
    const strict = summary.byTierIdentitySafe[tier] ?? 0;
    const delta = strict - served;
    console.log(
      `  ${tier}  served ${String(served).padStart(3)}  identity-safe ${String(strict).padStart(3)}` +
      `  ${delta === 0 ? '' : `(${delta > 0 ? '+' : ''}${delta})`}`,
    );
  }
  console.log(`\n  explainable, identity-safe    ${summary.explainableIdentitySafe}   ${pct(summary.explainableIdentitySafe, total)}`);

  console.log('\nFacts withheld by the consumer block (ai_draft only)');
  console.log(`  venues                        ${summary.blockedHoldingUsableFacts}`);
  console.log(`  usable claim-backed facts     ${summary.factsWithheldByConsumerBlock}`);
  for (const v of blockedHoldingUsableFacts) {
    console.log(`    - ${v.familypilotPlaceId}  [${v.enrichmentStatus}]  ${v.usableFacts} fact(s)`);
  }

  console.log('\nClaim-backed fields       usable       %  servable  safe     state breakdown');
  const claimFields = FIELD_INVENTORY.filter((f) => f.origin === 'claim')
    .sort((a, b) => (byField[b.key].usable - byField[a.key].usable) || a.key.localeCompare(b.key));
  for (const field of claimFields) {
    const row = byField[field.key];
    const states = CLAIM_STATES.filter((s) => row[s] > 0).map((s) => `${s}=${row[s]}`).join(' ');
    console.log(
      `  ${field.key.padEnd(22)}${String(row.usable).padStart(4)}  ${pct(row.usable, total).padStart(7)}` +
      `   ${String(row.servable).padStart(6)}  ${String(row.servableIdentitySafe).padStart(4)}     ${states}`,
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
