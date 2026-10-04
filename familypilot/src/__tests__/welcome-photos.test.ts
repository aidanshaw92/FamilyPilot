import { existsSync, readFileSync } from 'node:fs';
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

  it('ships no photograph that is credited but not wired, or wired but not credited', () => {
    expect(new Set(creditedSlots)).toEqual(new Set(Object.keys(WELCOME_PHOTOS)));
  });
});
