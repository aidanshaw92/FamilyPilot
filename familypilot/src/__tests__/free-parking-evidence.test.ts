import { describe, expect, it } from 'vitest';

import { extractEvidenceFromText, mergeEvidenceBundles } from '../../../server/enrichment/_lib/evidence-extractor.js';

describe('freeParking evidence extraction', () => {
  it('extracts free parking separately from general parking availability', () => {
    const text =
      'Visitor information. Free parking is available in the main car park. Toilets are open daily.';
    const facts = extractEvidenceFromText(text, {
      url: 'https://venue.example/visit',
      sourceType: 'official_website',
      retrievedAt: '2026-08-10T12:00:00.000Z',
    });

    const freeParking = facts.find((f) => f.field === 'freeParking');
    const parking = facts.find((f) => f.field === 'parking');
    expect(freeParking?.value).toBe('yes');
    expect(parking?.value).toBe('yes');
  });

  it('marks conflicting free parking statements as conflict', () => {
    const merged = mergeEvidenceBundles([
      {
        facts: extractEvidenceFromText('Free parking for all visitors.', {
          url: 'https://a.example',
          sourceType: 'official_website',
          retrievedAt: '2026-08-10T12:00:00.000Z',
        }),
      },
      {
        facts: extractEvidenceFromText('Paid parking charges apply on site.', {
          url: 'https://b.example',
          sourceType: 'official_website',
          retrievedAt: '2026-08-10T12:00:00.000Z',
        }),
      },
    ]);

    const freeParking = merged.find((f) => f.field === 'freeParking');
    expect(freeParking?.evidenceStatus).toBe('conflict');
    expect(freeParking?.conflicts?.length).toBeGreaterThan(1);
  });
});

/**
 * A parent-facing "Free parking" badge is a promise to a family arriving by car on an ordinary day.
 *
 * Every sentence in this block was live in FamilyPilot's `venue_source_evidence` on 2026-09-30 behind
 * an active `familyFacilities.freeParking` claim. The three conditional ones were all published as
 * `yes`. There is no model for "free, but only if…", so a conditional entitlement fails closed to
 * unknown rather than being flattened into yes or asserted as no.
 */
describe('freeParking: conditional entitlements fail closed (production wording)', () => {
  const extract = (text: string) =>
    extractEvidenceFromText(text, {
      url: 'https://venue.example/visit',
      sourceType: 'official_website',
      retrievedAt: '2026-09-30T18:00:00.000Z',
    }).find((f: { field: string }) => f.field === 'freeParking');

  it('does not publish yes for a short-break package perk (Thorpe Park)', () => {
    // Thorpe Park's own directions page prices day parking at £12, so this was actively misleading.
    expect(
      extract(
        'Every Thorpe Park short break includes: An overnight stay with 2 day theme park entry, ' +
          'including Fright Nights Buffet breakfast Free parking Wi-Fi.',
      ),
    ).toBeUndefined();
  });

  it('does not publish yes for a time-limited weekend allowance (Flip Out Canary Wharf)', () => {
    expect(
      extract('You can also enjoy 3 Hours FREE parking on Weekends & Bank Holidays!'),
    ).toBeUndefined();
  });

  // Flip Out's live sentence carries BOTH a duration limit and a named-days limit, so either clause
  // alone suppresses it and neither is independently proven by the whole sentence. These two cases
  // are its own halves, so each clause is pinned without inventing wording the product has not seen.
  it('suppresses a duration allowance even with no named days (Flip Out, first half)', () => {
    expect(extract('You can also enjoy 3 Hours FREE parking.')).toBeUndefined();
  });

  it('suppresses a named-days allowance even with no duration (Flip Out, second half)', () => {
    expect(extract('You can also enjoy FREE parking on Weekends & Bank Holidays!')).toBeUndefined();
  });

  it('does not publish yes for a Blue Badge entitlement beside general charges (Stanborough Park)', () => {
    expect(
      extract(
        'Charges start at £1.50, with reduced rates for residents and free parking for Blue Badge ' +
          'holders registered with Stanborough Park.',
      ),
    ).toBeUndefined();
  });

  it('resolves the Blue Badge sentence to no, never yes (Whitechapel Gallery)', () => {
    // This exact sentence sits behind Whitechapel Gallery's active claim, which reads `no`. It gets
    // there from "pay and display" in the same sentence, which is a negative signal and is evaluated
    // before any positive one -- so the conditional guard never has to fire here. Asserted as "not
    // yes" rather than "no fact", because `no` is the correct reading: the venue charges.
    const fact = extract(
      'Free parking for Blue Badge holders is available at the top of Osborn Street in the pay ' +
        'and display booths for an unlimited period.',
    );
    expect(fact?.value).toBe('no');
  });

  it('yields no fact for a Blue Badge entitlement with no charging wording beside it', () => {
    // The guard on its own, with the "pay and display" negative removed: unknown, not yes.
    expect(
      extract('Free parking for Blue Badge holders is available at the top of Osborn Street.'),
    ).toBeUndefined();
  });
});

describe('freeParking: unconditional statements still publish yes (production wording)', () => {
  const extract = (text: string) =>
    extractEvidenceFromText(text, {
      url: 'https://venue.example/visit',
      sourceType: 'official_website',
      retrievedAt: '2026-09-30T18:00:00.000Z',
    }).find((f: { field: string }) => f.field === 'freeParking');

  it('keeps yes for "All car parking is free" (Woodside Animal Farm)', () => {
    expect(extract('Parking All car parking is free.')?.value).toBe('yes');
  });

  it('keeps yes even when accessible bays are mentioned in the next sentence (Woodside)', () => {
    // Near miss worth pinning: the Blue Badge guard is sentence-scoped, and "There are designated
    // disabled parking bays" sits in its own sentence. If the two were ever joined, this legitimate
    // claim would silently disappear.
    expect(
      extract('Parking All car parking is free. There are designated disabled parking bays.')?.value,
    ).toBe('yes');
  });

  it('keeps yes for "has free parking to the rear of the building" (Headstone Manor)', () => {
    expect(
      extract(
        'Headstone Manor and Museum has free parking to the rear of the building as well as a ' +
          'number of disabled spaces.',
      )?.value,
    ).toBe('yes');
  });

  it('keeps yes for "ample free parking" (De Havilland Aircraft Museum)', () => {
    expect(extract('We have ample free parking to add to the Museum flexibility.')?.value).toBe('yes');
  });
});
