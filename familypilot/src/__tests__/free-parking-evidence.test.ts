import { describe, expect, it } from 'vitest';

import { extractEvidenceFromText, mergeEvidenceBundles } from '../../../api/enrichment/_lib/evidence-extractor.js';

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
