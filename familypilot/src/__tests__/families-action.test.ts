import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { COMPACT_FAMILIES_ROW, HEADER_SAVINGS } from '@/src/utils/home-vertical-layout';

/**
 * Families is reachable from Home and Explore by a labelled action, without a sixth tab and without a second copy of the
 * invitation system. These pin the structure; the rendered geometry, the tap and the empty states are driven in a browser by
 * scripts/verify-families-action.mjs (and the connected and pending states by verify-account-journey.mjs).
 */
const read = (file: string) => readFileSync(file, 'utf8');

describe('the Families action', () => {
  const action = read('src/components/navigation/FamiliesAction.tsx');

  it('says "Families" in words, and its accessible name starts with the visible word', () => {
    expect(action).toMatch(/>\s*Families\s*</);
    expect(action).toMatch(/accessibilityLabel="Families,/);
    expect(action).toMatch(/accessibilityRole="button"/);
  });

  it('is a real target: drawn 44 points tall (the audit measures the drawn box, not hit slop), not a bare icon', () => {
    expect(action).toMatch(/height: 44/);
    expect(action).toMatch(/Ionicons name="people-outline"/);
  });

  it('opens /families', () => {
    expect(action).toMatch(/FAMILIES_ROUTE = '\/families'/);
    expect(action).toMatch(/router\.push\(FAMILIES_ROUTE as never\)/);
  });
});

describe('where it is placed', () => {
  it('Home: on the heading row, and on a slim row of its own when a short screen drops the heading', () => {
    const home = read('app/(tabs)/index.tsx');
    expect(home).toMatch(/<FamiliesAction style=\{styles\.familiesAction\} \/>/);
    expect(home).toMatch(/styles\.compactFamiliesRow/);
    expect(home.match(/<FamiliesAction/g)).toHaveLength(2);
  });

  it('Home: the compact header gives up exactly what the Families row takes over the old gap', () => {
    expect(COMPACT_FAMILIES_ROW).toBe(44);
    expect(HEADER_SAVINGS.compact.title).toBe(51 - (COMPACT_FAMILIES_ROW - 14));
    expect(HEADER_SAVINGS.tight.title).toBe(0);
  });

  it('Explore: on the heading row, in a fixed-height row so nothing below moves', () => {
    const explore = read('app/(tabs)/explore.tsx');
    expect(explore).toMatch(/<FamiliesAction \/>/);
    expect(explore).toMatch(/headingRow: \{\s*height: 34\.5/);
  });

  it('Explore: on a phone too narrow for the heading and the action on one row, the action takes its own row and the art moves with it', () => {
    const explore = read('app/(tabs)/explore.tsx');
    expect(explore).toMatch(/EXPLORE_FAMILIES_BELOW_WIDTH = 340/);
    expect(explore).toMatch(/familiesBelow \? null : <FamiliesAction \/>/);
    expect(explore).toMatch(/\(familiesBelow \? EXPLORE_FAMILIES_ROW : 0\)/);
    expect(explore.match(/<FamiliesAction/g)).toHaveLength(2);
  });
});

describe('no sixth tab, and no second invitation system', () => {
  it('the bottom navigation is still Home, Explore, Halfway, Plans, Profile', () => {
    const layout = read('app/(tabs)/_layout.tsx');
    const names = [...layout.matchAll(/name: '([a-z]+)',\s*title: '([A-Za-z]+)'/g)].map((m) => m[2]);
    expect(names).toEqual(['Home', 'Explore', 'Halfway', 'Plans', 'Profile']);
    expect(layout).not.toMatch(/families/i);
  });

  it('Families is a stack screen, behind the account guard like every other screen', () => {
    const root = read('app/_layout.tsx');
    expect(root).toMatch(/<Stack\.Screen name="families"/);
    const allowed = root.match(/SIGNED_OUT_ALLOWED = new Set\(\[([^\]]*)\]/)?.[1] ?? '';
    expect(allowed).not.toMatch(/families/);
  });

  it('the screen is the existing Connected Families section, not a copy of it', () => {
    const screen = read('app/families.tsx');
    expect(screen).toMatch(/<ConnectedFamiliesSection accountsAvailable=\{accountsAvailable\} variant="screen" \/>/);
    // It creates no invitation itself and reads nothing that could carry a precise location.
    expect(screen).not.toMatch(/createInvite|listConnections|connection-invites|homeLatitude|homeLongitude|planning-store/);
  });

  it('inviting and sharing keep the same explicit-consent defaults', () => {
    const section = read('src/components/profile/FamilySections.tsx');
    // Routines are shared only when the person turns the switch on: it starts off.
    expect(section).toMatch(/const \[shareRoutines, setShareRoutines\] = useState\(false\)/);
    expect(section).toMatch(/families\.create\(relationship, shareRoutines\)/);
    expect(section).toMatch(/Nothing changes until you tap Update/);
  });

  it('the Profile keeps its section, unchanged in behaviour (profile variant is the default)', () => {
    const profile = read('app/(tabs)/profile.tsx');
    expect(profile).toMatch(/<ConnectedFamiliesSection accountsAvailable=\{accountRequired\(\) && authStatus === 'signed_in'\} \/>/);
    expect(read('src/components/profile/FamilySections.tsx')).toMatch(/variant = 'profile'/);
  });
});
