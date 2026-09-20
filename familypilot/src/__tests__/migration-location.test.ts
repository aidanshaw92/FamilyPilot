import { describe, expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Migrations only count if the tooling can see them.
 *
 * `scripts/apply-supabase-migrations.mjs` and `scripts/audit-migration-drift.mjs` both read one
 * fixed directory. A migration committed anywhere else is silently never applied, and the failure
 * does not surface until deployed application code writes to a column that was never created —
 * at the database boundary, in production, on the first request that needs it.
 *
 * So this asserts the location rather than the contents: one canonical directory, both scripts
 * pointing at it, and nothing migration-shaped anywhere else in the repository.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const CANONICAL_RELATIVE = 'familypilot/supabase/migrations';
const CANONICAL_ABSOLUTE = path.join(REPO_ROOT, CANONICAL_RELATIVE);

const SKIP_DIRECTORIES = new Set(['node_modules', '.git', 'dist', '.expo', 'coverage', '.next']);

/** Every directory named `migrations` that holds at least one .sql file. */
function findMigrationDirectories(dir: string, found: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRECTORIES.has(entry.name)) continue;

    const full = path.join(dir, entry.name);
    if (entry.name === 'migrations') {
      const hasSql = fs
        .readdirSync(full, { withFileTypes: true })
        .some((child) => child.isFile() && child.name.endsWith('.sql'));
      if (hasSql) found.push(full);
    }
    findMigrationDirectories(full, found);
  }

  return found;
}

describe('supabase migration location', () => {
  test('the canonical directory exists and holds the migration chain', () => {
    expect(fs.existsSync(CANONICAL_ABSOLUTE)).toBe(true);
    const files = fs.readdirSync(CANONICAL_ABSOLUTE).filter((name) => name.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);
  });

  test('both migration scripts read the canonical directory', () => {
    for (const script of ['apply-supabase-migrations.mjs', 'audit-migration-drift.mjs']) {
      const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', script), 'utf8');
      expect(source, `${script} should resolve ${CANONICAL_RELATIVE}`).toContain(CANONICAL_RELATIVE);
    }
  });

  test('no migration .sql file lives outside the canonical directory', () => {
    const directories = findMigrationDirectories(REPO_ROOT)
      .map((dir) => path.relative(REPO_ROOT, dir))
      .sort();

    // A second migrations directory is never a stylistic choice — it is a migration the tooling
    // will skip. Naming the offenders makes the fix obvious rather than the failure cryptic.
    expect(directories).toEqual([CANONICAL_RELATIVE]);
  });

  test('migration filenames sort into a stable, unique order', () => {
    const files = fs
      .readdirSync(CANONICAL_ABSOLUTE)
      .filter((name) => name.endsWith('.sql'))
      .sort();

    expect(new Set(files).size).toBe(files.length);
    // The appliers order by filename, so a file that does not lead with its timestamp would be
    // applied out of sequence relative to the rest of the chain.
    for (const file of files) {
      expect(file, `${file} should start with a numeric ordering prefix`).toMatch(/^\d{3,}/);
    }
  });
});
