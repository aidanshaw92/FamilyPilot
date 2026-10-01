import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  extractEvidenceFromText,
  isNonVenueWheelchairSubject,
} = require('../../../server/enrichment/_lib/evidence-extractor.js');

const META = { url: 'https://example.org/visit', sourceType: 'visitor_info' };

/** The venue-level verdict, or null when the sentence establishes nothing. */
const wheelchair = (text: string): string | null => {
  const facts = (extractEvidenceFromText(text, META) ?? []) as Array<{ field: string; value: string }>;
  const hit = facts.find((f) => f.field === 'wheelchairAccessible');
  return hit ? hit.value : null;
};

/**
 * `accessibility.wheelchairAccessible` is a claim about THE VENUE: a wheelchair user can visit it.
 * The field had no guard at all, so any sentence containing "wheelchair accessible" published `yes`.
 *
 * Every string below is verbatim from `venue_source_evidence` on 2026-10-01. All 16 served claims in
 * the field were replayed through the real classifier; these are the 5 it got wrong and the 11 it got
 * right, so the file is the whole served population rather than a sample.
 */
describe('a facility or a bus route does not speak for the venue', () => {
  it('suppresses all five production false positives', () => {
    // The Wallace Collection -- about buses.
    expect(wheelchair('All bus routes are wheelchair accessible.')).toBeNull();
    // Rickmansworth Aquadrome -- one fishing platform on a lake.
    expect(wheelchair('AllTrails link for Batchworth Lake Fishing Swim There is a wheelchair accessible '
      + 'fishing swim located on Batchworth Lake.')).toBeNull();
    // National Maritime Museum -- the cafés.
    expect(wheelchair('All our cafés are wheelchair accessible and welcome Guide Dogs, Hearing Dogs '
      + 'and Assistance Dogs.')).toBeNull();
    // Victoria Park -- toilets and cafés.
    expect(wheelchair("toilets have an accessible cubicle and both our cafés are accessible for "
      + 'wheelchair users.')).toBeNull();
    // Horniman -- the toilets, reached through a pronoun 52 characters later.
    expect(wheelchair('online Toilets Toilets are located off Gallery Square downstairs, and they are '
      + 'wheelchair accessible.')).toBeNull();
  });

  it('covers both word orders, because the corpus uses both', () => {
    // subject first
    expect(wheelchair('The station is wheelchair accessible.')).toBeNull();
    // claim first -- Sydenham Hill Wood's real wording
    expect(wheelchair('The nearest wheelchair accessible station is Forest Hill')).toBeNull();
  });

  it('reaches a pronoun continuation, not just an adjacent subject', () => {
    expect(isNonVenueWheelchairSubject('Toilets are located off Gallery Square downstairs, and they '
      + 'are wheelchair accessible.')).toBe(true);
    // The same sentence with the facility removed establishes the venue again.
    expect(isNonVenueWheelchairSubject('The museum is wheelchair accessible.')).toBe(false);
  });
});

/**
 * The eleven served claims that are correct, verbatim. These are the reason the rule is a narrow
 * suppressor rather than anything broader.
 */
describe('genuine venue-level statements keep their fact', () => {
  const KEEP: ReadonlyArray<readonly [string, string]> = [
    ['Flip Out Brent Cross', 'Yes we are wheelchair accessible as guests can access all levels including toilets.'],
    ['Flip Out Watford', 'Yes — Flip Out Watford is wheelchair accessible and buggy-friendly.'],
    ['Frameless', 'The whole building is wheelchair accessible, including our toilets and Café Bar.'],
    ['Headstone Manor', 'The Great Barn, Small Barn and Visitor Centre/The Moat Cafe are all wheelchair accessible.'],
    ['Kentish Town City Farm', 'KTCF is wheelchair accessible and seating areas offer visitors a chance to rest and enjoy the views.'],
    ['SEA LIFE London Aquarium', 'ble to all of our guests, which includes making sure that our aquarium is fully wheelchair accessible throughout.'],
    ['V&A East Storehouse', 'to leave buggies here before heading to the upper levels Access Our entrance is step-free and wheelchair accessible.'],
    ['Victoria and Albert Museum', 'The Cromwell Road and Exhibition Road entrances are step-free and wheelchair accessible.'],
    ['Woodside Animal Farm', 'Wheelchair Users The whole park is accessible for wheelchair users with the exception of the upstairs play area.'],
    ['Young V&A', 'Our entrance is step-free and wheelchair accessible.'],
  ];

  it.each(KEEP)('keeps %s', (_venue, text) => {
    expect(wheelchair(text)).toBe('yes');
  });

  it('keeps a legitimate venue-level no', () => {
    // Hyde Park Corner. Negatives are decided before the `yes` loop, so the guard never sees it.
    expect(wheelchair('Venue notes Hyde Park Corner is not wheelchair accessible.')).toBe('no');
  });

  it('keeps a facility named AFTER the venue-level claim', () => {
    // Frameless again, isolated: the subject-first shape requires the facility to come first, and
    // "including our toilets and Café Bar" comes after.
    expect(isNonVenueWheelchairSubject('The whole building is wheelchair accessible, including our '
      + 'toilets and Café Bar.')).toBe(false);
  });
});

/**
 * What is left OUT of the list matters more than what is in, and the production corpus decided both:
 * 97 wheelchair-accessible spans across 27 venues, of which `entrance` alone is 25.
 */
describe('the nouns deliberately left out of the list', () => {
  it('treats an entrance as the venue, because that is how a venue says you can get in', () => {
    // 25 of 97 spans, the most common noun of all, and three venues serve a correct claim from it.
    expect(wheelchair('Our entrance is step-free and wheelchair accessible.')).toBe('yes');
    expect(wheelchair('The Cromwell Road and Exhibition Road entrances are step-free and wheelchair accessible.')).toBe('yes');
  });

  it('matches cafés only in the plural, because a single café can BE the venue', () => {
    // The catalogue holds 14 restaurants and 3 cafés. For those venues, the café IS the place the
    // parent is reading about, so the singular must still establish the fact.
    expect(wheelchair('Our café is wheelchair accessible.')).toBe('yes');
    expect(wheelchair('Our cafe is wheelchair accessible.')).toBe('yes');
    // ... while the two real museum/park sentences are plural, and must not.
    expect(wheelchair('All our cafés are wheelchair accessible.')).toBeNull();
  });

  it('leaves out restaurant entirely, for the same reason', () => {
    expect(wheelchair('Our restaurant is wheelchair accessible.')).toBe('yes');
  });

  it('spares a venue that enumerates its own buildings and ends on a café', () => {
    // Headstone Manor, verbatim. The plural-only café pattern is what spares this; there is no
    // "sounds venue-level" escape hatch, because the one earlier draft that had one allowed
    // `gallery` and thereby let the Horniman's "located off Gallery Square" toilets through.
    expect(isNonVenueWheelchairSubject('The Great Barn, Small Barn and Visitor Centre/The Moat Cafe '
      + 'are all wheelchair accessible.')).toBe(false);
    expect(wheelchair('Toilets are located off Gallery Square downstairs, and they are wheelchair accessible.')).toBeNull();
  });

  it('leaves out lift, which the corpus never makes the subject of the claim', () => {
    // Both corpus lift sentences put the claim on something else -- "the rooms", "all [3 floors]" --
    // and neither backs a served claim (Hatfield Park has no wheelchairAccessible claim at all), so
    // there is no evidence for a rule about lifts in either direction. They keep their fact here
    // because no listed noun is their subject, not because `lift` was weighed and excluded.
    expect(wheelchair('There is a lift within the House and the rooms are wheelchair accessible')).toBe('yes');
    expect(wheelchair('Wheelchair Users The aquarium is based over 3 floors and all are wheelchair '
      + 'accessible via separate standard lifts')).toBe('yes');
  });
});

/**
 * One production sentence per entry in the noun list, so that deleting any single entry fails a test
 * that came from the corpus rather than from the regex.
 */
describe('every noun in the list is there because a real page used it', () => {
  it('toilets -- the Horniman', () => {
    expect(wheelchair('online Toilets Toilets are located off Gallery Square downstairs, and they '
      + 'are wheelchair accessible.')).toBeNull();
  });

  it('bathrooms -- SEA LIFE London Aquarium', () => {
    expect(wheelchair('There are three wheelchair accessible bathrooms in the aquarium, at the '
      + 'beginning after the Shark Walk on ground level.')).toBeNull();
  });

  it('cafés -- the National Maritime Museum', () => {
    expect(wheelchair('All our cafés are wheelchair accessible and welcome Guide Dogs, Hearing Dogs '
      + 'and Assistance Dogs.')).toBeNull();
  });

  it('fishing swim -- Rickmansworth Aquadrome', () => {
    expect(wheelchair('AllTrails link for Batchworth Lake Fishing Swim There is a wheelchair '
      + 'accessible fishing swim located on Batchworth Lake.')).toBeNull();
  });

  it('bus -- The Wallace Collection', () => {
    expect(wheelchair('All bus routes are wheelchair accessible.')).toBeNull();
  });

  it('station -- Sydenham Hill Wood', () => {
    expect(wheelchair('The nearest wheelchair accessible station is Forest Hill.')).toBeNull();
    // The same page's own entrances still establish the fact.
    expect(wheelchair('The two entrances into Dulwich Wood (on Low Cross Wood and Grange Lane) are '
      + 'wheelchair accessible and free parking is available at the latter.')).toBe('yes');
  });
});
