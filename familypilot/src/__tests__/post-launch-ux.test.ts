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
    expect(sheet).toContain('left out, not counted as a no');
  });
});
