/**
 * Replay the real-evidence corpus through the CURRENT extractor and report, per venue and field, what the venue's own
 * pages establish, next to what production serves today. Zero network, zero spend: it reads only the fixture files.
 *
 *   node scripts/replay-evidence-corpus.cjs            summary table
 *   node scripts/replay-evidence-corpus.cjs --detail   every recovered or lost fact with its excerpt
 *   node scripts/replay-evidence-corpus.cjs --json     machine-readable
 */
const { loadCorpus, loadClaims } = require('../src/__tests__/fixtures/evidence-replay/load-corpus.cjs');
const { extractEvidenceFromText, mergeEvidenceBundles } = require('../../server/enrichment/_lib/evidence-extractor');
const { FIELD_MAP } = require('../../server/enrichment/_lib/trusted-evidence');

const FIELDS = ['babyChanging', 'toilets', 'cafe', 'parking', 'pushchairSuitability', 'freeParking', 'playground'];

function replay() {
  const pages = loadCorpus();
  const byVenue = new Map();
  for (const page of pages) {
    const text = page.sentences.join('\n');
    const facts = extractEvidenceFromText(text, {
      url: page.url, sourceType: page.sourceType, retrievedAt: page.retrievedAt, pageTitle: page.pageTitle,
    });
    const sources = byVenue.get(page.venueId) ?? [];
    sources.push({ url: page.url, subjectScope: page.subjectScope, facts });
    byVenue.set(page.venueId, sources);
  }
  const result = new Map();
  for (const [venueId, sources] of byVenue) {
    const merged = mergeEvidenceBundles(sources);
    const fields = {};
    for (const fact of merged) {
      if (!FIELDS.includes(fact.field)) continue;
      fields[fact.field] = {
        value: fact.evidenceStatus === 'conflict' ? 'conflict' : fact.value,
        confidence: fact.confidence,
        evidence: fact.evidenceText,
        sourceUrl: fact.sourceUrl,
      };
    }
    result.set(venueId, fields);
  }
  return result;
}

function compare(result, claims) {
  const rows = [];
  for (const [venueId, fields] of result) {
    for (const field of FIELDS) {
      const key = FIELD_MAP[field];
      const active = claims.find((c) => c.venueId === venueId && c.fieldKey === key && c.status === 'active');
      const disputed = claims.find((c) => c.venueId === venueId && c.fieldKey === key && c.status === 'disputed');
      const now = fields[field];
      // What auto-approval would publish: a non-conflicting, high-confidence value (trusted-evidence.eligibleFact).
      const publishable = now && now.value !== 'conflict' && now.confidence === 'high' ? now.value : null;
      rows.push({ venueId, field, live: active?.value ?? null, disputed: Boolean(disputed), replay: now?.value ?? null, publishable, evidence: now?.evidence ?? null });
    }
  }
  return rows;
}

if (require.main === module) {
  const rows = compare(replay(), loadClaims());
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const tally = {};
    for (const r of rows) {
      const t = (tally[r.field] ??= { live: 0, publishable: 0, gained: 0, lost: 0, changed: 0 });
      if (r.live) t.live += 1;
      if (r.publishable) t.publishable += 1;
      if (r.publishable && !r.live) t.gained += 1;
      if (r.live && !r.publishable) t.lost += 1;
      if (r.live && r.publishable && r.live !== r.publishable) t.changed += 1;
    }
    console.table(tally);
    if (process.argv.includes('--detail')) {
      for (const r of rows) {
        if ((r.publishable ?? null) === (r.live ?? null)) continue;
        console.log(`${r.venueId} ${r.field}: live=${r.live} replay=${r.replay} publishable=${r.publishable}\n    ${r.evidence ?? ''}`);
      }
    }
  }
}

module.exports = { replay, compare, FIELDS };
