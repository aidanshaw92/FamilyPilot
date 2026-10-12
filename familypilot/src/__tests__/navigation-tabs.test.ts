import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { floatingTabBarLayout } from '@/src/utils/floating-tab-bar-layout';

/**
 * Home · Explore · Families · Halfway · Plans · Profile.
 *
 * Families is the hub for who a parent plans with: the families they are connected to, invitations, what they share and
 * Plan together. Halfway is a tab of its own (it was folded into Families in the first beta overhaul, which hid a main job
 * behind a second tap): a map of places that work for two families, one tap from anywhere. A connected family's card in
 * Families still offers it, pre-selected. Saved places open from Plans. The URLs /halfway and /saved are unchanged.
 */
const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('the bottom navigation', () => {
  const layout = read('app/(tabs)/_layout.tsx');
  const names = [...layout.matchAll(/\{ name: '([a-z]+)', title: '([A-Za-z ]+)'|name: '([a-z]+)',\s*\n\s*title: '([A-Za-z ]+)'/g)].map((m) => [m[1] ?? m[3], m[2] ?? m[4]]);

  it('is Home · Explore · Families · Halfway · Plans · Profile, in that order: six distinct tabs', () => {
    expect(names).toEqual([['index', 'Home'], ['explore', 'Explore'], ['families', 'Families'], ['halfway', 'Halfway'], ['trips', 'Plans'], ['profile', 'Profile']]);
    expect(new Set(names.map((n) => n[0])).size).toBe(6);
  });

  it('has no Saved tab, and Halfway is a tab screen at /halfway, not a stack screen', () => {
    expect(layout).not.toMatch(/name: 'saved'/);
    expect(existsSync(join(root, 'app/(tabs)/saved.tsx'))).toBe(false);
    expect(existsSync(join(root, 'app/(tabs)/halfway.tsx'))).toBe(true);
    expect(existsSync(join(root, 'app/halfway.tsx'))).toBe(false);
    expect(read('app/_layout.tsx')).not.toMatch(/<Stack\.Screen name="halfway"/);
  });

  it('keeps the approved pill shape and fits six tabs at every phone width, in both frames, with room either side', () => {
    for (const width of [360, 375, 390, 393, 402, 414, 430, 440]) {
      for (const variant of ['home', 'explore'] as const) {
        const pill = floatingTabBarLayout(6, 34, variant);
        expect(pill.width + 16, `${variant} at ${width}`).toBeLessThanOrEqual(width);
        // Touch targets: the whole tab cell is pressable, at least 44 x 44 and in practice 51 x 59.
        expect(pill.tabWidth).toBeGreaterThanOrEqual(44);
        expect(pill.height).toBeGreaterThanOrEqual(44);
        expect(pill.indicator).toBeLessThanOrEqual(pill.tabWidth);
      }
    }
  });

  it('five tabs (Plans hidden by a pilot flag) still draw exactly as the approved frames do', () => {
    const pill = floatingTabBarLayout(5, 34, 'home');
    expect(pill.width).toBeCloseTo(289.7, 1);
    expect(pill.tabWidth).toBe(55);
    expect(floatingTabBarLayout(5, 34, 'explore').width).toBeCloseTo(310.1, 1);
  });

  it('carries each tab’s title as a visible label, still a 51 x 66 touch target and still inside every phone width', () => {
    for (const width of [360, 375, 390, 393, 402, 414, 430, 440]) {
      for (const variant of ['home', 'explore'] as const) {
        const pill = floatingTabBarLayout(6, 34, variant, true);
        expect(pill.height).toBe(66);
        expect(pill.tabWidth).toBeGreaterThanOrEqual(44);
        expect(pill.width + 16).toBeLessThanOrEqual(width);
        // The disc sits behind the icon alone, leaving room for a 10pt word (12pt line) under it, inside the capsule.
        expect(pill.indicator + 2 + 12).toBeLessThanOrEqual(pill.height - 8);
      }
    }
    const bar = read('src/components/navigation/FloatingTabBar.tsx');
    expect(bar).toContain('testID={`tab-label-${route.name}`}');
    expect(bar).toContain('numberOfLines={1}');
    expect(bar).toContain('floatingTabBarLayout(routes.length, insets.bottom, variant, true)');
  });

  it('the screens clear the six-tab bar', () => {
    expect(read('src/hooks/use-tab-bar-clearance.ts')).toContain("floatingTabBarLayout(6, insets.bottom, 'home', true)");
  });

  it('every tab exposes its title as an accessibility label and as a tab with a selected state', () => {
    const bar = read('src/components/navigation/FloatingTabBar.tsx');
    expect(bar).toContain('accessibilityRole="tab"');
    expect(bar).toContain('accessibilityLabel={label}');
    expect(bar).toContain('accessibilityState={{ selected: focused }}');
  });

  it('draws a Families icon in both approved frames, in their stroke language', () => {
    const icons = read('src/components/ui/icons.tsx');
    expect(icons).toMatch(/export type NavTab = [^;]*'families'/);
    expect((icons.match(/case 'families':/g) ?? []).length).toBe(2);
    expect(icons).toMatch(/families: 810/);
    expect(icons).toMatch(/families: 890/);
  });

  it('draws a Halfway icon in both approved frames, a pin over a dashed line between two dots, distinct from Families and Explore', () => {
    const icons = read('src/components/ui/icons.tsx');
    expect(icons).toMatch(/export type NavTab = [^;]*'halfway'/);
    expect((icons.match(/case 'halfway':/g) ?? []).length).toBe(2);
    expect(icons).toMatch(/halfway: 690/);
    expect(icons).toMatch(/halfway: 758\.2/);
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

describe('Meet halfway, its own tab', () => {
  const halfway = read('app/(tabs)/halfway.tsx');

  it('is a tab at the same /halfway URL: no back button, and it clears the floating navigation', () => {
    expect(halfway).not.toContain('onBack=');
    expect(halfway).toContain('paddingBottom: tabBarClearance');
  });

  it('opens directly on an answer with one family to meet, and on adding a starting point with none (no connection needed)', () => {
    expect(halfway).toContain('if (!chosen && candidates.length === 1) setChosen(candidates[0].id);');
    expect(halfway).toContain('const showAdd = adding || (candidates.length === 0 && (connected.loaded || !signedIn));');
    expect(halfway).toContain('testID="halfway-no-families"');
  });

  it('shows who and when on one selector that opens the edit sheet, so the map comes first', () => {
    const chrome = read('src/components/halfway/chrome.tsx');
    expect(chrome).toContain('testID="halfway-selector"');
    expect(chrome).toContain('testID="halfway-edit"');
    expect(halfway).toContain('<HalfwayEditSheet');
  });

  it('a link naming a family still selects them, even when the screen is already open', () => {
    expect(halfway).toContain('if (preselected) setChosen(preselected);');
  });

  it('is also reached from a connected family’s card, with that family chosen', () => {
    expect(read('src/components/profile/FamilySections.tsx')).toMatch(/pathname: '\/halfway', params: \{ family: familyId \}/);
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
    // Meet halfway is the exception: its approved v2 frames carry the title straight under the status bar (HalfwayHeader).
    for (const file of ['app/(tabs)/families.tsx', 'app/(tabs)/trips.tsx', 'app/(tabs)/profile.tsx', 'app/saved.tsx']) {
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
