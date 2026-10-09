#!/usr/bin/env node
/**
 * Scores the Pack C reviewer's export. The reviewer's page used opaque card ids so the planted controls could not be told apart by reading
 * the page; this puts the real ids back, scores the four controls, and writes the real decisions (never the controls) to the audit trail.
 *
 *   node scripts/pilot/packc-score.cjs <review-decisions.jsonl> <packC-scoring-key.json> [--audit audit-packC.jsonl] [--json report.json]
 *
 * The bar for the controls is the one the process set: at least 3 of the 4 planted errors caught (rejected, edited or marked unknown).
 */
const fs = require('node:fs');
const { score } = require('./review-session-score.cjs');

function run(raw, key) {
  const translate = (id) => (id ? key.idMap[id] ?? (() => { throw new Error(`card id ${id} is not in the scoring key`); })() : id);
  const translated = raw.map((r) => (r.itemId ? { ...r, itemId: translate(r.itemId) } : r));
  const reviewers = [...new Set(translated.map((r) => r.reviewer).filter(Boolean))];
  if (reviewers.length !== 1 || /^unnamed$/i.test(reviewers[0])) throw new Error(`the export must carry exactly one reviewer name (found: ${reviewers.join(', ') || 'none'})`);
  const { audit, ...report } = score(translated, { role: 'wave-reviewer', controls: key.controls, tierOf: {} });
  return { audit, report: { ...report, reviewer: reviewers[0], controlsBarMet: report.controls.caught >= 3 } };
}

module.exports = { run };

if (require.main === module) {
  const [file, keyFile] = process.argv.slice(2);
  const flag = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
  if (!file || !keyFile) { console.error('usage: packc-score.cjs <review-decisions.jsonl> <packC-scoring-key.json> [--audit f] [--json f]'); process.exit(2); }
  const raw = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const { audit, report } = run(raw, JSON.parse(fs.readFileSync(keyFile, 'utf8')));
  if (flag('--audit')) fs.writeFileSync(flag('--audit'), audit.map((e) => JSON.stringify(e)).join('\n') + '\n');
  if (flag('--json')) fs.writeFileSync(flag('--json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ reviewer: report.reviewer, realDecisions: report.realDecisions, decisions: report.decisions, controls: { planted: report.controls.planted, caught: report.controls.caught, approved: report.controls.approved, notReached: report.controls.notReached }, controlsBarMet: report.controlsBarMet, secondReaderSample: report.auditSample }, null, 1));
}
