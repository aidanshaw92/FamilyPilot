#!/usr/bin/env node
/**
 * P0-B3: run the zero-write age-evidence audit and print a report.
 *
 * WRITES NOTHING. It reads `venue_source_evidence` (or a delimited fixture) and reports what the
 * pages already fetched actually say about age, and whether the P0-B2 model could act on it.
 *
 *   node scripts/audit-age-evidence.js                 # live, needs SUPABASE_URL + service role key
 *   node scripts/audit-age-evidence.js --file corpus   # offline, id~sourceType~date~url~sentence
 *   node scripts/audit-age-evidence.js --json          # machine-readable
 *
 * `--discovery pages=N,venues=M` feeds in a discovery total measured independently of this module
 * (the SQL scan over production, or the live query below). The ledger then reconciles two
 * implementations instead of balancing against itself, which is the only version of the check that
 * can actually fail.
 */

const fs = require('fs');
const { auditEvidence } = require('../server/enrichment/_lib/age-evidence-audit');

function fromFile(path) {
  return fs
    .readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() && line.includes('~'))
    .map((line) => {
      const [familypilotPlaceId, sourceType, retrievedAt, sourceUrl, ...rest] = line.split('~');
      const sentence = rest.join('~');
      return { familypilotPlaceId, sourceType, retrievedAt, sourceUrl, ageSentences: [sentence], extractedText: sentence };
    });
}

async function fromDatabase() {
  const { listEvidenceForVenue } = require('../server/enrichment/_lib/evidence-store');
  const { getSupabaseAdmin } = require('../server/enrichment/_lib/supabase-admin');
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('No Supabase credentials: pass --file for an offline run.');

  // Read-only, and explicitly so: this script never calls a writer.
  const { data, error } = await supabase
    .from('venue_source_evidence')
    .select('familypilot_place_id, source_url, source_type, retrieved_at, extracted_text, fetch_status')
    .in('fetch_status', ['ok', 'cached', 'fetched_truncated'])
    .limit(5000);
  if (error) throw new Error(error.message);
  void listEvidenceForVenue;

  return (data ?? []).map((row) => ({
    familypilotPlaceId: row.familypilot_place_id,
    sourceUrl: row.source_url,
    sourceType: row.source_type,
    retrievedAt: row.retrieved_at,
    extractedText: row.extracted_text,
  }));
}

/** `pages=104,venues=58,unquotable=23,unquotableVenues=10` -> the discovery totals to reconcile against. */
function parseDiscovery(spec) {
  const out = {};
  for (const part of String(spec ?? '').split(',')) {
    const [key, value] = part.split('=');
    if (key === 'pages') out.pagesWithAgeWording = Number(value);
    if (key === 'venues') out.venuesWithAgeWording = Number(value);
    if (key === 'unquotable') out.unquotablePages = Number(value);
    if (key === 'unquotableVenues') out.unquotableVenues = Number(value);
  }
  return out;
}

function pct(n, total) {
  return total === 0 ? '0.0%' : `${((n / total) * 100).toFixed(1)}%`;
}

async function main() {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf('--file');
  const records = fileIndex >= 0 ? fromFile(args[fileIndex + 1]) : await fromDatabase();

  const discoveryIndex = args.indexOf('--discovery');
  const discovery = discoveryIndex >= 0 ? parseDiscovery(args[discoveryIndex + 1]) : {};

  const { summary, candidates, skipped, unextractable } = auditEvidence(records, { discovery });

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify({ summary, candidates, skipped, unextractable }, null, 2));
    return;
  }

  const total = summary.classified;
  console.log(`\nP0-B3 age-evidence audit (ZERO WRITE)\n${'='.repeat(64)}`);
  console.log(`pages examined                  ${summary.pagesExamined}`);
  console.log(`pages carrying age wording      ${summary.pagesWithAgeSignal}`);
  console.log(`venues covered                  ${summary.venuesWithEvidence}`);
  console.log(`sentence occurrences            ${summary.sentenceOccurrences}`);
  console.log(`unique sentence text            ${summary.uniqueSentenceText}`);
  console.log(`classified                      ${summary.classified}`);
  console.log(`explicitly skipped              ${summary.explicitlySkipped}`);
  console.log(`accounts for every input        ${summary.accountsFor ? 'yes' : 'NO -- LEDGER BROKEN'}`);

  console.log('\nDiscovery ledger (pages, not sentences; expected totals measured independently)');
  console.log(`  production says carry age wording  ${summary.expectedPagesWithAgeWording ?? '(not supplied)'}`);
  console.log(`  yielded a quotable sentence        ${summary.pagesWithAgeSignal}`);
  console.log(`  age wording, nothing quotable      ${summary.pagesWithAgeWordingButNoSentence + (summary.unquotablePagesFromDiscovery ?? 0)}`);
  if (summary.unexplainedPages != null) {
    console.log(`  unexplained                        ${summary.unexplainedPages}`);
  }
  if (summary.unexplainedVenues != null) {
    console.log(`  unexplained venues                 ${summary.unexplainedVenues}`);
  }
  console.log(`  discovery reconciles               ${summary.discoveryAccountsFor ? 'yes' : 'NO -- COVERAGE GAP'}\n`);

  if (unextractable.length > 0) {
    console.log('Pages with age wording but no quotable sentence');
    for (const page of unextractable) {
      console.log(`  - ${page.sourceUrl} (${page.chars} chars): ${page.reason}`);
    }
    console.log();
  }

  console.log('By category                     count    share    venues');
  for (const [category, count] of Object.entries(summary.candidatesByCategory).sort((a, b) => b[1] - a[1])) {
    console.log(
      `  ${category.padEnd(30)}${String(count).padStart(3)}   ${pct(count, total).padStart(6)}    ${summary.venuesByCategory[category] ?? 0}`,
    );
  }

  console.log('\nSource types (pages / statements)');
  const types = new Set([...Object.keys(summary.pageSourceTypeCounts), ...Object.keys(summary.candidateSourceTypeCounts)]);
  for (const type of [...types].sort()) {
    console.log(`  ${type.padEnd(30)}${String(summary.pageSourceTypeCounts[type] ?? 0).padStart(3)} / ${summary.candidateSourceTypeCounts[type] ?? 0}`);
  }

  console.log('\nAgainst the shipped B2 semantics');
  console.log(`  would gate NOW                ${summary.wouldGateNow}   (always 0: B3 writes nothing)`);
  console.log(`  eligible if human-approved    ${summary.eligibleToGateIfHumanApproved}   ${pct(summary.eligibleToGateIfHumanApproved, total)}`);
  console.log(`  would need human review       ${summary.candidatesNeedingHumanReview}   ${pct(summary.candidatesNeedingHumanReview, total)}`);
  console.log(`  expose a model gap            ${summary.modelGaps}   ${pct(summary.modelGaps, total)}`);

  const eligible = candidates.filter((c) => c.eligibleToGateIfHumanApproved);
  if (eligible.length > 0) {
    console.log('\nCandidates that a human approval WOULD turn into a door');
    for (const c of eligible) {
      console.log(`  - [${c.sourceType}] admits min=${c.admittedMinMonthsInclusive} max=${c.admittedMaxMonthsExclusive}`);
      console.log(`      "${c.excerpt.slice(0, 110)}"`);
    }
  }
  console.log();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
