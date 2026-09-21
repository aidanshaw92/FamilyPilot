import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Privilege state that CI cannot execute, defended at the level CI can reach.
 *
 * vitest has no PostgreSQL, so nothing here observes a real ACL. The live assertions live in
 * `familypilot/supabase/checks/least_privilege_acl_check.sql`, which was run against a disposable
 * local cluster before this migration was opened and is meant to be run again after it is applied.
 * What these tests defend is the source: that the migration still declares the state that script
 * checks for, and -- more importantly -- that the one convention PostgreSQL will not enforce for
 * us is kept by every future migration.
 *
 * The subtle one is functions. `acldefault()` grants EXECUTE to PUBLIC and every role belongs to
 * PUBLIC, so a new function is executable by `anon` unless that default is cancelled -- and
 * cancelling it requires a GLOBAL `ALTER DEFAULT PRIVILEGES`, with no `IN SCHEMA` clause. A
 * schema-scoped one is merged on top of the global default instead of replacing it, so it leaves
 * PUBLIC's EXECUTE untouched while looking like it removed it. Verified on production
 * (PostgreSQL 17.6) inside a rolled-back transaction. The scope of that statement is asserted
 * below, because re-scoping it to `in schema public` is a silent regression.
 *
 * Per-function `REVOKE ... FROM PUBLIC` is kept as defence in depth and is still required of every
 * function the repo creates, so that a function stays private even if the default is later changed
 * or the function is created by another role.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS = path.join(REPO_ROOT, 'familypilot/supabase/migrations');
const MIGRATION_FILE = '20260920210000_least_privilege_client_roles.sql';
const CHECK_SCRIPT = path.join(REPO_ROOT, 'familypilot/supabase/checks/least_privilege_acl_check.sql');

/** SQL with comments stripped and whitespace collapsed, so matching survives reformatting. */
function normalise(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function migrationFiles(): string[] {
  return fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
}

function readMigration(name: string): string {
  return fs.readFileSync(path.join(MIGRATIONS, name), 'utf8');
}

const migration = normalise(readMigration(MIGRATION_FILE));

const PUBLIC_READABLE = [
  'canonical_venues',
  'place_records',
  'venue_claims',
  'venue_family_metadata',
  'venue_place_links',
];
const INTERNAL_ONLY = ['venue_enrichment_drafts', 'venue_source_evidence'];

/** The section of the migration that revokes, i.e. everything before the first grant-back. */
function revokedTables(): string[] {
  return [...migration.matchAll(/revoke all on table ([^;]+?) from ([^;]+);/g)].flatMap((match) => {
    const targets = match[2];
    // Only count a revoke that strips all three client grantees.
    if (!/public/.test(targets) || !/anon/.test(targets) || !/authenticated/.test(targets)) return [];
    return match[1].split(',').map((name) => name.trim().replace(/^public\./, ''));
  });
}

describe('least-privilege migration declares the intended desired state', () => {
  it('revokes everything from the client roles on all eight broad-ACL tables', () => {
    const revoked = revokedTables();
    for (const table of [...PUBLIC_READABLE, ...INTERNAL_ONLY, 'planning_workspaces']) {
      expect(revoked, `${table} should be revoked from public, anon and authenticated`).toContain(table);
    }
  });

  it('grants the five deliberately world-readable tables SELECT and nothing more', () => {
    const grant = migration.match(/grant select on table ([^;]+?) to anon, authenticated;/);
    expect(grant, 'a single grant-back of SELECT to both client roles should exist').not.toBeNull();
    const granted = grant![1].split(',').map((name) => name.trim().replace(/^public\./, ''));
    expect(granted.sort()).toEqual([...PUBLIC_READABLE].sort());
  });

  it('never grants the two internal tables back to a client role', () => {
    for (const table of INTERNAL_ONLY) {
      const grants = [...migration.matchAll(new RegExp(`grant [^;]*\\b${table}\\b[^;]*;`, 'g'))];
      expect(grants.map((m) => m[0]), `${table} should receive no client grant`).toEqual([]);
    }
  });

  it('gives planning_workspaces row CRUD for authenticated and nothing for anon', () => {
    expect(migration).toContain(
      'grant select, insert, update, delete on table public.planning_workspaces to authenticated;',
    );
    // No whole-table privilege, and nothing at all for anon.
    for (const privilege of ['truncate', 'references', 'trigger', 'maintain']) {
      expect(
        new RegExp(`grant [^;]*${privilege}[^;]*planning_workspaces`).test(migration),
        `planning_workspaces must not grant ${privilege}`,
      ).toBe(false);
    }
    expect(/grant [^;]*planning_workspaces[^;]* to [^;]*anon/.test(migration)).toBe(false);
  });

  it('leaves service_role and postgres entirely alone', () => {
    for (const role of ['service_role', 'postgres']) {
      for (const revoke of migration.match(/revoke [^;]+;/g) ?? []) {
        // `for role postgres` names the grantor of a default-privilege rule, not a grantee.
        const grantees = revoke.split(/\bfrom\b/)[1] ?? '';
        expect(grantees.includes(role), `no revoke should target ${role}: ${revoke}`).toBe(false);
      }
    }
  });

  it('does not touch the platform-owned supabase_admin defaults', () => {
    expect(migration).not.toContain('for role supabase_admin');
  });

  it('closes the schema default for tables and sequences', () => {
    for (const objectType of ['tables', 'sequences']) {
      expect(migration).toContain(
        `alter default privileges for role postgres in schema public revoke all on ${objectType} from public, anon, authenticated;`,
      );
    }
  });

  it('revokes PUBLIC execute on functions GLOBALLY, not scoped to a schema', () => {
    // The whole point. `in schema public ... from public` is merged on top of the built-in default
    // rather than replacing it, so PUBLIC keeps EXECUTE and every role inherits it. Only the
    // global form (stored with defaclnamespace = 0) cancels it.
    expect(migration).toContain(
      'alter default privileges for role postgres revoke execute on functions from public;',
    );

    // And no REVOKE may strip PUBLIC on functions while naming a schema. Restricted to revokes on
    // purpose: the grant-back for `extensions` below is schema-scoped by design, and an earlier
    // version of this loop would have had to be weakened to accommodate it.
    for (const statement of migration.match(/alter default privileges[^;]+;/g) ?? []) {
      if (!/on functions/.test(statement) || !/\brevoke\b/.test(statement)) continue;
      const grantees = statement.split(/\bfrom\b/)[1] ?? '';
      if (!/\bpublic\b/.test(grantees)) continue;
      expect(
        /in schema/.test(statement),
        `the PUBLIC function revoke must not be schema-scoped: ${statement}`,
      ).toBe(false);
    }
  });

  it('gives the global revoke straight back to the extensions schema', () => {
    /**
     * The global revoke reaches every schema, and `extensions` is not this project's to change:
     * production has 49 postgres-owned functions there, 48 with PUBLIC EXECUTE, because
     * `create extension` ran as postgres. Without this line the next CREATE/ALTER EXTENSION run as
     * postgres would produce functions PUBLIC cannot execute, breaking callers far from here.
     */
    expect(migration).toContain(
      'alter default privileges for role postgres in schema extensions grant execute on functions to public;',
    );
  });

  it('keeps the schemas this project does own closed', () => {
    // Only `extensions` may be given back. A grant-back naming public/private would undo the work.
    const grantBacks = [...migration.matchAll(/alter default privileges for role postgres in schema ([a-z_]+) grant [^;]*on functions[^;]*to [^;]*public[^;]*;/g)];
    expect(grantBacks.map((m) => m[1])).toEqual(['extensions']);
  });

  it('does not repeat the disproved claim that extensions are safe because supabase_admin owns them', () => {
    // Production contradicts it: 49 of 55 functions in `extensions` are owned by postgres.
    const raw = readMigration(MIGRATION_FILE).toLowerCase();
    expect(raw).not.toContain('extensions are created by `supabase_admin`');
    expect(raw).not.toContain('so they are unaffected');
  });

  it('revokes the client roles on functions within the public schema', () => {
    expect(migration).toContain(
      'alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;',
    );
  });

  it('explains why the PUBLIC revoke is global, so the reason is not lost', () => {
    const raw = readMigration(MIGRATION_FILE);
    expect(raw).toContain('acldefault()');
    expect(raw).toContain('defaclnamespace = 0');
  });

  it('no longer claims PUBLIC execute is impossible to remove', () => {
    // An earlier revision of this migration asserted exactly that, on the strength of a
    // schema-scoped experiment. It was wrong, and the wording must not come back.
    const raw = readMigration(MIGRATION_FILE).toLowerCase();
    expect(raw).not.toContain('not a difference that can be expressed');
    expect(raw).not.toContain('silently dropped');
    expect(raw).not.toContain('cannot be expressed');
  });
});

describe('every function a migration creates revokes PUBLIC explicitly', () => {
  /**
   * Defence in depth. The global default now closes this on its own, but an explicit revoke keeps
   * a function private even if that default is changed later or the function is created by a role
   * whose defaults this migration does not govern.
   */
  const created: Array<{ file: string; fn: string }> = [];
  const revokedFrom: Record<string, string[]> = {};

  for (const file of migrationFiles()) {
    const sql = normalise(readMigration(file));
    for (const match of sql.matchAll(/create (?:or replace )?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/g)) {
      created.push({ file, fn: match[1] });
    }
    for (const match of sql.matchAll(/revoke\s+[^;]*?\bon function\s+(?:public\.)?([a-z0-9_]+)\s*\(([^;]*?)\)\s*from\s+([^;]+);/g)) {
      (revokedFrom[match[1]] ??= []).push(match[3]);
    }
  }

  it('finds the functions the repo creates', () => {
    expect(created.length).toBeGreaterThanOrEqual(9);
  });

  for (const { file, fn } of created) {
    it(`${fn} (${file}) is revoked from PUBLIC, anon and authenticated`, () => {
      const targets = revokedFrom[fn];
      expect(targets, `${fn} has no REVOKE ... ON FUNCTION at all`).toBeDefined();
      const combined = (targets ?? []).join(' ');
      expect(combined, `${fn} must revoke from PUBLIC`).toMatch(/\bpublic\b/);
      expect(combined, `${fn} must revoke from anon`).toMatch(/\banon\b/);
      expect(combined, `${fn} must revoke from authenticated`).toMatch(/\bauthenticated\b/);
    });
  }
});

describe('the live check script stays in step with the migration', () => {
  const check = fs.readFileSync(CHECK_SCRIPT, 'utf8');

  it('exists in the canonical checks directory', () => {
    expect(fs.existsSync(CHECK_SCRIPT)).toBe(true);
  });

  /**
   * Parsed out of the script's VALUES list rather than searched for as substrings. Checking that a
   * table is merely mentioned somewhere is not enough: a deliberate mutation that deleted the
   * `plan_invites` / `authenticated` row survived that weaker assertion, because the table name
   * still appeared on its `anon` row.
   */
  function expectedMatrix(): Record<string, string> {
    const pairs: Record<string, string> = {};
    for (const match of check.matchAll(/\('([a-z_]+)',\s*'(anon|authenticated)',\s*'([A-Z,]*)'\)/g)) {
      pairs[`${match[1]}/${match[2]}`] = match[3];
    }
    return pairs;
  }

  it('asserts both client roles on every table, with the exact intended privileges', () => {
    const matrix = expectedMatrix();
    const expected: Record<string, string> = {};

    for (const table of PUBLIC_READABLE) {
      expected[`${table}/anon`] = 'SELECT';
      expected[`${table}/authenticated`] = 'SELECT';
    }
    for (const table of [
      ...INTERNAL_ONLY,
      'planning_connections',
      'venue_enrichment_jobs',
      'venue_visit_reports',
      'plan_invites',
    ]) {
      expected[`${table}/anon`] = '';
      expected[`${table}/authenticated`] = '';
    }
    expected['planning_workspaces/anon'] = '';
    expected['planning_workspaces/authenticated'] = 'DELETE,INSERT,SELECT,UPDATE';

    expect(matrix).toEqual(expected);
  });

  it('covers all twelve public tables and both client roles, with no row missing', () => {
    expect(Object.keys(expectedMatrix())).toHaveLength(24);
  });

  it('asserts the extensions schema keeps its platform baseline', () => {
    expect(check).toContain('extensions.zz_probe_ext_function');
    expect(check).toContain('proacl is not null');
  });

  it('checks relations that are not in the fixed matrix too', () => {
    // A thirteenth table -- schema_migration_log, which the migration runner creates on first use
    // -- or a view would otherwise never be looked at.
    expect(check).toContain('not in the reviewed matrix');
    expect(check).toContain("relkind in ('r','p','v','m','f')");
  });

  it('never reads an acl column without allowing for NULL meaning the built-in default', () => {
    // aclexplode(NULL) returns no rows, so a bare aclexplode(proacl) reports "PUBLIC holds
    // nothing" in exactly the case where PUBLIC holds the built-in grant.
    const bare = [...check.matchAll(/aclexplode\(\s*(?:c\.relacl|pr?\.proacl)\s*\)/g)];
    expect(bare.map((m) => m[0]), 'every aclexplode must coalesce to acldefault()').toEqual([]);
  });

  it('cleans up its probe objects inside the block that creates them', () => {
    // A failed assertion must roll the probes back rather than leave them in public.
    const block = check.slice(check.indexOf("execute 'create table public.zz_probe_table"));
    expect(block).toContain("execute 'drop table public.zz_probe_table'");
    expect(block).toContain("execute 'drop function public.zz_probe_function()'");
    expect(block).toContain("execute 'drop sequence public.zz_probe_sequence'");
  });
});

describe('CI executes the privilege model against a real PostgreSQL', () => {
  /**
   * vitest can only read SQL; it cannot run it. Everything above would pass against a migration
   * that is syntactically perfect and semantically wrong. The `privilege-model` job is what closes
   * that, so its existence is itself part of the contract -- deleting it would leave this file
   * looking green while nothing verified a single real privilege.
   */
  const workflow = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');

  it('runs a PostgreSQL 17 service, matching production', () => {
    expect(workflow).toContain('privilege-model:');
    expect(workflow).toContain('image: postgres:17');
  });

  it('builds the pre-migration baseline, guards it, applies the migration and asserts the result', () => {
    for (const script of [
      'checks/fixture_production_acl_baseline.sql',
      'checks/assert_fixture_baseline.sql',
      'migrations/20260920210000_least_privilege_client_roles.sql',
      'checks/least_privilege_acl_check.sql',
    ]) {
      expect(workflow, `${script} should run in CI`).toContain(script);
    }
  });

  it('applies the migration twice, so a re-run cannot change the outcome unnoticed', () => {
    const applications = workflow.split('migrations/20260920210000_least_privilege_client_roles.sql').length - 1;
    expect(applications).toBeGreaterThanOrEqual(2);
  });

  it('keeps the committed fixture in step with the tables the check asserts', () => {
    const fixture = fs.readFileSync(
      path.join(REPO_ROOT, 'familypilot/supabase/checks/fixture_production_acl_baseline.sql'),
      'utf8',
    );
    for (const table of [...PUBLIC_READABLE, ...INTERNAL_ONLY, 'planning_workspaces',
                         'planning_connections', 'venue_enrichment_jobs', 'venue_visit_reports', 'plan_invites']) {
      expect(fixture, `${table} should exist in the fixture`).toContain(`public.${table} `);
    }
    // And it must create the extensions schema, or the grant-back is never exercised.
    expect(fixture).toContain('create schema if not exists extensions');
  });
});
