#!/usr/bin/env node
/**
 * Bounded official-source research for the venue-profile pilot.
 *
 * Reads the OFFICIAL website of each listed venue, once per page, and records what the venue says. It does not extract
 * facts and publishes nothing: a person (or an AI reading with a person's review) turns the recorded text into a
 * profile whose every statement quotes it. No database, no Google, no model.
 *
 * Bounds (all enforced here, none relaxed per venue):
 *   - venues: only the targets file, at most 12
 *   - pages: the homepage plus at most MAX_PAGES same-site pages chosen from the homepage's own links; no guessing of paths
 *   - one GET per URL, sequential, PAUSE_MS between requests, no retry, the production fetcher's timeouts and byte cap
 *   - same host only; PDF links are listed, never fetched
 *   - a refusal (HTTP 403, a challenge page) is recorded as a refusal and the venue's crawl stops there; nothing works round it
 *
 *   node scripts/pilot/research-crawl.mjs [--out research.json] [--only "Science Museum"]
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const { fetchWithRedirects } = require(join(root, 'server/enrichment/_lib/source-fetcher.js'));
const { findRelevantLinks, stripHtml, removeNonContentElements, extractPageContent } = require(join(root, 'server/enrichment/_lib/html-text-extractor.js'));

const MAX_VENUES = 12;
const MAX_PAGES = 8;
const PAUSE_MS = 1500;
const FULL_TEXT_CAP = 30_000;
const args = process.argv.slice(2);
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const out = flag('--out');
const only = flag('--only');

const { targets } = JSON.parse(readFileSync(join(here, 'pilot-targets.json'), 'utf8'));
const chosen = targets.filter((t) => !only || t.name === only).slice(0, MAX_VENUES);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** What a parent-facing profile needs, so these links are worth a page of the budget. */
const WANTED = /famil|child|kid|toddler|baby|babies|under-?[0-9]|play|explore|galler|animal|attraction|things-to-do|what-to|see-and-do|access|facilit|toilet|buggy|pushchair|parking|getting|transport|plan|visit|opening|price|ticket|admission|faq|map|learn|trail/i;
const SKIP = /shop|donate|support-us|membership|jobs|careers|press|privacy|cookie|terms|login|account|basket|hire|venue-hire|wedding|corporate|newsletter|research|collections-online|\.(jpg|jpeg|png|gif|svg|webp|zip|docx?|xlsx?)(\?|$)/i;

const visibleText = (html) => stripHtml(removeNonContentElements(html)).replace(/\s+/g, ' ').trim();
const titleOf = (html) => (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim();

function pdfLinks(html, base) {
  const found = new Set();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+\.pdf[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try { found.add(`${new URL(m[1], base).toString()} | ${m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)}`); } catch { /* ignore */ }
  }
  return [...found].slice(0, 10);
}

async function readPage(url) {
  const r = await fetchWithRedirects(url);
  const html = r.html ?? '';
  const ok = (r.status === 'ok' || r.status === 'fetched_truncated') && html;
  return {
    url, finalUrl: r.finalUrl ?? url, status: r.status, httpStatus: r.httpStatus ?? null, error: r.error ?? null,
    title: ok ? titleOf(html) : null,
    fullText: ok ? visibleText(html).slice(0, FULL_TEXT_CAP) : null,
    pipelineText: ok ? extractPageContent(html).text : null,
    pdfs: ok ? pdfLinks(html, url) : [],
    html: ok ? html : null,
    readAt: new Date().toISOString(),
  };
}

const result = [];
let requests = 0;
for (const t of chosen) {
  const venue = { id: t.id, name: t.name, website: t.website, pages: [], refused: null, skipped: [] };
  console.log(`\n### ${t.name}  ${t.website}`);
  const home = await readPage(t.website); requests += 1;
  await sleep(PAUSE_MS);
  const { html: homeHtml, ...homeRec } = home;
  venue.pages.push(homeRec);
  console.log(`  ${home.status.padEnd(10)} http=${home.httpStatus ?? '-'} text=${(home.fullText ?? '').length}  ${home.url}`);
  if (!homeHtml) { venue.refused = { url: home.url, status: home.status, httpStatus: home.httpStatus, error: home.error }; result.push(venue); continue; }

  const seen = new Set([home.url.replace(/\/$/, '')]);
  const links = findRelevantLinks(homeHtml, home.finalUrl, 80)
    .filter((l) => !SKIP.test(l.url) && !/\.pdf(\?|$)/i.test(l.url))
    .map((l) => ({ ...l, rank: l.score + (WANTED.test(`${l.url} ${l.anchorText}`) ? 40 : 0) }))
    .sort((a, b) => b.rank - a.rank);
  const picked = [];
  for (const l of links) {
    const key = l.url.replace(/[?#].*$/, '').replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key); picked.push(l);
    if (picked.length >= MAX_PAGES) break;
  }
  venue.skipped = links.slice(MAX_PAGES, MAX_PAGES + 10).map((l) => l.url);
  venue.homepagePdfs = homeRec.pdfs;

  for (const l of picked) {
    const p = await readPage(l.url); requests += 1;
    await sleep(PAUSE_MS);
    const { html, ...rec } = p;
    rec.anchor = l.anchorText;
    venue.pages.push(rec);
    console.log(`  ${p.status.padEnd(10)} http=${p.httpStatus ?? '-'} text=${(p.fullText ?? '').length}  ${l.url}  [${l.anchorText}]`);
    // A refusal is a refusal: stop this venue, do not try the other pages from the same address.
    if (p.status === 'blocked') { venue.refused = { url: p.url, status: p.status, httpStatus: p.httpStatus, error: p.error }; break; }
  }
  result.push(venue);
}

const summary = {
  venues: result.length, requests,
  pagesRead: result.reduce((n, v) => n + v.pages.filter((p) => p.fullText).length, 0),
  refused: result.filter((v) => v.refused).map((v) => v.name),
};
console.log('\nSUMMARY ' + JSON.stringify(summary));
const payload = { ranAt: new Date().toISOString(), summary, venues: result };
if (out) writeFileSync(out, JSON.stringify(payload));

// The record is printed in full so a reviewer can read exactly what each venue says, page by page, from the run log.
for (const v of result) {
  for (const p of v.pages) {
    if (!p.fullText) continue;
    console.log(`\n=====PAGE venue="${v.name}" url="${p.url}" title="${p.title}" read="${p.readAt}"=====`);
    console.log(p.fullText);
  }
  if (v.homepagePdfs?.length) console.log(`\n=====PDFS venue="${v.name}"=====\n${v.homepagePdfs.join('\n')}`);
}
console.log('\n=====END=====');
