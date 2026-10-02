import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * A guard, not a unit test: no parent-facing surface may print a travel time without going through
 * the one helper that decides whether it may be stated plainly.
 *
 * This defect has recurred. The Section 7 audit named three components printing a bare
 * `{driveMinutes} min away`, those were fixed, and the Restaurant detail hero was found printing
 * `{distanceMinutes} min` afterwards -- twenty lines above a banner that hedged the same number.
 * Reviewing for it by eye clearly does not hold, so it is asserted.
 *
 * What it forbids: interpolating a travel-ish identifier directly against a minutes unit. What it
 * does not touch: a limit or a duration the parent chose themselves (`${minutes} min` on a
 * preference chip), which is their own input and claims nothing about a journey.
 */
const ROOT = resolve(__dirname, '../..');
const SCANNED = ['app', 'src/components'];

/** `${somethingDriveish}` immediately followed by a minutes unit. */
const TRAVEL_INTERPOLATION = /\$\{([^}]*(?:drive|travel|distance|journey)[^}]*)\}\s*min(?:ute)?s?\b/i;

/**
 * A ceiling the parent chose is not a claim about a journey.
 *
 * `maxDriveMinutes` on the Profile screen is the number they typed in, echoed back. Hedging it would
 * be nonsense -- there is nothing uncertain about their own preference -- so the rule has to name the
 * distinction rather than flag every identifier with "drive" in it.
 */
const PARENT_CHOSEN = /\b(?:max|limit|preferred|allowed)\w*/i;

function isBareTravelLabel(line: string): boolean {
  const match = TRAVEL_INTERPOLATION.exec(line);
  if (!match) return false;
  return !PARENT_CHOSEN.test(match[1]);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('no surface states a travel time without saying where it came from', () => {
  it('finds files to scan, so a passing result is not an empty sweep', () => {
    const files = SCANNED.flatMap((d) => walk(join(ROOT, d)));
    expect(files.length).toBeGreaterThan(50);
  });

  it('has no bare travel label anywhere a parent can see', () => {
    const offenders: string[] = [];
    for (const dir of SCANNED) {
      for (const file of walk(join(ROOT, dir))) {
        const source = readFileSync(file, 'utf8');
        source.split('\n').forEach((line, index) => {
          if (isBareTravelLabel(line)) {
            offenders.push(`${relative(ROOT, file)}:${index + 1}  ${line.trim()}`);
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('would actually catch the bug it exists for', () => {
    // The exact line that shipped on the Restaurant detail hero.
    expect(isBareTravelLabel('text={`${distanceMinutes} min`}')).toBe(true);
    expect(isBareTravelLabel('{`${venue.driveMinutes} min away`}')).toBe(true);
    expect(isBareTravelLabel('`${driveFromActivity} minutes from home`')).toBe(true);
    // And would not flag a parent's own chosen limit, a preference chip, or a hedged label.
    expect(isBareTravelLabel('label={`${minutes} min`}')).toBe(false);
    expect(isBareTravelLabel('value={`${profile.maxDriveMinutes} minutes`}')).toBe(false);
    expect(isBareTravelLabel('{travelTimeLabel(venue.driveMinutes, \'estimated\')}')).toBe(false);
  });
});
