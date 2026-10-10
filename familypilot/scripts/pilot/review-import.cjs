#!/usr/bin/env node
/**
 * Turns the review page's exported decisions into the tamper-evident audit trail, and reports what the session actually cost.
 *
 *   node scripts/pilot/review-import.cjs decisions.jsonl [--out audit.jsonl] [--json timing.json]
 *
 * The time reported is MEASURED: seconds each item was in view before its decision, as the page recorded it. It describes that
 * session, with that reviewer, on these items. It is the input for forecasting only once more than one session has been run.
 */
const fs = require('node:fs');
const { makeEntry, verifyChain, liveEntries, currentState } = require('./review-audit.cjs');
const file = process.argv[2];
const flag = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
if (!file) { console.error('usage: review-import.cjs decisions.jsonl [--out audit.jsonl] [--json timing.json]'); process.exit(2); }
const raw = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
// The page numbers its own entries (n); the chain renumbers them, so reverts must point at the new numbers.
const renumber = new Map();
const chain = [];
for (const r of raw) {
  const targets = r.decision === 'revert' ? renumber.get(r.targets) : undefined;
  if (r.decision === 'revert' && targets === undefined) throw new Error(`revert of entry ${r.targets} that was never recorded`);
  const entry = makeEntry(chain[chain.length - 1] ?? null, { ...r, targets });
  renumber.set(r.n, entry.seq);
  chain.push(entry);
}
const check = verifyChain(chain);
if (!check.ok) throw new Error(`audit chain invalid at ${check.at}: ${check.why}`);
if (flag('--out')) fs.writeFileSync(flag('--out'), chain.map((e) => JSON.stringify(e)).join('\n') + '\n');

const live = liveEntries(chain).filter((e) => e.decision !== 'revert' && typeof e.secondsOnItem === 'number' && !e.batchId);
const times = live.map((e) => e.secondsOnItem).sort((a, b) => a - b);
const pct = (p) => (times.length ? times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))] : null);
const decisions = {};
for (const e of currentState(chain).values()) decisions[e.decision] = (decisions[e.decision] ?? 0) + 1;
const report = {
  entries: chain.length, itemsDecided: currentState(chain).size, decisions, reverted: chain.length - liveEntries(chain).length,
  measured: { itemsTimed: times.length, medianSeconds: pct(50), p90Seconds: pct(90), totalActiveSeconds: times.reduce((a, b) => a + b, 0), note: 'Measured in one session by one reviewer. Not a forecast.' },
};
if (flag('--json')) fs.writeFileSync(flag('--json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
