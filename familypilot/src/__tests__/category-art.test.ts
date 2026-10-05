import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { colors } from '@/src/design-system/tokens';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * The fallback for a real venue with no provider photograph is FamilyPilot's own category illustration. These
 * pin the two properties that make it safe to show beside a real venue's name: it covers every category a venue can
 * have, and it is drawn artwork (vector shapes), never an image file that could pass for a photograph.
 */
describe('the category illustration fallback', () => {
  const art = read('src/components/ui/CategoryArt.tsx');

  it('has a palette and a scene for every venue category', () => {
    for (const category of Object.keys(colors.categoryGradients)) {
      if (['shop', 'hotel'].includes(category)) continue; // never surfaced as a place to visit
      expect(art, `a palette for ${category}`).toMatch(new RegExp(`\\b${category}:\\s*\\{ skyTop`));
      expect(art, `a scene for ${category}`).toMatch(new RegExp(`case '${category}'`));
    }
  });

  it('is vector artwork only: no image file, no network, no photograph', () => {
    expect(art).not.toMatch(/require\(|from '.*\.(jpg|jpeg|png|webp)'|uri:|<Image|fetch\(/);
  });

  it('is the only thing VenueImage draws when there is no photograph, and says it is an illustration', () => {
    const venueImage = read('src/components/ui/VenueImage.tsx');
    expect(venueImage).toMatch(/<CategoryArt category=\{category\}/);
    expect(venueImage).toMatch(/photo not available\. Illustration of a/);
    // No credit chip over an illustration: nobody took a photograph.
    expect(venueImage).toMatch(/showCredit&&!failed\?photoCredit\(uri\):null/);
  });
});
