#!/usr/bin/env node
/**
 * Bot-challenge detector pilot: read a fixed, small set of official pages ONCE each with the production fetcher and
 * report, per page, what the site actually returned and what each detector makes of it.
 *
 *   old   the marker list on main (`challenge-platform` on its own marks a page blocked)
 *   new   this branch (a bare `challenge-platform` counts only around a shell of under 600 visible characters)
 *
 * Bounded by construction: one GET per listed URL, in order, with the fetcher's own User-Agent, 6 s timeout, 12 s page
 * budget and 512 KB cap; a short pause between requests; no retry; no redirect beyond the fetcher's own limit. It never
 * follows links, never asks Google, never opens the database. A site that refuses (403, or a real interstitial) is
 * reported as refusing; nothing here works around a refusal.
 *
 *   node scripts/detector-pilot.mjs                       # table + summary
 *   node scripts/detector-pilot.mjs --json out.json       # also write the full record
 *   OLD_DETECTOR=path/to/main-html-text-extractor.cjs     # compare against main's rules (optional)
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { fetchWithRedirects } = require(join(root, 'server/enrichment/_lib/source-fetcher.js'));
const { extractPageContent, stripHtml, removeNonContentElements, isCloudflareChallenge } = require(join(root, 'server/enrichment/_lib/html-text-extractor.js'));
const { extractEvidenceFromText, extractionSourceMeta } = require(join(root, 'server/enrichment/_lib/evidence-extractor.js'));
const old = process.env.OLD_DETECTOR ? require(process.env.OLD_DETECTOR) : null;

const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const targetsPath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'detector-pilot-targets.json');
const { targets } = JSON.parse(readFileSync(targetsPath, 'utf8'));
const PAUSE_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FACT_FIELDS = ['toilets', 'babyChanging', 'cafe', 'parking', 'freeParking', 'playground', 'pushchairSuitability', 'wheelchairAccessible', 'accessibleToilet'];

const rows = [];
for (const t of targets) {
  const started = Date.now();
  const r = await fetchWithRedirects(t.url);
  const ms = Date.now() - started;
  const html = r.html ?? '';
  const visible = html ? stripHtml(removeNonContentElements(html)).replace(/\s+/g, ' ').trim() : '';
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim().slice(0, 60);
  const newVerdict = html ? isCloudflareChallenge(html) : null;
  const oldVerdict = html && old ? old.isCloudflareChallenge(html) : null;
  let facts = [];
  if ((r.status === 'ok' || r.status === 'fetched_truncated') && html) {
    const { title: pageTitle, text } = extractPageContent(html);
    facts = extractEvidenceFromText(text, extractionSourceMeta({ url: t.url, sourceType: 'official_website', retrievedAt: new Date().toISOString(), pageTitle }))
      .filter((f) => FACT_FIELDS.includes(f.field) && f.confidence === 'high' && f.value !== 'unknown')
      .map((f) => `${f.field}=${f.value}`);
  }
  rows.push({
    venue: t.venue, url: t.url, stored: t.stored, priority: Boolean(t.priority),
    fetchStatus: r.status, httpStatus: r.httpStatus ?? null, error: r.error ?? null, ms,
    htmlChars: html.length, visibleChars: visible.length, title,
    newDetector: newVerdict, oldDetector: oldVerdict,
    facts: [...new Set(facts)],
  });
  const row = rows[rows.length - 1];
  console.log(`${row.fetchStatus.padEnd(18)} http=${String(row.httpStatus ?? '-').padEnd(4)} old=${String(row.oldDetector ?? '-').padEnd(5)} new=${String(row.newDetector ?? '-').padEnd(5)} text=${String(row.visibleChars).padStart(6)}  ${t.venue} ${t.url}${row.facts.length ? '\n    facts: ' + row.facts.join(', ') : ''}${row.error ? '\n    ' + row.error : ''}`);
  await sleep(PAUSE_MS);
}

const readable = rows.filter((r) => r.fetchStatus === 'ok' || r.fetchStatus === 'fetched_truncated');
const falsePositives = rows.filter((r) => r.oldDetector === true && r.newDetector === false && r.visibleChars >= 600);
const refused = rows.filter((r) => r.fetchStatus === 'blocked');
const summary = {
  requests: rows.length,
  readableNow: readable.length,
  wronglyBlockedByOldRules: falsePositives.length,
  stillRefused: refused.length,
  refusedWithRealInterstitial: refused.filter((r) => r.newDetector === true).length,
  refusedByHttpStatus: refused.filter((r) => r.newDetector !== true).length,
  otherFailures: rows.length - readable.length - refused.length,
  pagesWithFacts: readable.filter((r) => r.facts.length).length,
  factsTotal: readable.reduce((n, r) => n + r.facts.length, 0),
  priorityReadable: rows.filter((r) => r.priority && (r.fetchStatus === 'ok' || r.fetchStatus === 'fetched_truncated')).map((r) => r.url),
};
console.log('\nSUMMARY ' + JSON.stringify(summary, null, 2));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ ranAt: new Date().toISOString(), summary, rows }, null, 2));
