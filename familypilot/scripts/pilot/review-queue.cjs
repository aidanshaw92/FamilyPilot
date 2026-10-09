#!/usr/bin/env node
/**
 * The exception queue: everything the gate would not accept on its own, as a person sees it.
 *
 * One item per fact. Each shows the venue's exact sentence, the page it is on, the day it was read, the interpretation being
 * proposed and the reasons a person is needed. The reviewer approves, rejects, or marks it unknown; each decision is written
 * to an append-only audit trail (docs/pilot/AUDIT_TRAIL_FORMAT.md). Nothing is published by this script.
 *
 *   node scripts/pilot/review-queue.cjs [--out docs/pilot/review-queue.json]
 *
 * It also prints the workload per venue: how many items and how many words a person has to read. Words are measured; the
 * time they imply is an ESTIMATE (reading speed and a fixed decision overhead, below), to be replaced by measured time from
 * the review page's own timers.
 */
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '..', '..', '..', 'docs', 'pilot');
const profiles = fs.readdirSync(path.join(dir, 'profiles')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, 'profiles', f), 'utf8')));

const WORDS_PER_SECOND = 3.5; // careful reading of a sentence you must judge, not skim
const DECISION_SECONDS = 6; // open the source line, decide, record
const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;

const items = [];
for (const p of profiles) {
  for (const f of p.facts) {
    if (f.status !== 'review') continue;
    const id = `${p.id.replace('fp-google-', '')}:${f.sec}.${f.key}`;
    const read = words(f.evidence?.quote) + words(f.text) + words(f.reviewReasons?.join(' ')) + (f.note ? words(f.note) : 0);
    items.push({
      id, venueId: p.id, venue: p.name, held: Boolean(f.held), field: `${f.sec}.${f.key}`, proposed: f.text, value: f.value,
      sentence: f.evidence?.quote, url: f.evidence?.url, readOn: f.evidence?.readAt, carriedFrom: f.evidence?.carriedFrom,
      reasons: f.reviewReasons, note: f.note, wordsToRead: read, estimatedSeconds: Math.round(read / WORDS_PER_SECOND + DECISION_SECONDS),
    });
  }
}
const byVenue = {};
for (const i of items) {
  const v = (byVenue[i.venue] ??= { items: 0, words: 0, seconds: 0 });
  v.items += 1; v.words += i.wordsToRead; v.seconds += i.estimatedSeconds;
}
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
if (out) fs.writeFileSync(out, JSON.stringify({ builtOn: '2026-10-08', model: { WORDS_PER_SECOND, DECISION_SECONDS }, items }, null, 1));
console.log('venue'.padEnd(36), 'items', 'words', 'est. min');
let ti = 0, tw = 0, ts = 0;
for (const [n, v] of Object.entries(byVenue)) { console.log(n.padEnd(36), String(v.items).padStart(5), String(v.words).padStart(5), (v.seconds / 60).toFixed(1).padStart(8)); ti += v.items; tw += v.words; ts += v.seconds; }
console.log('TOTAL'.padEnd(36), String(ti).padStart(5), String(tw).padStart(5), (ts / 60).toFixed(1).padStart(8));
const reasons = {};
for (const i of items) for (const r of i.reasons ?? []) reasons[r] = (reasons[r] ?? 0) + 1;
console.log('\nwhy a person is needed:'); for (const [r, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(4), r);
