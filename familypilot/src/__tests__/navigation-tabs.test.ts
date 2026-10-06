import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { floatingTabBarLayout } from '@/src/utils/floating-tab-bar-layout';

/**
 * Home · Explore · Halfway · Plans · Profile.
 *
 * Meet halfway is one of the three jobs FamilyPilot does, so it became a destination of its own; it had been a card
 * inside Plans. The Saved tab made way for it (still five tabs, so the approved pill keeps its geometry), and Saved
 * places, which had ONLY been reachable from that tab, now open from Plans. Their URL (/saved) is unchanged, and so is
 * /halfway, so every existing link still lands.
 */
const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('the bottom navigation', () => {
  const layout = read('app/(tabs)/_layout.tsx');
  const names = [...layout.matchAll(/\{ name: '([a-z]+)', title: '([A-Za-z ]+)'|name: '([a-z]+)',\s*\n\s*title: '([A-Za-z ]+)'/g)].map((m) => [m[1] ?? m[3], m[2] ?? m[4]]);

  it('is Home · Explore · Halfway · Plans · Profile, in that order, and five tabs', () => {
    expect(names).toEqual([['index', 'Home'], ['explore', 'Explore'], ['halfway', 'Halfway'], ['trips', 'Plans'], ['profile', 'Profile']]);
  });

  it('has no Saved tab', () => {
    expect(layout).not.toMatch(/name: 'saved'/);
    expect(existsSync(join(root, 'app/(tabs)/saved.tsx'))).toBe(false);
  });

  it('keeps the approved pill: five tabs fit at every phone width', () => {
    for (const width of [360, 390, 393, 430]) {
      const pill = floatingTabBarLayout(5, 34, 'home');
      expect(pill.width).toBeLessThanOrEqual(width - 16);
    }
  });

  it('draws a Halfway icon in both approved frames, in their stroke language', () => {
    const icons = read('src/components/ui/icons.tsx');
    expect(icons).toMatch(/export type NavTab = [^;]*'halfway'/);
    expect((icons.match(/case 'halfway':/g) ?? []).length).toBe(2);
    expect(icons).toMatch(/halfway: 690/);
    expect(icons).toMatch(/halfway: 758\.2/);
  });
});

describe('Halfway as a tab', () => {
  const halfway = read('app/(tabs)/halfway.tsx');

  it('lives in the tab group at the same /halfway URL', () => {
    expect(existsSync(join(root, 'app/(tabs)/halfway.tsx'))).toBe(true);
    expect(existsSync(join(root, 'app/halfway.tsx'))).toBe(false);
  });

  it('clears the floating navigation and has no back button', () => {
    expect(halfway).toContain('paddingBottom: tabBarClearance');
    expect(halfway).not.toContain('<BackButton');
  });

  it('a link naming a family still selects them, even when the tab is already open', () => {
    expect(halfway).toContain('if (preselected) setChosen(preselected);');
  });
});

describe('Saved places, from Plans', () => {
  it('is a screen of its own at /saved, with a way back', () => {
    const saved = read('app/saved.tsx');
    expect(saved).toContain('<BackButton');
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
