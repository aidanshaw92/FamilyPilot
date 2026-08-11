import { describe, expect, it } from 'vitest';

import {
  conflictForDraftLabel,
  formatClaimFieldKey,
  listEvidenceConflicts,
} from '@/src/utils/claim-review';
import type { EvidenceBundle } from '@/src/types/ai-enrichment';

describe('claim review utils', () => {
  it('lists evidence conflicts from bundle facts', () => {
    const bundle: EvidenceBundle = {
      venueId: 'fp-google-test',
      sourceStatus: 'official_website',
      sources: [],
      facts: [
        {
          field: 'parking',
          value: 'unknown',
          confidence: 'unknown',
          evidenceStatus: 'conflict',
          conflicts: [
            {
              field: 'parking',
              value: 'yes',
              confidence: 'high',
              evidenceText: 'Free parking on site',
              sourceUrl: 'https://a.example/parking',
            },
            {
              field: 'parking',
              value: 'no',
              confidence: 'high',
              evidenceText: 'No parking available',
              sourceUrl: 'https://b.example/visit',
            },
          ],
        },
      ],
      pagesChecked: 2,
      cacheHits: 0,
    };

    const conflicts = listEvidenceConflicts(bundle);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].label).toBe('Parking');
    expect(conflicts[0].claimFieldKey).toBe('familyFacilities.parking');
    expect(conflicts[0].conflicts).toHaveLength(2);
  });

  it('maps draft labels to conflict summaries', () => {
    const conflicts = listEvidenceConflicts({
      venueId: 'x',
      sourceStatus: 'official_website',
      sources: [],
      facts: [
        {
          field: 'parking',
          value: 'unknown',
          confidence: 'unknown',
          evidenceStatus: 'conflict',
          conflicts: [{ field: 'parking', value: 'yes', confidence: 'high' }],
        },
      ],
      pagesChecked: 1,
      cacheHits: 0,
    });

    expect(conflictForDraftLabel('Parking', conflicts)?.field).toBe('parking');
    expect(conflictForDraftLabel('Toilets', conflicts)).toBeUndefined();
  });

  it('formats claim field keys for display', () => {
    expect(formatClaimFieldKey('familyFacilities.freeParking')).toBe('Free parking');
    expect(formatClaimFieldKey('pushchairSuitability')).toBe('Pushchair suitability');
  });
});

describe('claim-review server helpers', () => {
  it('detects conflicts from evidence bundle', async () => {
    const { listEvidenceConflicts, hasUnresolvedEvidenceConflicts } = await import(
      '../../../api/enrichment/_lib/claim-review.js'
    );

    const bundle = {
      facts: [
        {
          field: 'freeParking',
          evidenceStatus: 'conflict',
          conflicts: [{ value: 'yes' }, { value: 'no' }],
        },
      ],
    };

    expect(hasUnresolvedEvidenceConflicts(bundle)).toBe(true);
    expect(listEvidenceConflicts(bundle)[0].claimFieldKey).toBe('familyFacilities.freeParking');
  });
});
