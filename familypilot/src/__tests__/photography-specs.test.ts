import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { WELCOME_OUTPUT, WELCOME_SLOTS } from '../../scripts/photos/specs.mjs';
import { WELCOME_COLLAGE } from '@/src/utils/welcome-layout';

/**
 * The Welcome photography contract is stated three times: in the layout (slot ids), in docs/WELCOME_PHOTOGRAPHY.md (sizes,
 * focal points, filenames), and in the installer's spec. They must not drift apart, or a delivered image would be cropped
 * for a slot that is not the one on screen.
 */

const ROOT = join(__dirname, '..', '..');
const DOC = readFileSync(join(ROOT, '..', 'docs', 'WELCOME_PHOTOGRAPHY.md'), 'utf8');
const BRIEFS = readFileSync(join(ROOT, '..', 'docs', 'PHOTOGRAPHY_BRIEFS.md'), 'utf8');

/** The rows of the "seven slots" table: id, supply size, focal point. */
const rows = [...DOC.matchAll(/^\| `([\w-]+)` \(`[\w-]+\.jpg`\) \|.*?\| (\d+) x (\d+) \| [\d.]+ \| (\d+)%, (\d+)%/gm)].map((m) => ({
  id: m[1], px: [Number(m[2]), Number(m[3])], focal: [Number(m[4]), Number(m[5])],
}));

describe('the Welcome slots agree across the layout, the doc and the installer', () => {
  it('names the seven approved slots in the layout', () => {
    const layout = WELCOME_COLLAGE.slots.map((slot) => slot.id);
    expect(layout).toEqual(['zoo', 'farm', 'cafe', 'crafts', 'soft-play', 'puddles', 'aquarium']);
    expect(WELCOME_SLOTS.map((slot) => slot.id)).toEqual(layout);
  });

  it('gives the installer the same size and focal point as docs/WELCOME_PHOTOGRAPHY.md, slot by slot', () => {
    expect(rows.map((row) => row.id)).toEqual(WELCOME_SLOTS.map((slot) => slot.id));
    for (const slot of WELCOME_SLOTS) {
      const row = rows.find((candidate) => candidate.id === slot.id)!;
      expect(slot.px, `${slot.id} size`).toEqual(row.px);
      expect(slot.focal, `${slot.id} focal point`).toEqual(row.focal);
    }
  });

  it('keeps the output budget at the 150 KB the photograph test enforces', () => {
    expect(WELCOME_OUTPUT.maxBytes).toBe(150 * 1024);
    expect(WELCOME_OUTPUT.targetBytes).toBeLessThan(WELCOME_OUTPUT.maxBytes);
    const test = readFileSync(join(ROOT, 'src', '__tests__', 'welcome-photos.test.ts'), 'utf8');
    expect(test).toContain('150 * 1024');
  });

  it('publishes the same sizes in the generation briefs the owner works from', () => {
    for (const slot of WELCOME_SLOTS) {
      expect(BRIEFS, `${slot.id} row`).toContain(`| \`${slot.id}\` | ${slot.px[0]} x ${slot.px[1]} |`);
    }
  });
});
