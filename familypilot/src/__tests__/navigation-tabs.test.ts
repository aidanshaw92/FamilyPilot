import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LABELLED_METRICS, floatingTabBarLayout } from '@/src/utils/floating-tab-bar-layout';

/**
 * Home · Explore · Together · Plans · Profile.
 *
 * Together is everything to do with another family, behind one switch at its top: Meet halfway (a map of places that work for
 * two families) and Your families (the families a parent plans with: connections, invitations, what they share, Plan
 * together). It replaces the two tabs the app had before (Families and Halfway), which sent a family's "Meet halfway" button to
 * a different tab and gave "where do I start with a friend" two answers. The addresses /halfway and /families still work: they
 * redirect into the matching view. Saved places open from Plans. Approved in Figma page 09.
 */
const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('the bottom navigation', () => {
  const layout = read('app/(tabs)/_layout.tsx');
  const names = [...layout.matchAll(/\{ name: '([a-z]+)', title: '([A-Za-z ]+)'|name: '([a-z]+)',\s*\n\s*title: '([A-Za-z ]+)'/g)].map((m) => [m[1] ?? m[3], m[2] ?? m[4]]);

  it('is Home · Explore · Together · Plans · Profile, in that order: five distinct tabs', () => {
    expect(names).toEqual([['index', 'Home'], ['explore', 'Explore'], ['together', 'Together'], ['trips', 'Plans'], ['profile', 'Profile']]);
    expect(new Set(names.map((n) => n[0])).size).toBe(5);
  });

  it('has no Saved, Families or Halfway tab: Together is a tab screen, and the old addresses are redirects outside the tabs', () => {
    expect(layout).not.toMatch(/name: '(saved|families|halfway)'/);
    expect(existsSync(join(root, 'app/(tabs)/saved.tsx'))).toBe(false);
    expect(existsSync(join(root, 'app/(tabs)/families.tsx'))).toBe(false);
    expect(existsSync(join(root, 'app/(tabs)/halfway.tsx'))).toBe(false);
    expect(existsSync(join(root, 'app/(tabs)/together.tsx'))).toBe(true);
    expect(read('app/_layout.tsx')).not.toMatch(/<Stack\.Screen name="(halfway|families)"/);
  });

  it('keeps the approved pill shape and fits five tabs at every phone width, in both frames, with room either side', () => {
    for (const width of [360, 375, 390, 393, 402, 414, 430, 440]) {
      for (const variant of ['home', 'explore'] as const) {
        const pill = floatingTabBarLayout(5, 34, variant, true);
        expect(pill.width + 16, `${variant} at ${width}`).toBeLessThanOrEqual(width);
        // Touch targets: the whole tab cell is pressable, at least 44 x 44 and in practice 62 x 66.
        expect(pill.tabWidth).toBeGreaterThanOrEqual(44);
        expect(pill.height).toBeGreaterThanOrEqual(44);
        expect(pill.indicator).toBeLessThanOrEqual(pill.tabWidth);
      }
    }
  });

  it('five tabs drawn as the approved frames do (no labels) are unchanged, and six still fit if a caller asks for them', () => {
    const pill = floatingTabBarLayout(5, 34, 'home');
    expect(pill.width).toBeCloseTo(289.7, 1);
    expect(pill.tabWidth).toBe(55);
    expect(floatingTabBarLayout(5, 34, 'explore').width).toBeCloseTo(310.1, 1);
    for (const width of [360, 375, 430]) expect(floatingTabBarLayout(6, 34, 'home', true).width + 16).toBeLessThanOrEqual(width);
  });

  it('carries each tab’s title as an 11pt visible label on a 62 x 66 tab inside a 314pt pill', () => {
    // The narrowest iPhone still shown (320pt) keeps the whole pill on screen: the six-tab bar was 318pt wide, this is 314.
    expect(floatingTabBarLayout(5, 34, 'home', true).width).toBeLessThan(320);
    for (const width of [360, 375, 390, 393, 402, 414, 430, 440]) {
      for (const variant of ['home', 'explore'] as const) {
        const pill = floatingTabBarLayout(5, 34, variant, true);
        expect(pill.height).toBe(66);
        expect(pill.tabWidth).toBe(62);
        expect(pill.width).toBe(314);
        expect(pill.width + 16).toBeLessThanOrEqual(width);
        // The disc sits behind the icon alone, leaving room for an 11pt word (12pt line) under it, inside the capsule.
        expect(pill.indicator + 2 + 12).toBeLessThanOrEqual(pill.height - 8);
      }
    }
    expect(LABELLED_METRICS.labelSize).toBe(11);
    const bar = read('src/components/navigation/FloatingTabBar.tsx');
    expect(bar).toContain('testID={`tab-label-${route.name}`}');
    expect(bar).toContain('numberOfLines={1}');
    expect(bar).toContain('floatingTabBarLayout(routes.length, insets.bottom, variant, true)');
  });

  it('the screens clear the five-tab bar', () => {
    expect(read('src/hooks/use-tab-bar-clearance.ts')).toContain("floatingTabBarLayout(5, insets.bottom, 'home', true)");
  });

  it('every tab exposes its title as an accessibility label and as a tab with a selected state', () => {
    const bar = read('src/components/navigation/FloatingTabBar.tsx');
    expect(bar).toContain('accessibilityRole="tab"');
    expect(bar).toContain('accessibilityLabel={label}');
    expect(bar).toContain('accessibilityState={{ selected: focused }}');
  });

  it('draws a Together icon in both approved frames, in their stroke language (two people)', () => {
    const icons = read('src/components/ui/icons.tsx');
    expect(icons).toMatch(/export type NavTab = [^;]*'together'/);
    expect(icons).not.toMatch(/'families'|'halfway'/);
    expect((icons.match(/case 'together':/g) ?? []).length).toBe(2);
    expect(icons).toMatch(/together: 810/);
    expect(icons).toMatch(/together: 890/);
  });
});

describe('Together, one tab with two views', () => {
  const together = read('app/(tabs)/together.tsx');
  const families = read('src/components/together/YourFamiliesView.tsx');
  const halfway = read('src/components/together/MeetHalfwayView.tsx');

  it('draws the title and the switch above both views, and each view clears the floating navigation with no back button', () => {
    expect(together).toContain('<TogetherSwitch');
    expect(together).toContain('<MeetHalfwayView');
    expect(together).toContain('<YourFamiliesView');
    expect(families).toContain('paddingBottom: tabBarClearance');
    expect(halfway).toContain('paddingBottom: tabBarClearance');
    expect(families).not.toContain('onBack=');
    expect(halfway).not.toContain('onBack=');
  });

  it('opens on Meet halfway when there is a family to meet and on Your families when there is nobody, once, and a link can choose', () => {
    expect(together).toContain("setView(eligible ? 'halfway' : 'families')");
    expect(together).toContain('plannableFamilies({ stored, accepted: connected.accepted, verified: signedIn && connected.loaded })');
    expect(together).toContain('if (view === null && known)');
    expect(together).toContain('asView(firstValue(params.view))');
    // Decided once: the connections are read only while the default is open.
    expect(together).toContain('useConnectedFamilies(signedIn && view === null)');
  });

  it('changing view, by the switch or by a family card’s Meet halfway, updates the address in place: one entry, so Back is predictable', () => {
    expect(together).toContain('router.setParams({ view: next, family: withFamily }');
    expect(together).toContain("const meetHalfway = (familyId: string) => choose('halfway', familyId);");
    expect(together).not.toContain('router.push(');
  });

  it('Your families is the existing Connected Families section, not a copy of it, so invitations keep their consent defaults', () => {
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

  it('Meet halfway opens directly on an answer with one family to meet, and on adding a starting point with none (no connection needed)', () => {
    expect(halfway).toContain('if (!chosen && candidates.length === 1) setChosen(candidates[0].id);');
    expect(halfway).toContain('const showAdd = adding || (candidates.length === 0 && (connected.loaded || !signedIn));');
    expect(halfway).toContain('testID="halfway-no-families"');
  });

  it('Meet halfway shows who and when on one selector that opens the edit sheet, so the map comes first', () => {
    const chrome = read('src/components/halfway/chrome.tsx');
    expect(chrome).toContain('testID="halfway-selector"');
    expect(chrome).toContain('testID="halfway-edit"');
    expect(halfway).toContain('<HalfwayEditSheet');
  });

  it('a link naming a family still selects them, even when the view is already open', () => {
    expect(halfway).toContain('if (preselected) setChosen(preselected);');
  });

  it('a connected family’s card switches to Meet halfway inside Together, with that family chosen', () => {
    const section = read('src/components/profile/FamilySections.tsx');
    expect(section).toContain('onMeetHalfway(familyId)');
    expect(section).toMatch(/pathname: '\/together', params: \{ view: 'halfway', family: familyId \}/);
    expect(families).toContain('onMeetHalfway={onMeetHalfway}');
  });

  it('the old addresses redirect into the matching view and keep a family choice', () => {
    expect(read('app/halfway.tsx')).toContain("pathname: '/together', params: { view: 'halfway'");
    expect(read('app/halfway.tsx')).toContain('family');
    expect(read('app/families.tsx')).toContain("pathname: '/together', params: { view: 'families' }");
  });

  it('is behind the account guard like every other screen', () => {
    const allowed = read('app/_layout.tsx').match(/SIGNED_OUT_ALLOWED = new Set\(\[([^\]]*)\]/)?.[1] ?? '';
    expect(allowed).not.toMatch(/together|halfway|families/);
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
    // Together is the exception: its approved frames carry the title straight under the status bar, above the switch.
    for (const file of ['app/(tabs)/trips.tsx', 'app/(tabs)/profile.tsx', 'app/saved.tsx']) {
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
