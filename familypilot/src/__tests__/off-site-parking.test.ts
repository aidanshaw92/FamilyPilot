import { describe, expect, it } from 'vitest';

const {
  extractEvidenceFromText,
  hasOffSiteParking,
} = require('../../../server/enrichment/_lib/evidence-extractor.js');

/**
 * `familyFacilities.parking = yes` means the venue has parking ON SITE.
 *
 * Category A, and settled by the product's own words rather than by inference:
 * `match-explanations.formatTriStateReason` renders the value to a parent as "Parking confirmed **on
 * site**". The nuance has a separate home as well -- `parkingInfo` is free text whose own examples are
 * "Small car park behind the building", "Street parking only" and "Free parking on site" -- so the
 * boolean carries the strict claim and the prose carries the rest. The same shape as `soft_play`
 * beside `playground`, and `mixed` beside `outdoor`: where the competing concept has its own
 * representation, the boolean means the strict thing.
 *
 * Four served claims said "confirmed on site" about somebody else's car park (2026-10-01). The defect
 * was asymmetric and that is the telling part: the extractor already read a NEGATIVE on-site statement
 * correctly, but accepted a positive off-site one.
 *
 * Every string marked "production" is verbatim from a live `venue_claims.evidence_excerpt`.
 */

const meta = {
  url: 'https://venue.example/visit',
  sourceType: 'official_website' as const,
  retrievedAt: '2026-10-01T00:00:00.000Z',
};

function parkingFacts(text: string): string[] {
  const out = extractEvidenceFromText(text, meta);
  const facts = Array.isArray(out) ? out : (out?.facts ?? []);
  return facts
    .filter((f: { field: string }) => f.field === 'parking' || f.field === 'freeParking')
    .map((f: { field: string; value: string }) => `${f.field}=${f.value}`)
    .sort();
}

describe('somebody else\'s car park is not this venue\'s parking', () => {
  it('rejects a shopping centre\'s car parks (Flip Out Watford, production)', () => {
    expect(
      parkingFacts(
        'Parking is available at the Harlequin Shopping Centre car parks — the most convenient are Kings Car Park and Queens Car Park.',
      ),
    ).toEqual([]);
    expect(parkingFacts('Plenty of parking is available at the Harlequin Shopping Centre car parks.')).toEqual([]);
  });

  it('rejects another venue\'s free parking a minute away (Nando\'s, production)', () => {
    // This one produced BOTH a false parking=yes and a false freeParking=yes.
    expect(
      parkingFacts(
        'Nearby If you’re driving, there’s free parking at Finchley Lido Leisure Centre and we’re a one-minute walk away.',
      ),
    ).toEqual([]);
  });

  it('rejects a public multi-storey (Whitechapel Gallery, production)', () => {
    expect(
      parkingFacts(
        'Buckle Street Multistorey Car Park, Buckle Street, London, E1 8EH Free parking for Blue Badge holders is available at the top of Osborn Street',
      ),
    ).toEqual([]);
  });

  it('rejects the other adjacency wordings the corpus uses', () => {
    expect(parkingFacts('Parking is available in the NCP car park across the road.')).toEqual([]);
    expect(parkingFacts('Free parking is available in the retail park opposite.')).toEqual([]);
    expect(parkingFacts('Parking is available in the local area, a short walk from the entrance.')).toEqual([]);
  });
});

describe('the venue\'s own parking is still published', () => {
  it('keeps an explicit on-site statement', () => {
    expect(parkingFacts('There is a large free car park on site for visitors.')).toContain('parking=yes');
  });

  it('keeps a venue\'s own car park', () => {
    expect(parkingFacts('Free parking is available in our main car park.')).toContain('parking=yes');
  });

  it('keeps paid on-site parking (Thorpe Park\'s shape)', () => {
    // The owner's own correction from #115: a £12 car-parking ticket proves parking EXISTS, so
    // parking=yes is right there even though freeParking is not.
    const facts = parkingFacts(
      'Car parking tickets cost £12 and priority parking is £20; parking is available on site.',
    );
    expect(facts).toContain('parking=yes');
    expect(facts).not.toContain('freeParking=yes');
  });

  it('keeps Woodside\'s unconditional free parking (production)', () => {
    // Note what this does NOT assert. "All car parking is free" yields freeParking=yes and no
    // `parking` fact, because that wording is not in the `parking` field's explicit-availability
    // vocabulary. Verified to be pre-existing behaviour, identical with and without the off-site
    // guard, so it is recorded here rather than silently changed: whether freeParking=yes should
    // imply parking=yes is a separate question.
    expect(parkingFacts('All car parking is free. There are designated disabled parking bays.')).toEqual([
      'freeParking=yes',
    ]);
  });
});

describe('a negative on-site statement is decided before the guard and unaffected', () => {
  it('still reads "we do not have on-site parking" as no (Flip Out Brent Cross, production)', () => {
    // The sentence also mentions a retail park opposite, so the guard would suppress a POSITIVE here.
    // The negative must win first, or the fix would turn a correct "no" into no fact at all.
    expect(
      parkingFacts(
        'We do not have on-site parking, however, there is a small retail park opposite - charges apply.',
      ),
    ).toContain('parking=no');
  });
});

describe('hasOffSiteParking is the seam', () => {
  it('fires on adjacency and on named third-party facilities', () => {
    expect(hasOffSiteParking('parking nearby')).toBe(true);
    expect(hasOffSiteParking('a one-minute walk away')).toBe(true);
    expect(hasOffSiteParking('in the Harlequin Shopping Centre')).toBe(true);
    expect(hasOffSiteParking('the NCP car park')).toBe(true);
    expect(hasOffSiteParking('Buckle Street Multistorey Car Park')).toBe(true);
  });

  it('does not fire on a venue\'s own parking, however it is phrased', () => {
    // Deliberately NOT a general "at <place name>" rule: a venue's own named building reads the same
    // as a neighbour's, and no reliable signal separates them.
    expect(hasOffSiteParking('free parking at the farm')).toBe(false);
    expect(hasOffSiteParking('parking at the visitor centre')).toBe(false);
    expect(hasOffSiteParking('a large free car park on site')).toBe(false);
    expect(hasOffSiteParking('our main car park')).toBe(false);
  });
});
