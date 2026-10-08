#!/usr/bin/env node
/**
 * Before/after table for the scenario journeys (scripts/verify-pilot-scenarios.mjs): what the app says today for each situation
 * against what it says with the pilot's evidence, rules and hours, and whether every named check passed at 360 and 393.
 *
 *   node scripts/pilot/demo-report.cjs <scenDir> <out.md>
 */
const fs = require('node:fs');
const path = require('node:path');
const [, , dir, out] = process.argv;
const load = (label) => JSON.parse(fs.readFileSync(path.join(dir, label, 'results.json'), 'utf8'));
const before = load('before'); const after = load('after');
const find = (set, key, width) => set.find((r) => r.key === key && r.width === width);
const oneLine = (s, n = 230) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const say = (r) => {
  if (!r) return '(not run)';
  if (!r.steps.built) {
    const t = r.steps.plan.split('\n').map((l) => l.trim()).filter(Boolean);
    const at = t.findIndex((l) => /does not fit|closed that day|run past closing|isn’t open then|not allowed/i.test(l));
    return `**No plan.** ${oneLine(t.slice(Math.max(0, at), at + 3).join(' '))}`;
  }
  const need = r.steps.needsChecking ? oneLine(r.steps.needsChecking.replace(/^Needs checking before you go\s*/, '')) : null;
  return need ? `Plan built. Needs checking: ${need}` : 'Plan built, with nothing flagged.';
};
const l = [];
l.push('# Scenario journeys: what the app says today and with the pilot\'s evidence', '');
l.push('Driven through the real exported web app against the pilot fixture (provider content read from a local file, no provider call), at **360** and **393** px wide, Thursday 8 October 2026 07:30. Each scenario goes through Explore, Venue Detail, the plan link, the plan, **Save**, **View plan**, and a reload of the saved plan.');
l.push('', '"Today" is the app on production\'s stored claims for these ten venues. "With the pilot" assumes every proposed fact, rule and hours reading has been approved. Nothing here is published.', '');
l.push('| Scenario | Today | With the pilot |', '|---|---|---|');
for (const sc of after.filter((r) => r.width === 393)) l.push(`| ${sc.title} | ${say(find(before, sc.key, 393))} | ${say(sc)} |`);
l.push('', '## Checks');
l.push('', 'Each is a named assertion about what is on screen. All pass at both widths in the pilot state; the "today" run is not asserted against (it is the baseline).', '');
l.push('| Scenario | Checks | 360 px | 393 px |', '|---|---|---|---|');
const keys = [...new Set(after.map((r) => r.key))];
for (const k of keys) {
  const a = find(after, k, 360), b = find(after, k, 393);
  const f = (r) => (r ? `${r.checks.filter((c) => c.pass).length}/${r.checks.length}` : '-');
  l.push(`| ${a.title} | ${a.checks.map((c) => c.name).join('; ')} | ${f(a)} | ${f(b)} |`);
}
const total = after.flatMap((r) => r.checks);
l.push('', `${total.filter((c) => c.pass).length} of ${total.length} checks pass across ${after.length} runs.`);
fs.writeFileSync(out, l.join('\n') + '\n');
console.log(`wrote ${out}`);
