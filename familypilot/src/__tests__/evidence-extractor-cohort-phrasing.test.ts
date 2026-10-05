import { describe, expect, it } from 'vitest';

const { extractEvidenceFromText } = require('../../../server/enrichment/_lib/evidence-extractor');

/**
 * Real wording from the production cohort (5 Oct 2026 audit): statements a parent would read as plain facts that
 * the first extractor could not. Every positive here is a sentence on a venue's own page; every negative is a
 * sentence that looks similar and must stay unknown. The audit's finding was precision-limited coverage, so these
 * tests protect precision first.
 */
const meta = { url: 'https://venue.example/visit', sourceType: 'visitor_info', retrievedAt: '2026-10-05', pageTitle: null };
const facts = (sentence: string) =>
  (extractEvidenceFromText(`${sentence}.`, meta) as Array<{ field: string; value: string }>).map((f) => `${f.field}=${f.value}`);

describe('café: the venue’s own café, said in its own voice', () => {
  const positives: Array<[string, string]> = [
    ['Discover Children’s Story Centre', 'Take a break in our cafe and bookshop'],
    ['De Havilland Aircraft Museum', 'The museum cafe serves hot and cold drinks as well as a selection of sandwiches and hot snacks'],
    ['De Havilland Aircraft Museum', 'Take a break in our newly refurbished Comet Café and explore aviation-inspired gifts in the Aeroshop'],
    ['Horniman', 'Our Cafes and kiosks serve specialty coffee daily, alongside freshly baked pastries'],
    ['Horniman', 'The Gardens Cafe is located next to the Kusuma Nature Play Area at the bottom of the Meadow Field'],
    ['Horniman', 'The Cafe is open from 9am – 5pm daily'],
    ['Chiswick House', 'Don’t forget to visit our Café Colicci, next to the playground, which has a great kids’ menu'],
    ['Harry Potter Studio', 'Visit the Dragon Roasted Café for coffee, pastries or sandwiches'],
    ['William Morris Gallery', 'Relax at Deeney’s Cafe, located on the ground floor with gorgeous sunlit views overlooking Lloyd Park'],
    ['Woodside Animal Farm', 'There is a heated indoor soft play centre and cafe serving fresh sandwiches, toasties and paninis'],
    ['Whitechapel Gallery', 'Visit our wonderful women-led cafe, serving specialty coffee and seasonal lunches'],
    ['Chiltern Open Air Museum', 'Adapted cups and cutlery are available in our Cafe'],
  ];
  it.each(positives)('%s: “%s” is a café fact', (_venue, sentence) => {
    expect(facts(sentence)).toContain('cafe=yes');
  });

  const negatives: Array<[string, string]> = [
    ['someone else’s café', 'The cafe is nearby'],
    ['a café down the road', 'There is a lovely cafe down the road from the gates'],
    ['a sister site', 'Visit our cafe at our sister site in Greenwich'],
    ['closed', 'Please note, The Riverside Café is temporarily closed for business'],
    ['future', 'Our café will open next spring'],
    ['another organisation’s café (Golders Hill)', 'The Forget Me Not Memory Cafe is run by the City of London Corporation'],
    ['a provider of a bike rack (Winter Wonderland)', 'The Serpentine Bar & Kitchen cafe provides a bicycle rack'],
    ['a toilet location only (Burgess Park)', 'Toilets are located at the tennis pavilion/café at Addington Square'],
    ['a question', 'Will the Visitor Centre and Café be open'],
    ['a recommendation', 'Find a recommended café in the town centre'],
  ];
  it.each(negatives)('%s stays unknown', (_why, sentence) => {
    expect(facts(sentence)).not.toContain('cafe=yes');
  });
});

describe('baby changing: hyphenated prose is a fact, a CSS class is not', () => {
  it('reads “baby-changing facilities” (National Maritime Museum)', () => {
    expect(facts('Toilets, baby-changing facilities and an accessible toilet are located near the Romney Road entrance on Level 0')).toContain('babyChanging=yes');
  });
  it('does not read a class name or a selector', () => {
    expect(facts('.baby-changing { display: none }')).not.toContain('babyChanging=yes');
    expect(facts('<li class="baby-changing">Facilities</li>')).not.toContain('babyChanging=yes');
    expect(facts('#baby-changing-room-link')).not.toContain('babyChanging=yes');
  });
  it('treats “you will find” as a description, not a plan (London Eye, RAF Museum)', () => {
    expect(facts('Customers will find male, female toilets downstairs, and accessible toilet, and baby changing facilities at ground level')).toContain('babyChanging=yes');
    expect(facts('All have baby changing facilities and in Hangar 2 you will find a Changing Places Toilet')).toContain('babyChanging=yes');
  });
  it('still refuses a plan', () => {
    expect(facts('Baby changing facilities will be installed next year')).not.toContain('babyChanging=yes');
    expect(facts('New baby changing facilities will open soon')).not.toContain('babyChanging=yes');
  });
});

describe('toilets: the venue’s own, placed', () => {
  it('reads “available on site” (Colne Valley) and “there are … toilets in the park” (Golders Hill, Gunnersbury)', () => {
    expect(facts('Toilets, including disabled and baby changing facilities, are available on site')).toContain('toilets=yes');
    expect(facts('There are three accessible toilets in the park - By the cafe')).toContain('toilets=yes');
    expect(facts('There is an accessible toilet in the museum')).toContain('toilets=yes');
  });
  it('refuses toilets that belong to somebody else', () => {
    expect(facts('The nearest public toilets to Heartwood Forest are at Sandridge Village Hall')).not.toContain('toilets=yes');
    expect(facts('There are toilets at the nearby railway station')).not.toContain('toilets=yes');
  });
  it('still refuses closures and absences', () => {
    expect(facts('Toilets are not available on site')).not.toContain('toilets=yes');
    expect(facts('The toilets are currently closed for refurbishment')).not.toContain('toilets=yes');
  });
});
