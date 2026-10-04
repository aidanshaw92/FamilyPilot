import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { colors, typography } from '@/src/design-system/tokens';

/**
 * The identity references (docs/VISUAL_IDENTITY.md) establish a navy ink for text, a deep green for
 * every control, Bold page headings and Semi Bold titles. These checks keep consumer screens on those
 * tokens: the values must stay what the references say, and no screen may reach past them for the
 * retired purple, for raw hex copies of the token values, or for ink as a control colour.
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

describe('design-system tokens match the identity references', () => {
  it('ink is the navy the references set text in, and text.primary is the same colour', () => {
    expect(colors.ink).toBe('#0D1733');
    expect(colors.text.primary).toBe(colors.ink);
    expect(colors.text.secondary).toBe('#626A80');
  });

  it('action is the deep green, distinct from ink', () => {
    expect(colors.action).toBe('#0F4A3E');
    expect(colors.action).not.toBe(colors.ink);
    expect(colors.nav.pill).toBe(colors.action);
  });

  it('page headings are Bold and titles Semi Bold', () => {
    for (const variant of ['display', 'heading1', 'heading2'] as const) {
      expect(typography[variant].fontFamily, variant).toBe('Inter_700Bold');
    }
    expect(typography.heading3.fontFamily).toBe('Inter_600SemiBold');
  });

  it('a text link is the action green, so no screen needs a colour of its own for one', () => {
    expect(typography.link.color).toBe(colors.action);
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
      /#(141416|6E6E73|0A0A0D|5C586E|1A1A2E|0D1733|0F4A3E|626A80|FBFAF7|171617)\b/i.test(readFileSync(join(ROOT, file), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('do not draw a control in ink: backgrounds and rules take the action green', () => {
    // Text is ink; a filled or outlined control is green. A background or border in `colors.ink`
    // is the old single-accent scheme leaking back.
    const offenders = consumerFiles.filter((file) =>
      /(backgroundColor|borderColor|trackColor[^\n]*true):\s*colors\.(ink|text\.primary)\b/.test(
        readFileSync(join(ROOT, file), 'utf8'),
      ),
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

  it('render exactly one Family Fit badge component, and never say "Family Match" to a parent', () => {
    const offenders = consumerFiles.filter((file) =>
      /FamilyFitBadge|FamilyScoreBadge|formatFamilyMatchLabel|% Family Match|% Family Fit|['"`>][^'"`<\n]*Family Match|FAMILY MATCH/.test(
        readFileSync(join(ROOT, file), 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
