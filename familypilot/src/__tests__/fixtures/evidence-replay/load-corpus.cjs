/**
 * The evidence replay corpus: real sentences from venues' OWN pages, exported read-only from the production evidence
 * store on 7 Oct 2026 (the latest stored reading per page, own-subtree or named-page scope only), restricted to sentences
 * that mention a family facility, buggy access, food, parking or ages. See docs/VENUE_EVIDENCE_RECOVERY.md.
 *
 * Format, one record per line:
 *   P|venueId|url|subjectScope|sourceType|retrievedAt|fetchStatus|pageTitle
 *   S|sentence
 * ASCII double quotes and backslashes were replaced by spaces on export. Nothing else was edited.
 */
const fs = require('node:fs');
const path = require('node:path');

const DIR = __dirname;

function loadCorpus() {
  const pages = [];
  for (const file of fs.readdirSync(DIR).filter((f) => /^corpus-\d+\.txt$/.test(f)).sort()) {
    let page = null;
    for (const line of fs.readFileSync(path.join(DIR, file), 'utf8').split('\n')) {
      if (line.startsWith('P|')) {
        const [, venueId, url, subjectScope, sourceType, retrievedAt, fetchStatus, ...title] = line.split('|');
        page = { venueId, url, subjectScope, sourceType, retrievedAt, fetchStatus, pageTitle: title.join('|').trim() || null, sentences: [] };
        pages.push(page);
      } else if (line.startsWith('S|') && page) {
        page.sentences.push(line.slice(2));
      }
    }
  }
  return pages;
}

/** Active and disputed production claims for the corpus venues, abridged to one row per venue/field/status. */
function loadClaims() {
  return fs.readFileSync(path.join(DIR, 'claims-2026-10-07.txt'), 'utf8').split('\n').filter(Boolean).map((line) => {
    const [venueId, fieldKey, value, status, validUntil] = line.split('|');
    return { venueId, fieldKey, value, status, validUntil };
  });
}

module.exports = { loadCorpus, loadClaims };
