import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { floatingTabBarLayout } from '@/src/utils/floating-tab-bar-layout';

/**
 * Home · Explore · Families · Plans · Profile.
 *
 * Families, in the middle, is the hub for who a parent plans with: their own household, the families they are connected
 * to, and the ways to plan together. Meet halfway is one of those ways (a stack screen reached from Families, and from a
 * shortcut on Plans), not a tab. Still five tabs, so the approved pill keeps its geometry. Saved places open from Plans.
 * The URLs /halfway and /saved are unchanged, so every existing link still lands.
 */
const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('the bottom navigation', () => {
  const layout = read('app/(tabs)/_layout.tsx');
  const names = [...layout.matchAll(/\{ name: '([a-z]+)', title: '([A-Za-z ]+)'|name: '([a-z]+)',\s*\n\s*title: '([A-Za-z ]+)'/g)].map((m) => [m[1] ?? m[3], m[2] ?? m[4]]);

  it('is Home · Explore · Families · Plans · Profile, in that order, and five tabs', () => {
    expect(names).toEqual([['index', 'Home'], ['explore', 'Explore'], ['families', 'Families'], ['trips', 'Plans'], ['profile', 'Profile']]);
  });

  it('has no Saved tab and no Halfway tab', () => {
    expect(layout).not.toMatch(/name: 'saved'/);
    expect(layout).not.toMatch(/name: 'halfway'/);
    expect(existsSync(join(root, 'app/(tabs)/saved.tsx'))).toBe(false);
    expect(existsSync(join(root, 'app/(tabs)/halfway.tsx'))).toBe(false);
  });

  it('keeps the approved pill: five tabs fit at every phone width', () => {
    for (const width of [360, 390, 393, 430]) {
      const pill = floatingTabBarLayout(5, 34, 'home');
      expect(pill.width).toBeLessThanOrEqual(width - 16);
    }
  });

  it('draws a Families icon in both approved frames, in their stroke language', () => {
    const icons = read('src/components/ui/icons.tsx');
    expect(icons).toMatch(/export type NavTab = [^;]*'families'/);
    expect((icons.match(/case 'families':/g) ?? []).length).toBe(2);
    expect(icons).toMatch(/families: 810/);
    expect(icons).toMatch(/families: 890/);
    expect(icons).not.toMatch(/case 'halfway':/);
  });
});

describe('Families as a tab', () => {
  const families = read('app/(tabs)/families.tsx');

  it('lives in the tab group at /families, clears the floating navigation and has no back button', () => {
    expect(existsSync(join(root, 'app/families.tsx'))).toBe(false);
    expect(families).toContain('paddingBottom: tabBarClearance');
    expect(families).not.toContain('onBack=');
  });

  it('is the existing Connected Families section, not a copy of it, so invitations keep their consent defaults', () => {
    expect(families).toMatch(/<ConnectedFamiliesSection\s+accountsAvailable=\{accountsAvailable\}\s+variant="screen"/);
    expect(families).not.toMatch(/createInvite|listConnections|connection-invites|homeLatitude|homeLongitude/);
    const section = read('src/components/profile/FamilySections.tsx');
    expect(section).toMatch(/const \[shareRoutines, setShareRoutines\] = useState\(false\)/);
    expect(section).toMatch(/families\.create\(relationship, shareRoutines\)/);
  });

  it('Home and Explore no longer need a pill of their own to reach it', () => {
    expect(existsSync(join(root, 'src/components/navigation/FamiliesAction.tsx'))).toBe(false);
    for (const file of ['app/(tabs)/index.tsx', 'app/(tabs)/explore.tsx']) expect(read(file), file).not.toContain('FamiliesAction');
  });
});

describe('Meet halfway, inside Families', () => {
  const halfway = read('app/halfway.tsx');

  it('is a stack screen at the same /halfway URL, with a way back to Families', () => {
    expect(existsSync(join(root, 'app/halfway.tsx'))).toBe(true);
    expect(read('app/_layout.tsx')).toMatch(/<Stack\.Screen name="halfway"/);
    expect(halfway).toContain('onBack=');
    expect(halfway).toContain("router.replace('/(tabs)/families' as never)");
    expect(halfway).not.toContain('tabBarClearance');
  });

  it('a link naming a family still selects them, even when the screen is already open', () => {
    expect(halfway).toContain('if (preselected) setChosen(preselected);');
  });

  it('is reached from a connected family and from a shortcut on Plans', () => {
    expect(read('src/components/profile/FamilySections.tsx')).toMatch(/pathname: '\/halfway', params: \{ family: familyId \}/);
    const plans = read('app/(tabs)/trips.tsx');
    expect(plans).toContain("router.push('/halfway' as never)");
    expect(plans).toContain('testID="plans-go-halfway"');
  });

  it('is behind the account guard like every other screen', () => {
    const allowed = read('app/_layout.tsx').match(/SIGNED_OUT_ALLOWED = new Set\(\[([^\]]*)\]/)?.[1] ?? '';
    expect(allowed).not.toMatch(/halfway|families/);
  });
});

describe('the brand row on every main screen', () => {
  it('Home and Explore draw the same lockup above their approved headers, and account for its height', () => {
    const home = read('app/(tabs)/index.tsx');
    expect(home).toContain('<BrandLockup gap={0} />');
    expect(home).toMatch(/ART_LIFT = GREETING_FRAME_Y - HOME_CONTENT_TOP/);
    expect(home).toContain('windowHeight - (insets.top + BRAND_ROW_TOP + BRAND_ROW_HEIGHT)');
    const explore = read('app/(tabs)/explore.tsx');
    expect(explore).toContain('<BrandLockup testID="explore-brand-row" gap={0} />');
    expect(explore).toContain('style={{ top: BRAND_ROW_SHIFT }}');
  });

  it('the section pages use the one PageHeader, which draws the same lockup', () => {
    for (const file of ['app/(tabs)/families.tsx', 'app/(tabs)/trips.tsx', 'app/(tabs)/profile.tsx', 'app/halfway.tsx', 'app/saved.tsx']) {
      expect(read(file), file).toContain('<PageHeader');
    }
    expect(read('src/components/navigation/PageHeader.tsx')).toContain('<BrandLockup onBack={onBack} action={action} flush />');
  });
});

describe('Saved places, from Plans', () => {
  it('is a screen of its own at /saved, with a way back', () => {
    const saved = read('app/saved.tsx');
    expect(saved).toContain('<PageHeader');
    expect(saved).toContain('onBack=');
    expect(saved).toContain('Saved places');
    expect(saved).not.toContain('tabBarClearance');
  });

  it('Plans opens it, saying how many places are kept', () => {
    const plans = read('app/(tabs)/trips.tsx');
    expect(plans).toContain("router.push('/saved' as never)");
    expect(plans).toContain('testID="plans-saved-places"');
  });

  it('no screen still sends anyone to the old Saved tab', () => {
    for (const file of ['app/(tabs)/index.tsx', 'app/(tabs)/explore.tsx', 'app/(tabs)/profile.tsx', 'app/venue/[id].tsx', 'src/components/shared/SaveButton.tsx']) {
      expect(read(file), file).not.toContain("'/(tabs)/saved'");
    }
  });
});
