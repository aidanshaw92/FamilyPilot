#!/usr/bin/env node
/**
 * Scores one real review session: how long each kind of decision took, and whether the reviewer caught the hidden errors.
 *
 *   node scripts/pilot/review-session-score.cjs decisions.jsonl --manifest manifest.json [--audit audit.jsonl] [--json report.json]
 *
 * decisions.jsonl is what the review page exports; manifest.json is what review-workflow.cjs wrote beside the pack (it says which cards
 * were hidden controls and which tier each real card belongs to). Keep the manifest away from the reviewer.
 *
 * WHAT IT REPORTS
 *   - measured seconds per decision, by tier (median, 90th percentile, total) and for the whole session
 *   - what was decided (approve, edit, reject, unknown) and how many decisions were undone
 *   - the control result: of the hidden planted errors, how many the reviewer caught (reject, edit or unknown) and how many they approved
 *
 * WHAT IT DOES NOT DO
 *   - It never writes a control into the audit trail: a planted error is not a decision about a venue.
 *   - It does not forecast. One session, one reviewer, one set of items describes that session. Forecasting needs at least three
 *     sessions, two reviewers, and the mix of tiers in each.
 */
const fs = require('node:fs');
const { makeEntry, verifyChain, liveEntries, currentState, sha } = require('./review-audit.cjs');

const args = process.argv.slice(2);
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);

function score(raw, manifest) {
  const isControl = (id) => Boolean(id && manifest.controls && manifest.controls[id]);
  // The audit trail holds real decisions only.
  const real = raw.filter((r) => r.decision === 'revert' || !isControl(r.itemId));
  // A revert aimed at a control line has to go with it.
  const controlNs = new Set(raw.filter((r) => isControl(r.itemId)).map((r) => r.n));
  const kept = real.filter((r) => !(r.decision === 'revert' && controlNs.has(r.targets)));
  const renumber = new Map();
  const chain = [];
  for (const r of kept) {
    const targets = r.decision === 'revert' ? renumber.get(r.targets) : undefined;
    if (r.decision === 'revert' && targets === undefined) throw new Error(`revert of entry ${r.targets} that was never recorded`);
    const entry = makeEntry(chain[chain.length - 1] ?? null, { ...r, targets });
    renumber.set(r.n, entry.seq);
    chain.push(entry);
  }
  const check = verifyChain(chain);
  if (!check.ok) throw new Error(`audit chain invalid at ${check.at}: ${check.why}`);

  // Controls: the reviewer's last live decision on each.
  const live = new Set();
  {
    const dead = new Set();
    for (const e of [...raw].reverse()) if (e.decision === 'revert' && !dead.has(e.n)) dead.add(e.targets);
    for (const e of raw) if (!dead.has(e.n) && e.decision !== 'revert') live.add(e.n);
  }
  const lastFor = new Map();
  for (const e of raw) if (live.has(e.n) && e.itemId) lastFor.set(e.itemId, e);
  const controls = Object.entries(manifest.controls ?? {}).map(([id, c]) => {
    const d = lastFor.get(id);
    const caught = d ? ['reject', 'edit', 'unknown'].includes(d.decision) : null;
    return { id, kind: c.kind, decision: d?.decision ?? 'not reached', caught, seconds: d?.secondsOnItem ?? null };
  });

  const secs = (list) => list.map((e) => e.secondsOnItem).filter((n) => typeof n === 'number').sort((a, b) => a - b);
  const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : null);
  const realLive = liveEntries(chain).filter((e) => e.decision !== 'revert' && !e.batchId);
  const byTier = {};
  for (const e of realLive) {
    const tier = manifest.tierOf?.[e.itemId] ?? 'unknown';
    (byTier[tier] ??= []).push(e);
  }
  const tierReport = Object.fromEntries(Object.entries(byTier).map(([t, list]) => {
    const s = secs(list);
    return [t, { decisions: list.length, medianSeconds: pct(s, 50), p90Seconds: pct(s, 90), totalSeconds: s.reduce((a, b) => a + b, 0) }];
  }));
  const decisions = {};
  for (const e of currentState(chain).values()) decisions[e.decision] = (decisions[e.decision] ?? 0) + 1;
  const all = secs(realLive).concat(secs(controls.filter((c) => c.seconds != null).map((c) => ({ secondsOnItem: c.seconds }))));
  all.sort((a, b) => a - b);
  const stamps = raw.map((r) => Date.parse(r.at)).filter(Number.isFinite);
  // The second reader's list: every edit, and one in five of the approvals (at least three), chosen by a fixed seed so the reviewer cannot
  // know which. A reviewer who approves something the second reader would not widens the sample to everything they approved.
  const decided = [...currentState(chain).values()];
  const approvals = decided.filter((e) => e.decision === 'approve' && !e.batchId).map((e) => e.itemId).sort((a, b) => sha(a + (manifest.seed ?? '7')).localeCompare(sha(b + (manifest.seed ?? '7'))));
  const auditSample = [
    ...decided.filter((e) => e.decision === 'edit').map((e) => e.itemId),
    ...approvals.slice(0, Math.min(approvals.length, Math.max(3, Math.ceil(approvals.length / 5)))),
  ];
  return {
    role: manifest.role,
    auditSample,
    realDecisions: currentState(chain).size,
    decisions,
    undone: chain.length - liveEntries(chain).length,
    measured: {
      byTier: tierReport,
      allCards: { timed: all.length, medianSeconds: pct(all, 50), p90Seconds: pct(all, 90), activeSeconds: all.reduce((a, b) => a + b, 0) },
      wallClockMinutes: stamps.length > 1 ? Math.round(((Math.max(...stamps) - Math.min(...stamps)) / 60000) * 10) / 10 : null,
      note: 'Measured in one session by one reviewer. Not a forecast.',
    },
    controls: { planted: controls.length, caught: controls.filter((c) => c.caught === true).length, approved: controls.filter((c) => c.caught === false).length, notReached: controls.filter((c) => c.caught === null).length, detail: controls },
    audit: chain,
  };
}

module.exports = { score };

if (require.main === module) {
  const file = args[0];
  if (!file || !flag('--manifest')) { console.error('usage: review-session-score.cjs decisions.jsonl --manifest manifest.json [--audit audit.jsonl] [--json report.json]'); process.exit(2); }
  const raw = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const manifest = JSON.parse(fs.readFileSync(flag('--manifest'), 'utf8'));
  const { audit, ...report } = score(raw, manifest);
  if (flag('--audit')) fs.writeFileSync(flag('--audit'), audit.map((e) => JSON.stringify(e)).join('\n') + '\n');
  if (flag('--json')) fs.writeFileSync(flag('--json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
}
