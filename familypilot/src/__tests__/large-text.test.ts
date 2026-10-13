import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { LARGE_TEXT_SCALE, isLargeText, scaleFromRootFontSize } from '@/src/utils/font-scale';

const read = (path: string) => readFileSync(join(__dirname, '..', '..', path), 'utf8');

describe('the text size the layout reacts to', () => {
  it('is 1 at the browser default and never less', () => {
    expect(scaleFromRootFontSize(16)).toBe(1);
    expect(scaleFromRootFontSize(12)).toBe(1);
  });

  it('follows the browser’s root text size up to the largest iOS size', () => {
    expect(scaleFromRootFontSize(16 * 1.35)).toBeCloseTo(1.35);
    expect(scaleFromRootFontSize(16 * 2.35)).toBeCloseTo(2.35);
    expect(scaleFromRootFontSize(16 * 5)).toBe(3.1);
  });

  it('survives a value it cannot read', () => {
    expect(scaleFromRootFontSize(Number.NaN)).toBe(1);
    expect(scaleFromRootFontSize(0)).toBe(1);
    expect(scaleFromRootFontSize(-4)).toBe(1);
  });

  it('is "large" from iOS’s third-largest standard size (xxxLarge, 1.35), not at the default or one step below', () => {
    expect(isLargeText(1)).toBe(false);
    expect(isLargeText(1.25)).toBe(false);
    expect(isLargeText(LARGE_TEXT_SCALE)).toBe(true);
    expect(isLargeText(2.35)).toBe(true);
  });
});

// The layout itself is measured in a browser by scripts/verify-halfway-large-text.mjs (CI: home-visual-regression). These guard the
// decisions that script depends on, so removing one is a failing unit test and not only a failing browser run.
describe('the Meet halfway layout keeps its larger-text behaviour', () => {
  it('the pieces that hold words grow with them and are not fixed in height', () => {
    const parts = read('src/components/halfway/parts.tsx');
    expect(parts).toMatch(/chip: \{ minHeight: 28/);
    expect(parts).toMatch(/pill: \{ minHeight: 24/);
    expect(parts).toMatch(/journeyStack/);
    expect(parts).not.toMatch(/(chip|pill): \{ height: 2[48]/);
    const chrome = read('src/components/halfway/chrome.tsx');
    expect(chrome).toMatch(/toggle: \{ minWidth: 163, minHeight: MIN_TARGET/);
    expect(chrome).not.toMatch(/selectorWho\} numberOfLines/);
    expect(chrome).not.toMatch(/selectorWhen\} numberOfLines/);
  });

  it('the shared chip grows instead of cutting its label, and only at larger text', () => {
    const chip = read('src/components/ui/Chip.tsx');
    expect(chip).toMatch(/numberOfLines=\{big \? undefined : 1\}/);
    expect(chip).toMatch(/minHeight: targetHeight/);
  });

  it('the six tab labels are capped so six words fit side by side; the tabs themselves stay 6', () => {
    const bar = read('src/components/navigation/FloatingTabBar.tsx');
    expect(bar).toMatch(/maxFontSizeMultiplier=\{TAB_LABEL_MAX_SCALE\}/);
    expect(bar).toMatch(/TAB_LABEL_MAX_SCALE = 1\.2/);
  });

  it('the screen opens on the list and puts the map and its card in one scroll at larger text', () => {
    const screen = read('app/(tabs)/halfway.tsx');
    expect(screen).toMatch(/useState<'map' \| 'list'>\(largeText \? 'list' : 'map'\)/);
    expect(screen).toMatch(/testID="halfway-map-scroll"/);
    expect(screen).toMatch(/inline=\{largeText\}/);
    // the header scrolls with the page rather than filling a small phone
    expect(screen).toMatch(/\{largeText \? null : header\}/);
  });

  it('the pinned actions make room for what they measure', () => {
    const sheet = read('src/components/halfway/Sheet.tsx');
    expect(sheet).toMatch(/setPinnedHeight\(e\.nativeEvent\.layout\.height\)/);
    expect(sheet).toMatch(/Math\.max\(bottomClearance \+ 92, pinnedHeight \+ 16\)/);
    expect(sheet).toMatch(/flexWrap: 'wrap'/);
  });

  it('the harness is part of the visual-regression workflow', () => {
    const workflow = readFileSync(join(__dirname, '..', '..', '..', '.github', 'workflows', 'home-visual-regression.yml'), 'utf8');
    expect(workflow).toMatch(/verify-halfway-large-text\.mjs/);
  });
});
