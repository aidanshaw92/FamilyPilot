import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * The migration that pins the two age-policy validators' search_path.
 *
 * vitest has no database, so it cannot prove the pin works -- that is
 * `checks/age_policy_search_path_check.sql`, run against a real PostgreSQL 17 in the
 * `privilege-model` CI job. What vitest CAN do is stop the change decaying: assert the migration
 * exists where the tooling looks for it, that it pins both functions rather than only the one the
 * advisor named first, that it does not restate the function bodies, and that CI actually runs the
 * database-level check afterwards. A check file nobody runs is not verification.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_FILE = '20260926090000_age_policy_function_search_path.sql';
const MIGRATION = path.join(REPO_ROOT, 'familypilot/supabase/migrations', MIGRATION_FILE);
const CHECK_SCRIPT = path.join(REPO_ROOT, 'familypilot/supabase/checks/age_policy_search_path_check.sql');
const WORKFLOW = path.join(REPO_ROOT, '.github/workflows/ci.yml');

/** SQL with comments stripped and whitespace collapsed, so matching survives reformatting. */
function normalise(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

const VALIDATORS = ['venue_age_bounds_are_valid', 'venue_age_policy_is_valid'] as const;

describe('the age-policy validators pin their search_path', () => {
  it('the migration sits in the canonical directory the tooling reads', () => {
    expect(fs.existsSync(MIGRATION)).toBe(true);
  });

  const migration = normalise(fs.readFileSync(MIGRATION, 'utf8'));

  it.each(VALIDATORS)('pins %s', (fn) => {
    expect(migration).toContain(`alter function public.${fn}(jsonb) set search_path = ''`);
  });

  it('pins to an empty path rather than naming a schema', () => {
    /**
     * pg_catalog is always searched first whether or not it is listed, so `''` resolves every
     * built-in these bodies use and nothing else. Listing `public` would defeat the point: the
     * validators' only cross-call is already schema-qualified, and an unqualified name resolving
     * into `public` is exactly what the advisor is warning about.
     */
    const paths = [...migration.matchAll(/set search_path = ('[^']*'|[a-z_, ]+);/g)].map((m) => m[1].trim());
    expect(paths.length).toBe(VALIDATORS.length);
    for (const value of paths) {
      expect(value, `search_path should be empty, got ${value}`).toBe("''");
    }
  });

  it('does not restate the function bodies, which could then drift from the original', () => {
    expect(migration).not.toMatch(/create (or replace )?function/);
    // The guard logic must stay in exactly one migration.
    expect(migration).not.toContain('jsonb_typeof');
  });

  it('changes nothing but the search_path and the comments', () => {
    const statements = migration
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      expect(
        /^alter function /.test(statement) || /^comment on function /.test(statement),
        `unexpected statement in a search_path-only migration: ${statement}`,
      ).toBe(true);
    }
  });
});

describe('the database-level check is real and is actually run', () => {
  it('the check file exists in the canonical checks directory', () => {
    expect(fs.existsSync(CHECK_SCRIPT)).toBe(true);
  });

  const check = fs.readFileSync(CHECK_SCRIPT, 'utf8');

  it.each(VALIDATORS)('asserts the pin is recorded for %s', (fn) => {
    expect(check).toContain(fn);
  });

  it('proves the counterfactual rather than only reading proconfig', () => {
    /**
     * `ALTER FUNCTION ... SET search_path` silences the advisor whether or not the function was
     * ever caller-dependent. The check therefore shadows a name the bodies use unqualified and
     * shows an unpinned copy changing its verdict while a pinned copy does not -- and fails loudly
     * if that counterfactual stops reproducing, which would mean the check had become decorative.
     */
    expect(check).toContain('the counterfactual did not reproduce');
    expect(check).toMatch(/guard_unpinned/);
    expect(check).toMatch(/guard_pinned/);
  });

  it('writes through the real constraint, not only the validator in isolation', () => {
    /**
     * Two writes, and both matter. A rejection alone would pass even if the pinned validator had
     * become incapable of accepting anything -- which is exactly what an over-tight search_path
     * would do -- so the check must also store a VALID policy and confirm it landed. An earlier
     * revision of this test only looked for the substring `insert into public.venue_family_metadata`
     * and so survived a mutation that removed the accepting write, because the rejecting one still
     * carried the same substring.
     */
    const inserts = [...check.matchAll(/insert into public\.venue_family_metadata/g)];
    expect(inserts.length, 'the check needs an accepting write AND a rejecting one').toBeGreaterThanOrEqual(2);
    expect(check).toContain('jsonb_build_object');
    expect(check).toContain('get diagnostics');
    expect(check).toMatch(/expected to remove exactly 1 probe row/);
    expect(check).toContain('check_violation');
  });

  const workflow = fs.readFileSync(WORKFLOW, 'utf8');

  it('CI applies the migration', () => {
    expect(workflow).toContain(`migrations/${MIGRATION_FILE}`);
  });

  it('CI runs the check after applying it', () => {
    const applyAt = workflow.indexOf(`migrations/${MIGRATION_FILE}`);
    const checkAt = workflow.indexOf('checks/age_policy_search_path_check.sql');
    expect(applyAt).toBeGreaterThan(-1);
    expect(checkAt).toBeGreaterThan(applyAt);
  });

  it('CI re-runs the age-policy shape check afterwards, so a pinned name that no longer resolves fails', () => {
    /**
     * The 35 shape cases are the real proof that `''` still resolves everything the bodies need.
     * They must run AFTER the pin, or they only ever exercise the unpinned functions.
     */
    const applyAt = workflow.indexOf(`migrations/${MIGRATION_FILE}`);
    const shapeChecks = [...workflow.matchAll(/checks\/venue_age_policy_shape_check\.sql/g)]
      .map((m) => m.index ?? -1)
      .filter((at) => at > applyAt);
    /**
     * Two, not one: once directly after the pin, and once after the idempotent re-apply. Asserting
     * merely that SOME shape check follows the migration let a mutation delete the first of them
     * and still pass, because the re-apply step's own copy sat later in the file.
     */
    expect(shapeChecks.length, 'the shape cases must run after the pin and after the re-apply').toBeGreaterThanOrEqual(2);
  });
});
