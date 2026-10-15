#!/usr/bin/env node
/**
 * Shows exactly which branches vercel.json's `git.deploymentEnabled` switches off, against the repository's real branch list, matching the way Vercel does
 * (minimatch). Read-only: it runs `git ls-remote --heads` and reads vercel.json.
 *
 *   node scripts/check-vercel-branch-rules.mjs            # the table
 *   node scripts/check-vercel-branch-rules.mjs --json
 *
 * Exits 1 when a rule is a pattern rather than an exact name, when a rule matches no branch, or when `main` (the production branch) would not deploy.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(join(root, 'familypilot', 'package.json'));
const { minimatch } = require('minimatch');

const rules = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')).git?.deploymentEnabled ?? {};
const branches = execFileSync('git', ['ls-remote', '--heads', 'origin'], { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean).map((line) => line.split('\t')[1].replace('refs/heads/', '')).sort();

/** Vercel: a branch builds unless it matches a key and no matching key is true. Unspecified branches build. */
const builds = (branch) => {
  const matching = Object.entries(rules).filter(([pattern]) => minimatch(branch, pattern));
  return matching.length === 0 ? true : matching.some(([, value]) => value === true);
};

const problems = [];
for (const [pattern, value] of Object.entries(rules)) {
  if (/[*?[\]{}!()+@\\]/.test(pattern)) problems.push(`"${pattern}" is a pattern; use exact branch names`);
  if (value !== false) problems.push(`"${pattern}" is not false`);
  if (!branches.includes(pattern)) problems.push(`"${pattern}" matches no branch on origin`);
}
if (!builds('main')) problems.push('main (production) would not deploy');
const off = branches.filter((b) => !builds(b));
const matched = branches.filter((b) => Object.keys(rules).some((pattern) => minimatch(b, pattern)));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ branches: branches.length, switchedOff: off, deployable: branches.length - off.length, problems }, null, 1));
} else {
  console.log(`${branches.length} branches on origin; ${off.length} switched off, ${branches.length - off.length} still build.\n`);
  console.log('Switched off:'); for (const b of off) console.log(`  - ${b}`);
  console.log(`\nmain (production): ${builds('main') ? 'builds' : 'DOES NOT BUILD'}`);
  console.log(`Every rule is an exact name: ${matched.length === off.length && Object.keys(rules).every((k) => !/[*?[\]{}!()+@\\]/.test(k)) ? 'yes' : 'NO'}`);
  if (problems.length) { console.log('\nProblems:'); for (const p of problems) console.log(`  ! ${p}`); }
}
process.exit(problems.length ? 1 : 0);
