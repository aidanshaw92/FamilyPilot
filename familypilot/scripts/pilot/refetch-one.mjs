#!/usr/bin/env node
/**
 * One controlled read of one venue's own website. No Google, no database, no model, nothing published.
 *
 *   node scripts/pilot/refetch-one.mjs --page https://discover.org.uk/your-visit --out result.json
 *
 * Bounds: the named page plus at most two same-site links whose own text or path names tickets, prices or admission (only if the named page
 * shows no £ figure), one GET each, sequential, a pause between requests, no retry, the production fetcher's timeouts and byte cap, no guessed
 * paths. A refusal is recorded as a refusal and nothing works round it. It records what the page says; a person decides what it means.
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { fetchWithRedirects } = require(join(root, 'server/enrichment/_lib/source-fetcher.js'));
const { findRelevantLinks, stripHtml, removeNonContentElements } = require(join(root, 'server/enrichment/_lib/html-text-extractor.js'));

const args = process.argv.slice(2);
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const page = flag('--page');
const out = flag('--out');
if (!page || !out) { console.error('usage: refetch-one.mjs --page <url> --out <file>'); process.exit(2); }
const host = new URL(page).host;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (html) => stripHtml(removeNonContentElements(html)).replace(/\s+/g, ' ').trim();
const priceLines = (t) => [...t.matchAll(/.{0,100}(£|&pound;)\s?\d[\d.,]*.{0,100}/g)].map((m) => m[0].trim()).slice(0, 20);

async function read(url) {
  const r = await fetchWithRedirects(url);
  const html = r.html ?? '';
  const ok = (r.status === 'ok' || r.status === 'fetched_truncated') && html;
  const t = ok ? text(html) : null;
  return {
    url, finalUrl: r.finalUrl ?? url, status: r.status, httpStatus: r.httpStatus ?? null, error: r.error ?? null,
    retrievedAt: new Date().toISOString(),
    contentSha256: ok ? createHash('sha256').update(html).digest('hex') : null,
    textLength: t ? t.length : 0, priceLines: t ? priceLines(t) : [], text: t ? t.slice(0, 40000) : null,
    _html: ok ? html : null,
  };
}

const pages = [];
const first = await read(page);
pages.push(first);
if (first._html && first.priceLines.length === 0) {
  const links = findRelevantLinks(first._html, first.finalUrl, 80)
    .filter((l) => new URL(l.url).host === host && /ticket|price|admission|book/i.test(`${l.url} ${l.anchorText}`) && !/\.(pdf|jpg|png)(\?|$)/i.test(l.url))
    .slice(0, 2);
  for (const l of links) { await sleep(1500); pages.push(await read(l.url)); }
}
for (const p of pages) delete p._html;
writeFileSync(out, JSON.stringify({ purpose: 'one controlled read of one venue website; no Google, no database', requests: pages.length, pages }, null, 1));
for (const p of pages) console.log(`${p.status} http=${p.httpStatus ?? '-'} text=${p.textLength} prices=${p.priceLines.length} ${p.url}`);
