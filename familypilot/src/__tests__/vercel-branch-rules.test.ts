/**
 * Which branches Vercel builds a Preview for is decided by `git.deploymentEnabled` in vercel.json. Every build counts against the plan's daily deployment
 * allowance (100 on the free plan; docs/VERCEL_DEPLOYMENT_LIMITS.md), and a release day needs that allowance for the production deploy and a Preview rebuild.
 *
 * This pins the setting so it can only ever narrow, on purpose:
 *  - the excluded branches are exactly the listed ones: throwaway branches a GitHub runner pushes results to, and documentation-only branches (none in this commit);
 *  - every entry is an EXACT branch name. A pattern such as `data/*` or `docs/*` would also switch off a future venue-data release or a branch that needs a Preview
 *    to be reviewed, so a glob character fails this test;
 *  - the branches that must stay deployable are not excluded, whatever is added later.
 * Vercel matches the keys with minimatch; with no glob characters that is plain string equality, which is what is tested here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const config = JSON.parse(readFileSync(join(root, '..', 'vercel.json'), 'utf8')) as { git?: { deploymentEnabled?: unknown } };
const rules = config.git?.deploymentEnabled as Record<string, boolean>;

/** Throwaway branches: a GitHub runner reads public sources and commits its results back, so every job would otherwise cost two deployments. */
const THROWAWAY = ['data/open-data-fetch', 'data/open-data-inputs', 'data/open-data-inputs-diagnostic', 'data/open-data-inputs-regions', 'data/open-data-inputs-regions-2'];
/** Documentation-only branches (markdown and review packs; no app, server or script change). Vercel is not a required check on any pull request. */
const DOCS_ONLY: string[] = [];

/** Branches that must always build: production, the functional work, the Tranche A Preview and everything a venue-data release could be called. */
const MUST_DEPLOY = [
  'main',
  'feat/explore-nearby', 'feat/explore-paged', 'feat/explore-play-cafes', 'feat/optional-lunch', 'feat/saved-reconnect', 'feat/saved-reconnect-screen',
  'feat/paged-catalogue-read', 'feat/independent-source-registry', 'feat/recovery-review-tooling', 'feat/fhrs-family',
  'preview/tranche-a', 'release/tranche-a', 'release/tranche-c', 'release/tranche-b',
  'perf/boot-web', 'perf/opening-hours-formatters', 'fix/map-compliance', 'fix/retention-no-new-copies',
  'data/venue-release', 'data/tranche-a', 'data/tranche-c', 'data/open-data-release', 'data/open-data-inputs-release', 'data/beta-pricing-zoo-science',
  'docs/vercel-anything-else', 'claude/familypilot-home-inspection-t2ev9t',
];

/** What Vercel does with a branch: the setting is true unless a key matches and every matching key is false. Exact keys, so equality. */
const deploys = (branch: string) => !(Object.prototype.hasOwnProperty.call(rules, branch) && rules[branch] === false);

describe('vercel.json: which branches get an automatic deployment', () => {
  it('has a per-branch map, never a blanket switch', () => {
    expect(typeof rules).toBe('object');
    expect(rules).not.toBeNull();
    expect(Array.isArray(rules)).toBe(false);
  });

  it('only ever switches branches off, by exact name', () => {
    for (const [name, value] of Object.entries(rules)) {
      expect(value, name).toBe(false);
      expect(name, `${name} must be an exact branch name, not a pattern`).toMatch(/^[A-Za-z0-9._\-/]+$/);
      expect(name, name).not.toMatch(/[*?[\]{}!()+@\\]/);
      expect(name.endsWith('/'), name).toBe(false);
    }
  });

  it('excludes exactly the throwaway and documentation-only branches listed here', () => {
    expect(Object.keys(rules).sort()).toEqual([...THROWAWAY, ...DOCS_ONLY].sort());
  });

  it('keeps production and every functional, Preview and venue-data release branch deployable', () => {
    for (const branch of MUST_DEPLOY) expect(deploys(branch), branch).toBe(true);
  });

  it('does not disable a longer or shorter name that merely starts like an excluded one', () => {
    expect(deploys('data/open-data-fetch-2')).toBe(true);
    expect(deploys('data/open-data')).toBe(true);
    expect(deploys('data/open-data-inputs-regions-3')).toBe(true);
    expect(deploys('docs/soft-play-recovery-2')).toBe(true);
    expect(deploys('docs/soft-play')).toBe(true);
  });

  it('disables the listed branches', () => {
    for (const branch of [...THROWAWAY, ...DOCS_ONLY]) expect(deploys(branch), branch).toBe(false);
  });
});
