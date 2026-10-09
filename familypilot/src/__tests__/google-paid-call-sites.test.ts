import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every place that can send a billable request to Google must pass through the reservation gate. This scans the server-side
 * source for the Google API hosts and the API-key header and fails if a file that uses either does not call
 * `reservePlacesCall`, unless it is on a short, reviewed allowlist. A new paid call site therefore has to be added here on
 * purpose, in review, rather than slipping past the cap.
 */
const root = join(__dirname, '..', '..', '..');
const SCAN = ['api', 'server', 'scripts', 'familypilot/supabase/functions'];
const GOOGLE = /(places|maps|routes)\.googleapis\.com|X-Goog-Api-Key/;

/** Files that mention Google hosts but are reviewed as not spending, with the reason. */
const ALLOWED_WITHOUT_GATE: Record<string, string> = {
  'server/places/lib/places-budget.js': 'the gate itself; only mentions the host in comments',
  'server/context/lib/route-matrix.js': 'builds the Routes request; its only caller, journey-provider.js, reserves first (asserted below)',
  'scripts/audit-google-quality.mjs': 'offline operator script; uses the synchronous gate, which refuses when GOOGLE_PLACES_ATOMIC_CAP is on',
  'api/places/status.js': 'reads whether a key exists; never sends a request',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|mjs|cjs|ts)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

const files = SCAN.flatMap((d) => { try { return walk(join(root, d)); } catch { return []; } });
const rel = (f: string) => relative(root, f);

describe('every Google paid-request site reserves through the atomic gate', () => {
  it('finds the call sites it is meant to guard', () => {
    const using = files.filter((f) => GOOGLE.test(readFileSync(f, 'utf8'))).map(rel);
    expect(using).toEqual(expect.arrayContaining(['server/places/lib/google-places.js', 'api/places/photo.js', 'api/planning/location.js', 'server/context/lib/route-matrix.js']));
  });

  it('no file that uses a Google host or key calls the provider without reservePlacesCall', () => {
    const offenders = files
      .filter((f) => GOOGLE.test(readFileSync(f, 'utf8')))
      .map(rel)
      .filter((f) => !ALLOWED_WITHOUT_GATE[f])
      .filter((f) => !/\breservePlacesCall\b/.test(readFileSync(join(root, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('files that fetch Google reserve before the fetch (reservation appears first in the file)', () => {
    for (const f of ['server/places/lib/google-places.js', 'api/places/photo.js']) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src.indexOf('await reservePlacesCall'), f).toBeGreaterThan(-1);
      expect(src.indexOf('await reservePlacesCall'), f).toBeLessThan(src.indexOf('await fetch('));
    }
    const loc = readFileSync(join(root, 'api/planning/location.js'), 'utf8');
    expect(loc.indexOf('await reservePlacesCall')).toBeLessThan(loc.indexOf('maps.googleapis.com'));
  });

  it('no file outside the gate still calls the synchronous assertPlacesAllowed on a request path', () => {
    const offenders = files.map(rel).filter((f) => f !== 'server/places/lib/places-budget.js' && f !== 'scripts/audit-google-quality.mjs')
      .filter((f) => /\bassertPlacesAllowed\s*\(/.test(readFileSync(join(root, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('route-matrix.js is only reachable through the journey provider, which reserves before using it', () => {
    const users = files.map(rel).filter((f) => /require\(['"][^'"]*route-matrix['"]\)/.test(readFileSync(join(root, f), 'utf8')));
    expect(users).toEqual(['server/context/lib/journey-provider.js']);
    const jp = readFileSync(join(root, 'server/context/lib/journey-provider.js'), 'utf8');
    expect(jp.indexOf('await reservePlacesCall')).toBeLessThan(jp.indexOf('await fetchRoutedDriveTimes('));
  });

  it('the edge workers never call Google directly', () => {
    const edge = files.map(rel).filter((f) => f.startsWith('familypilot/supabase/functions'));
    for (const f of edge) expect(GOOGLE.test(readFileSync(join(root, f), 'utf8')), f).toBe(false);
  });
});
