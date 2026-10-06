import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { colors } from '@/src/design-system/tokens';
import { withIndefiniteArticle } from '@/src/utils/indefinite-article';

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
    expect(venueImage).toMatch(/photo not available\. Illustration of \$\{withIndefiniteArticle\(categoryNoun\(category\)\)\}/);
    // No credit chip over an illustration: nobody took a photograph.
    expect(venueImage).toMatch(/showCredit&&!failed\?photoCredit\(uri\):null/);
  });
});

/**
 * The accessible label of the no-photo illustration reads "Illustration of <a|an> <noun>". It used to hard-code "a", which a
 * screen reader read aloud as "Illustration of a attraction" and "a activity".
 */
describe('the no-photo illustration label uses the right article', () => {
  const venueImage = read('src/components/ui/VenueImage.tsx');
  // The category words the label can say, read from the component's own table so a new category is covered automatically.
  const table = venueImage.slice(venueImage.indexOf('const CATEGORY_NOUN'), venueImage.indexOf('};', venueImage.indexOf('const CATEGORY_NOUN')));
  const nouns = [...table.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);

  it('reads every category noun with a or an as English does', () => {
    expect(nouns.length).toBeGreaterThanOrEqual(10);
    const said = nouns.map((noun) => withIndefiniteArticle(noun));
    expect(said).toEqual(expect.arrayContaining(['an attraction', 'an activity venue', 'a park', 'a farm', 'a zoo', 'a museum', 'a soft play centre', 'a beach', 'a cafe', 'a restaurant']));
    for (const phrase of said) expect(phrase).not.toMatch(/^a [aeiou]/i);
  });

  it('keeps "a" before a consonant and uses "an" before a vowel, including the generic fallback', () => {
    expect(withIndefiniteArticle('place')).toBe('a place');
    expect(withIndefiniteArticle('attraction')).toBe('an attraction');
    expect(withIndefiniteArticle('activity venue')).toBe('an activity venue');
    expect(withIndefiniteArticle('Event')).toBe('an Event');
  });

  it('never hard-codes "a" in the label again', () => {
    expect(venueImage).not.toMatch(/Illustration of a \$\{/);
  });
});

