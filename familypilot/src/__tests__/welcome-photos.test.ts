import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { WELCOME_PHOTOS } from '@/src/assets/welcome-photos';
import { WELCOME_COLLAGE } from '@/src/utils/welcome-layout';

const ASSET_DIR = join(__dirname, '..', '..', 'assets', 'images', 'welcome');
const SLOT_IDS = ['zoo', ...WELCOME_COLLAGE.slots.map((s) => s.id)];

describe('Welcome collage photographs', () => {
  const credits = readFileSync(join(ASSET_DIR, 'CREDITS.md'), 'utf8');
  const creditedSlots = [...credits.matchAll(/^\| (\w[\w-]*) \| /gm)].map((m) => m[1]).filter((s) => s !== 'Slot' && !/^-+$/.test(s));

  it('only names slots that exist in the collage', () => {
    for (const key of Object.keys(WELCOME_PHOTOS)) expect(SLOT_IDS).toContain(key);
    for (const key of creditedSlots) expect(SLOT_IDS).toContain(key);
  });

  it('has a file and a credit line for every photograph it ships', () => {
    for (const key of Object.keys(WELCOME_PHOTOS)) {
      expect(existsSync(join(ASSET_DIR, `${key}.jpg`)), `assets/images/welcome/${key}.jpg`).toBe(true);
      expect(creditedSlots, `CREDITS.md line for ${key}`).toContain(key);
    }
  });

  it('states for every photograph whether it is a photograph or generated', () => {
    // Welcome is brand imagery, so generated images are allowed, but the record must be honest about which.
    const rows = credits.split('\n').filter((l) => /^\| [\w-]+ \| /.test(l) && !/^\| (Slot|-)/.test(l));
    for (const row of rows) {
      const origin = row.split('|')[4]?.trim();
      expect(['photograph', 'generated'], row).toContain(origin);
    }
  });

  it('ships no photograph that is credited but not wired, or wired but not credited', () => {
    expect(new Set(creditedSlots)).toEqual(new Set(Object.keys(WELCOME_PHOTOS)));
  });

  it('keeps each shipped photograph inside its size budget', () => {
    // Brand artwork is bundled with the app, so it is paid for by every install: 150 KB each.
    for (const key of Object.keys(WELCOME_PHOTOS)) {
      const bytes = statSync(join(ASSET_DIR, `${key}.jpg`)).size;
      expect(bytes, `${key}.jpg is ${Math.round(bytes / 1024)} KB`).toBeLessThanOrEqual(150 * 1024);
    }
  });

  it('never ships the review-only reference crops', () => {
    // docs/figma-approved/ holds renders of the approved frames with REFERENCE PHOTO crops in them. They
    // are for review and comparison only; no asset or source file may reference them.
    const wiring = readFileSync(join(__dirname, '..', 'assets', 'welcome-photos.ts'), 'utf8');
    expect(wiring).not.toMatch(/figma-approved|figma-compare|reference/i);
  });

  // The ONE outstanding Welcome asset dependency. See docs/WELCOME_PHOTOGRAPHY.md and docs/PHOTOGRAPHY_ASSETS.md.
  const missing = SLOT_IDS.filter((id, i, all) => all.indexOf(id) === i && !(id in WELCOME_PHOTOS));
  it.todo(`ships a photograph or generated image for every Welcome slot (missing: ${missing.join(', ') || 'none'})`);
});
