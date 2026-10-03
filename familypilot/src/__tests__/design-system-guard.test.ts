import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { colors, typography } from '@/src/design-system/tokens';

/**
 * The approved Home frame establishes one ink, one secondary grey and Semi Bold headings. The rest
 * of the app used to be built on an older purple, Extra Bold token set, which is why it read as a
 * different product one tap after Home. These checks keep the two from drifting apart again: the
 * tokens must stay what the frame says, and consumer screens must not reach past them for the
 * retired purple or for raw hex copies of the frame's values.
 */
const ROOT = join(process.cwd());
const CONSUMER_DIRS = ['app', 'src/components'];
/** Not consumer chrome: internal editorial tools and the onboarding illustration (artwork, not UI). */
const EXEMPT = [
  'app/internal/',
  'src/components/enrichment/',
  'src/components/onboarding/FamilyHeroIllustration.tsx',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const consumerFiles = CONSUMER_DIRS.flatMap((dir) => walk(join(ROOT, dir)))
  .map((file) => relative(ROOT, file))
  .filter((file) => !EXEMPT.some((prefix) => file.startsWith(prefix)));

describe('design-system tokens match the approved Home frame', () => {
  it('ink is the frame near-black and text.primary is the same colour', () => {
    expect(colors.ink).toBe('#141416');
    expect(colors.text.primary).toBe(colors.ink);
    expect(colors.text.secondary).toBe('#6E6E73');
  });

  it('headings are Semi Bold, not Extra Bold', () => {
    for (const variant of ['display', 'heading1', 'heading2', 'heading3'] as const) {
      expect(typography[variant].fontFamily, variant).toBe('Inter_600SemiBold');
    }
  });

  it('a text link is ink, so no screen needs a colour of its own for one', () => {
    expect(typography.link.color).toBe(colors.ink);
  });
});

describe('consumer screens stay on the tokens', () => {
  it('scans a realistic number of files', () => {
    expect(consumerFiles.length).toBeGreaterThan(60);
  });

  it('do not use the retired purple scale', () => {
    const offenders = consumerFiles.filter((file) =>
      /colors\.primary\[/.test(readFileSync(join(ROOT, file), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it("do not hard-code the frame's ink or greys when the token exists", () => {
    const offenders = consumerFiles.filter((file) =>
      /#(141416|6E6E73|0A0A0D|5C586E)\b/i.test(readFileSync(join(ROOT, file), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('do not set text in the heaviest Inter weights the frame never uses', () => {
    // Loading the font (app/_layout.tsx) is fine; setting text in it is what the frame rules out.
    const offenders = consumerFiles.filter((file) =>
      /fontFamily:\s*['"]Inter_(800ExtraBold|900Black)|fontFamily\.(extraBold|black)/.test(
        readFileSync(join(ROOT, file), 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('render exactly one Family Match badge component', () => {
    const offenders = consumerFiles.filter((file) =>
      /FamilyFitBadge|FamilyScoreBadge|formatFamilyMatchLabel|% Family Match/.test(
        readFileSync(join(ROOT, file), 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
