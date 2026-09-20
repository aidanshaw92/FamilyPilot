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
 * That convention is about functions. `pg_default_acl` records only the difference from the
 * built-in `acldefault()`, and `acldefault()` for a function grants EXECUTE to PUBLIC. So
 * "PUBLIC gets no EXECUTE by default" cannot be expressed, and since every role belongs to PUBLIC,
 * a new function is executable by `anon` the moment it is created. Verified on production
 * (PostgreSQL 17.6) with a rolled-back probe. The only thing that closes it is an explicit
 * `REVOKE ... ON FUNCTION ... FROM PUBLIC` in the migration that creates the function, so that is
 * asserted here for every function the repo has ever created.
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

  it('closes the default for tables, sequences and functions alike', () => {
    for (const objectType of ['tables', 'sequences', 'functions']) {
      expect(migration).toContain(
        `alter default privileges for role postgres in schema public revoke all on ${objectType} from public, anon, authenticated;`,
      );
    }
  });

  it('records that the function default cannot remove PUBLIC, so the claim is not lost', () => {
    // The statement above is a partial no-op and the next test is what actually protects functions.
    // If someone deletes this explanation, they will also delete the reason the next test exists.
    const raw = readMigration(MIGRATION_FILE);
    expect(raw).toContain('acldefault()');
    expect(raw).toContain('EXECUTE to PUBLIC');
  });
});

describe('every function a migration creates revokes PUBLIC explicitly', () => {
  /**
   * This is the test that does real work. ALTER DEFAULT PRIVILEGES cannot make a new function
   * private, so a migration that creates one and forgets the revoke hands `anon` EXECUTE.
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
      expect(combined, `${fn} must revoke from PUBLIC -- ALTER DEFAULT PRIVILEGES cannot`).toMatch(/\bpublic\b/);
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

  it('cleans up its probe objects inside the block that creates them', () => {
    // A failed assertion must roll the probes back rather than leave them in public.
    const block = check.slice(check.indexOf("execute 'create table public.zz_probe_table"));
    expect(block).toContain("execute 'drop table public.zz_probe_table'");
    expect(block).toContain("execute 'drop function public.zz_probe_function()'");
    expect(block).toContain("execute 'drop sequence public.zz_probe_sequence'");
  });
});
