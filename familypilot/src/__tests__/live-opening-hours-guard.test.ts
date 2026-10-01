import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `scripts/assert-live-opening-hours.mjs` is the only check in the repository that proves Google's
 * LIVE response still carries what the opening-hours mapper expects. The unit tests pin the mapper to
 * Google's published schema; this pins the schema to what Google really sends.
 *
 * It needs a regression test because it has already been silently defeated once. The 2026-10 cost work
 * made `/api/places/detail` read `place_records` before calling Google, and it reports
 * `provider: "google"` for a stored copy too -- correctly, since the data did come from Google. The
 * script's existing guard checked only `provider`, so run #4 of the workflow passed all eight
 * assertions against a copy of Whitechapel Gallery fetched 0.45 days earlier, with Google never
 * contacted. Green, and proving nothing.
 *
 * The script is a standalone ESM script that calls `process.exit`, so it is exercised the way CI
 * exercises it: spawned, with its exit code read.
 */

const SCRIPT = resolve(__dirname, '../../../scripts/assert-live-opening-hours.mjs');

function liveHours() {
  return {
    source: 'google',
    periods: [{ open: { day: 2, hour: 11, minute: 0 }, close: { day: 2, hour: 18, minute: 0 } }],
    timezone: 'Europe/London',
    utcOffsetMinutes: 60,
    weekdayText: ['Tuesday: 11:00 AM – 6:00 PM'],
  };
}

function run(payload: Record<string, unknown>): { status: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'live-hours-'));
  const file = join(dir, 'detail.json');
  writeFileSync(file, JSON.stringify(payload));
  try {
    const output = execFileSync('node', [SCRIPT, file], { encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, output };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('the live opening-hours check cannot be satisfied by stored data', () => {
  it('fails on a cached copy when Google Places IS enabled, so the window is hiding the live call', () => {
    const result = run({
      provider: 'google',
      cached: true,
      storedAgeDays: 0.45,
      placesEnabled: true,
      place: { name: 'Whitechapel Gallery', openingHours: liveHours() },
    });
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/STORED copy/);
    // The remedy has to be in the message, or the next person hits the same silent pass.
    expect(result.output).toMatch(/PLACES_DETAIL_FRESH_DAYS=0/);
  });

  it('stands down on a cached copy when Google Places is switched off for Preview', () => {
    // Not a failure: the owner choosing not to let Preview spend is a configuration choice, and
    // failing would block every future pull request touching the mapper. But it must never read as a
    // pass either, so NOT PROVEN and the variables are in the output.
    const result = run({
      provider: 'google',
      cached: true,
      storedAgeDays: 0.46,
      placesEnabled: false,
      place: { name: 'Whitechapel Gallery', openingHours: liveHours() },
    });
    expect(result.status).toBe(0);
    expect(result.output).toMatch(/NOT PROVEN/);
    expect(result.output).toMatch(/GOOGLE_PLACES_ENABLED=true/);
    expect(result.output).toMatch(/PLACES_DETAIL_FRESH_DAYS=0/);
    // And it must NOT claim the schedule was checked, because it was not.
    expect(result.output).not.toMatch(/PASS {2}display text still present/);
  });

  it('distinguishes the two cached cases by placesEnabled, not by status code', () => {
    // The first attempt keyed the stand-down on a 503 from the cost gate. That branch is unreachable
    // for a fresh stored copy: the endpoint serves it and returns 200 without ever consulting the
    // gate, which is exactly how run #7 failed. These two differ only in `placesEnabled`.
    const base = {
      provider: 'google',
      cached: true,
      storedAgeDays: 1,
      place: { name: 'Whitechapel Gallery', openingHours: liveHours() },
    };
    expect(run({ ...base, placesEnabled: false }).status).toBe(0);
    expect(run({ ...base, placesEnabled: true }).status).toBe(1);
  });

  it('passes on a genuinely live response', () => {
    const result = run({
      provider: 'google',
      cached: false,
      placesEnabled: true,
      place: { name: 'Whitechapel Gallery', openingHours: liveHours() },
    });
    expect(result.status).toBe(0);
    expect(result.output).toMatch(/served from store\s*:\s*false/);
    expect(result.output).toMatch(/PASS {2}display text still present/);
  });

  it('still fails when the provider itself is not google', () => {
    // The original guard, which must keep working alongside the new one.
    const result = run({
      provider: 'mock',
      cached: false,
      place: { name: 'Aldenham Country Park', openingHours: liveHours() },
    });
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/rather than google/);
  });

  it('fails a live response whose schedule is missing the structure the planner needs', () => {
    // Proves the eight assertions are still reachable and still bite, rather than the two guards
    // above being the only thing the script does.
    const result = run({
      provider: 'google',
      cached: false,
      placesEnabled: true,
      place: { name: 'Whitechapel Gallery', openingHours: { source: 'google', periods: [] } },
    });
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/periods is non-empty/);
  });
});
