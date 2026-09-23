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

function pct(n, total) {
  return total === 0 ? '0.0%' : `${((n / total) * 100).toFixed(1)}%`;
}

async function main() {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf('--file');
  const records = fileIndex >= 0 ? fromFile(args[fileIndex + 1]) : await fromDatabase();

  const { summary, candidates } = auditEvidence(records);

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify({ summary, candidates }, null, 2));
    return;
  }

  const total = summary.candidateCount;
  console.log(`\nP0-B3 age-evidence audit (ZERO WRITE)\n${'='.repeat(60)}`);
  console.log(`evidence rows examined        ${summary.pagesExamined}`);
  console.log(`rows carrying age wording     ${summary.pagesWithAgeSignal}`);
  console.log(`venues covered                ${summary.venuesWithEvidence}`);
  console.log(`classified statements         ${total}\n`);

  console.log('By category                   count    share    venues');
  for (const [category, count] of Object.entries(summary.candidatesByCategory).sort((a, b) => b[1] - a[1])) {
    console.log(
      `  ${category.padEnd(28)}${String(count).padStart(3)}   ${pct(count, total).padStart(6)}    ${summary.venuesByCategory[category] ?? 0}`,
    );
  }

  console.log('\nBy source type');
  for (const [type, count] of Object.entries(summary.sourceTypeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(28)}${String(count).padStart(3)}`);
  }

  console.log('\nAgainst the shipped B2 semantics');
  console.log(`  would become a hard gate    ${summary.candidatesThatWouldGate}   ${pct(summary.candidatesThatWouldGate, total)}`);
  console.log(`  need human review first     ${summary.candidatesNeedingHumanReview}   ${pct(summary.candidatesNeedingHumanReview, total)}`);
  console.log(`  expose a model gap          ${summary.modelGaps}   ${pct(summary.modelGaps, total)}`);

  const gapExamples = candidates.filter((c) => c.modelGap).slice(0, 5);
  if (gapExamples.length > 0) {
    console.log('\nModel gaps, with the wording that caused them');
    for (const c of gapExamples) {
      console.log(`  - [${c.category}] ${c.excerpt.slice(0, 100)}`);
      console.log(`      ${c.modelGap}`);
    }
  }
  console.log();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
