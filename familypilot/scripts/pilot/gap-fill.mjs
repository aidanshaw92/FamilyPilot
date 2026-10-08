#!/usr/bin/env node
/**
 * Second, smaller reading for the facts the first pass could not find, on the same terms: official sources only, once per
 * URL, sequential with a pause, no retry, no path guessing, a refusal ends that gap.
 *
 * Each gap names (1) a page already read or the venue's own page, and (2) what to look for among ITS links:
 *   { venue, parent, anchor, allowHosts?, hops?, fullCap? }
 *   - the parent is fetched once; the first link whose text or address matches `anchor` is followed (a page the venue itself
 *     points to is not a guess)
 *   - a link to another host is followed only if that host is listed in `allowHosts` (e.g. a council's park operator)
 *   - `hops: 2` follows one more link from the page reached, matching `anchor2`
 *   - `fullCap` re-reads a page that the first pass truncated, with a larger text cap
 * At most MAX_REQUESTS requests in all. Nothing is written to a database; no Google, no model.
 *
 *   node scripts/pilot/gap-fill.mjs --gaps scripts/pilot/gaps.json [--out ../gap-fill.json]
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const { fetchWithRedirects } = require(join(root, 'server/enrichment/_lib/source-fetcher.js'));
const { findRelevantLinks, stripHtml, removeNonContentElements } = require(join(root, 'server/enrichment/_lib/html-text-extractor.js'));

const MAX_REQUESTS = 30;
const PAUSE_MS = 1500;
const args = process.argv.slice(2);
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const gaps = JSON.parse(readFileSync(flag('--gaps') ?? join(here, 'gaps.json'), 'utf8')).gaps;
const out = flag('--out');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (html) => stripHtml(removeNonContentElements(html)).replace(/\s+/g, ' ').trim();
const title = (html) => (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim();

let requests = 0;
const pages = [];
async function read(url, cap = 30_000) {
  if (requests >= MAX_REQUESTS) throw new Error('request budget spent');
  requests += 1;
  const r = await fetchWithRedirects(url);
  await sleep(PAUSE_MS);
  const html = r.html ?? '';
  const ok = (r.status === 'ok' || r.status === 'fetched_truncated') && html;
  return { url, finalUrl: r.finalUrl ?? url, status: r.status, httpStatus: r.httpStatus ?? null, html: ok ? html : null,
    fullText: ok ? visible(html).slice(0, cap) : null, title: ok ? title(html) : null, readAt: new Date().toISOString() };
}
function follow(parent, anchor, allowHosts = []) {
  const re = new RegExp(anchor, 'i');
  const host = new URL(parent.finalUrl).host.replace(/^www\./, '');
  const links = findRelevantLinks(parent.html, parent.finalUrl, 400);
  const pick = links.find((l) => {
    let h; try { h = new URL(l.url).host.replace(/^www\./, ''); } catch { return false; }
    return re.test(`${l.anchorText} ${l.url}`) && (h === host || allowHosts.some((a) => h === a || h.endsWith(`.${a}`)));
  });
  return pick ?? null;
}

for (const g of gaps) {
  console.log(`\n### ${g.venue}  ${g.parent}  anchor=/${g.anchor ?? '-'}/`);
  try {
    if (g.fullCap) {
      const p = await read(g.parent, g.fullCap);
      pages.push({ venue: g.venue, gap: g.id, url: p.url, title: p.title, status: p.status, readAt: p.readAt, fullText: p.fullText });
      console.log(`  ${p.status} http=${p.httpStatus ?? '-'} text=${(p.fullText ?? '').length}  ${p.url} (full re-read)`);
      continue;
    }
    const parent = await read(g.parent);
    console.log(`  parent ${parent.status} http=${parent.httpStatus ?? '-'}`);
    if (!parent.html) { pages.push({ venue: g.venue, gap: g.id, url: g.parent, status: parent.status, readAt: parent.readAt, fullText: null }); continue; }
    const hit = follow(parent, g.anchor, g.allowHosts);
    if (!hit) { console.log('  no link on the parent matches; nothing followed'); pages.push({ venue: g.venue, gap: g.id, url: g.parent, status: 'no-link', readAt: parent.readAt, fullText: null }); continue; }
    let page = await read(hit.url);
    pages.push({ venue: g.venue, gap: g.id, url: page.url, title: page.title, status: page.status, readAt: page.readAt, anchor: hit.anchorText, fullText: page.fullText });
    console.log(`  ${page.status} http=${page.httpStatus ?? '-'} text=${(page.fullText ?? '').length}  ${hit.url} [${hit.anchorText}]`);
    if (g.hops === 2 && page.html && g.anchor2) {
      const hit2 = follow(page, g.anchor2, g.allowHosts);
      if (hit2) {
        page = await read(hit2.url);
        pages.push({ venue: g.venue, gap: g.id, url: page.url, title: page.title, status: page.status, readAt: page.readAt, anchor: hit2.anchorText, fullText: page.fullText });
        console.log(`  ${page.status} http=${page.httpStatus ?? '-'} text=${(page.fullText ?? '').length}  ${hit2.url} [${hit2.anchorText}]`);
      } else console.log('  second hop: no matching link');
    }
  } catch (e) { console.log(`  stopped: ${e.message}`); }
}
console.log(`\nSUMMARY ${JSON.stringify({ gaps: gaps.length, requests, pagesRead: pages.filter((p) => p.fullText).length })}`);
if (out) writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), requests, pages }));
for (const p of pages) {
  if (!p.fullText) continue;
  console.log(`\n=====PAGE venue="${p.venue}" url="${p.url}" title="${p.title}" read="${p.readAt}"=====`);
  console.log(p.fullText);
}
console.log('\n=====END=====');
