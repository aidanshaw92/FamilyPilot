import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { useChromeStore } from '@/src/stores/chrome-store';

/**
 * Edit meeting details is a focused modal (approved Figma frame 4): the floating navigation steps aside while it is open and
 * returns afterwards, its content scrolls on its own, "Done" stays anchored near the bottom, and nothing overlaps. The
 * rendered behaviour is checked in a browser by `verify-halfway-real-catalogue.mjs`; these pin how it is built, so a change
 * that brings back the overlap (the bar over the sheet, a sheet that does not scroll, a Done that floats over content) fails here.
 */
const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('the navigation steps aside for the edit sheet, and comes back', () => {
  beforeEach(() => useChromeStore.getState().setTabBarHidden(false));

  it('is shown by default, hidden on request, shown again', () => {
    expect(useChromeStore.getState().tabBarHidden).toBe(false);
    useChromeStore.getState().setTabBarHidden(true);
    expect(useChromeStore.getState().tabBarHidden).toBe(true);
    useChromeStore.getState().setTabBarHidden(false);
    expect(useChromeStore.getState().tabBarHidden).toBe(false);
  });

  it('is never persisted, so a relaunch cannot start with the navigation missing', () => {
    expect(read('src/stores/chrome-store.ts').replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/persist|AsyncStorage/);
  });

  it('the floating bar draws nothing while hidden, and keeps its own state', () => {
    const bar = read('src/components/navigation/FloatingTabBar.tsx');
    expect(bar).toContain('useChromeStore((s) => s.tabBarHidden)');
    expect(bar).toContain('if (hidden) return null;');
    // The hooks above the early return still run, so the bar is intact when it comes back.
    expect(bar.indexOf('useAnimatedStyle')).toBeLessThan(bar.indexOf('if (hidden) return null;'));
  });

  it('Meet halfway hides it only while the sheet is open, and always restores it (also if the screen goes away)', () => {
    const screen = read('app/(tabs)/halfway.tsx');
    expect(screen).toContain('setTabBarHidden(editOpen);');
    expect(screen).toMatch(/return \(\) => setTabBarHidden\(false\);/);
    // The only thing that hides it is the edit sheet's open state: not the expanded recommendation, not Map or List.
    expect(screen.match(/setTabBarHidden\(/g)).toHaveLength(2);
  });

  it('no other screen touches it', () => {
    for (const file of ['app/(tabs)/index.tsx', 'app/(tabs)/explore.tsx', 'app/(tabs)/families.tsx', 'app/(tabs)/trips.tsx', 'app/(tabs)/profile.tsx']) {
      expect(read(file), file).not.toContain('chrome-store');
    }
  });
});

describe('the edit sheet is built to scroll, anchor Done and keep clear of the keyboard and the home indicator', () => {
  const sheet = read('src/components/halfway/EditSheet.tsx');

  it('its content is a scroll view that fills the space above Done (so it scrolls on its own)', () => {
    expect(sheet).toContain('testID="halfway-edit-scroll"');
    expect(sheet).toMatch(/scroll: \{ flex: 1 \}/);
    expect(sheet).toMatch(/column: \{ flex: 1 \}/);
  });

  it('Done and its helper text are a normal child beneath the scroll view, not an absolutely positioned layer over the content', () => {
    const pinned = sheet.match(/pinned: \{([^}]*)\}/)?.[1] ?? '';
    expect(pinned).not.toMatch(/position: 'absolute'/);
    expect(sheet.indexOf('</ScrollView>')).toBeLessThan(sheet.indexOf('testID="halfway-edit-actions"'));
  });

  it('it lifts above the keyboard, and keeps the home indicator clear', () => {
    expect(sheet).toContain('KeyboardAvoidingView');
    expect(sheet).toMatch(/behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/);
    expect(sheet).toContain('useSafeAreaInsets');
    expect(sheet).toMatch(/paddingBottom: Math\.max\(insets\.bottom, 12\) \+ 4/);
  });

  it('it needs no room for the floating navigation, which is not there while it is open', () => {
    expect(sheet).not.toMatch(/bottomClearance|tabBarClearance/);
  });

  it('both the close button and Done close it, and the area behind it does too', () => {
    expect(sheet).toMatch(/testID="halfway-edit-close"/);
    expect(sheet).toMatch(/onPress=\{onClose\} accessibilityRole="button" accessibilityLabel="Close" testID="halfway-edit-close"/);
    expect(sheet).toMatch(/<Button label="Done"[^>]*onPress=\{onClose\}/);
    expect(sheet).toMatch(/<Pressable style=\{StyleSheet\.absoluteFill\} onPress=\{onClose\}/);
  });

  it('the title and the close button are outside the scrolling content, so Close is always reachable', () => {
    const scrollStart = sheet.indexOf('<ScrollView');
    expect(sheet.indexOf('testID="halfway-edit-close"')).toBeLessThan(scrollStart);
    expect(sheet.indexOf('testID="halfway-edit-header"')).toBeLessThan(scrollStart);
  });

  it('the Longest journey row is in the scrolling content, under "From your family profiles"', () => {
    const scroll = sheet.slice(sheet.indexOf('<ScrollView'), sheet.indexOf('</ScrollView>'));
    expect(scroll).toContain('From your family profiles');
    expect(scroll).toContain('testID="halfway-row-limit"');
    expect(scroll).toContain('title="Longest journey"');
  });

  it('the sheet is modal for assistive technology and starts below the status bar', () => {
    expect(sheet).toContain('accessibilityViewIsModal');
    expect(read('app/(tabs)/halfway.tsx')).toContain('const sheetTop = Math.max(64, insets.top + 17);');
  });
});
