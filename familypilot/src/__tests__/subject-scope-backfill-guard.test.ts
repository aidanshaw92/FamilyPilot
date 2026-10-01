import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `scripts/backfill-subject-scope.mjs` fills in the `subject_scope` of evidence rows stored before
 * that column existed. It is the prerequisite for repairing anything that is already published, and
 * it is NOT inert: `auto-approve.js` checks `isEligibleScope` before approving a draft, so making a
 * row eligible can let previously withheld evidence become a NEW served claim -- and
 * `familypilot-automatic-enrichment` runs every minute, so that happens within the hour with nobody
 * having reviewed it.
 *
 * That is exactly the "unreviewed production repair" the deferral in `trusted-evidence.js` exists to
 * prevent. So the write path is double-locked: `--write` AND `BACKFILL_CONFIRM=yes`. These tests hold
 * the locks in place, because a refactor that quietly dropped one would turn a reporting script into
 * an unreviewed mass publication.
 */

const SCRIPT = resolve(__dirname, '../../../scripts/backfill-subject-scope.mjs');

function run(args: string[], env: Record<string, string> = {}) {
  try {
    const stdout = execFileSync('node', [SCRIPT, ...args], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SECRET_KEY: '', ...env },
    });
    return { status: 0, output: stdout };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('the subject_scope backfill cannot write by accident', () => {
  it('refuses --write without BACKFILL_CONFIRM', () => {
    const result = run(['--write']);
    expect(result.status).toBe(2);
    expect(result.output).toMatch(/Refusing to write without BACKFILL_CONFIRM=yes/);
  });

  it('says WHY confirmation is needed, not just that it is', () => {
    // The hazard has to be in the message. Someone reaching for the flag needs to know that claims
    // may be published to parents shortly afterwards.
    const result = run(['--write']);
    expect(result.output).toMatch(/auto-approve/);
    expect(result.output).toMatch(/every.minute/);
    expect(result.output).toMatch(/published to parents/);
  });

  it('refuses to run at all without Supabase credentials, in either mode', () => {
    expect(run([]).status).toBe(2);
    expect(run([]).output).toMatch(/Supabase is not configured/);
    expect(run(['--write'], { BACKFILL_CONFIRM: 'yes' }).status).toBe(2);
  });

  it('checks the confirmation BEFORE it touches a database', () => {
    // Ordering matters: the refusal must not depend on credentials being absent, or a run with
    // credentials present would sail past the lock.
    const result = run(['--write']);
    expect(result.output).toMatch(/Refusing to write/);
    expect(result.output).not.toMatch(/Supabase is not configured/);
  });

  it('treats any value other than the exact string "yes" as no confirmation', () => {
    // Asserted on the REFUSAL MESSAGE, not the exit code. Both the lock and the missing-credentials
    // check exit 2, so a status-only assertion could not tell them apart -- and a mutant that
    // loosened the lock to `!process.env.BACKFILL_CONFIRM` passed an earlier version of this test
    // for exactly that reason.
    for (const value of ['y', 'YES', 'true', '1', 'yes please', ' yes', '']) {
      const result = run(['--write'], { BACKFILL_CONFIRM: value });
      expect(result.status, `BACKFILL_CONFIRM=${JSON.stringify(value)}`).toBe(2);
      expect(result.output, `BACKFILL_CONFIRM=${JSON.stringify(value)}`).toMatch(/Refusing to write/);
    }
  });

  it('accepts exactly "yes" and then stops on the missing credentials instead', () => {
    // The other half: the lock must actually open for the documented value, or it is not a lock but
    // a wall, and nobody could ever run the backfill.
    const result = run(['--write'], { BACKFILL_CONFIRM: 'yes' });
    expect(result.output).not.toMatch(/Refusing to write/);
    expect(result.output).toMatch(/Supabase is not configured/);
  });
});
