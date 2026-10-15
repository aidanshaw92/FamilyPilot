import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { artVariant } from '@/src/utils/art-variant';

const read = (path: string) => readFileSync(join(__dirname, '..', '..', path), 'utf8');

describe('venue pictures without a photograph', () => {
  it('the illustration varies by place and is stable for one place', () => {
    const names = ['Kentish Town City Farm', 'Horniman Museum', 'Hackney City Farm', 'Coram’s Fields', 'Mudchute Park and Farm', 'Discover Children’s Story Centre'];
    expect(artVariant('Kentish Town City Farm')).toBe(artVariant('Kentish Town City Farm'));
    expect(new Set(names.map(artVariant)).size).toBeGreaterThan(2);
    expect(artVariant(undefined)).toBe(0);
  });

  it('says it is an illustration once the box is big enough, and never names a photographer for it', () => {
    const image = read('src/components/ui/VenueImage.tsx');
    expect(image).toContain('Illustration · no photo yet');
    expect(image).toContain('const credit=showCredit&&!failed?photoCredit(uri):null;');
  });
});

describe('Explore filters and evidence', () => {
  it('the sheet says a filter shows confirmed places only, and that unchecked is not a no', () => {
    const sheet = read('src/components/explore/FilterSheet.tsx');
    expect(sheet).toContain('testID="evidence-filters-note"');
    expect(sheet).toContain('Only what is confirmed counts');
    expect(sheet).toContain('not checked');
  });
});

describe('Family Fit reads the same on every surface', () => {
  const must40 = (file: string) => expect(read(file), file).toMatch(/matchBadgeText\([^)]*,\s*40\)|maxLabel=\{40\}/);
  it('Home, Explore, Saved, Venue Detail and the recommendation list all draw the badge’s words from the one function at the same length', () => {
    for (const file of [
      'src/components/shared/DecisionCard.tsx',
      'src/components/shared/SavedPlaceRow.tsx',
      'src/components/shared/RecommendationPattern.tsx',
      'app/venue/[id].tsx',
    ]) must40(file);
  });

  it('nothing but the wording moved: the ranking inputs are untouched files', () => {
    // The order is pinned against the pre-change code in ranking-golden.test.ts; this guards the badge from becoming a sort key.
    for (const file of ['src/utils/filter-venues.ts', 'src/services/places/fit-order.ts']) {
      expect(read(file), file).not.toMatch(/practicalOnly|matchBadgeText/);
    }
  });
});

describe('"Looks practical" is never drawn as a fit', () => {
  it('no star and the neutral pill when the place is confirmed for no child', () => {
    const badge = read('src/components/ui/FamilyMatch.tsx');
    expect(badge).toContain('|| Boolean(verdictMatch.practicalOnly)');
    expect(badge).toContain('&& !verdictMatch.practicalOnly ? ');
  });
});
