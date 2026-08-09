import { describe, expect, it } from 'vitest';

import { draftJsonToReviewForm, normalizeDraftForReview } from '@/src/utils/ai-draft-review';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';

/** Legacy Warner / Headstone-style draft before environment & energyLevel existed. */
const LEGACY_DRAFT = {
  recommendedAge: { min: null, max: null, notes: null, confidence: 'unknown' },
  familyFacilities: {
    toilets: {
      value: 'yes',
      confidence: 'high',
      reason: 'Official source',
      sourceUrl: 'https://example.org/visit',
      evidence: 'Accessible toilets are available throughout the tour.',
    },
    babyChanging: { value: 'unknown', confidence: 'unknown', reason: null },
    parking: { value: 'yes', confidence: 'high', evidence: 'Free parking on site.' },
    cafe: { value: 'unknown', confidence: 'unknown', reason: null },
  },
  pushchairSuitability: { value: 'good', confidence: 'medium', reason: null },
  terrain: { value: 'mostly_flat', confidence: 'medium', reason: null },
  accessibility: {
    wheelchairAccessible: {
      value: 'yes',
      confidence: 'high',
      evidence: 'Wheelchair accessible routes.',
    },
  },
  sendInfo: {},
  whyFamiliesLike: ['Family-friendly tour'],
  goodToKnow: [],
  suggestedVisitDuration: 180,
  rainyDaySuitability: 'unknown',
  overallDraftConfidence: 'medium',
};

describe('draft review safety — legacy and partial evidence', () => {
  it('normalizes legacy draft missing environment and energyLevel', () => {
    const draft = normalizeDraftForReview(LEGACY_DRAFT);
    expect(draft.environment.value).toBe('unknown');
    expect(draft.environment.confidence).toBe('unknown');
    expect(draft.energyLevel.value).toBe('unknown');
    expect(draft.familyFacilities.toilets.value).toBe('yes');
  });

  it('prefills review form from legacy draft without throwing', () => {
    const form = draftJsonToReviewForm(LEGACY_DRAFT);
    expect(form.environment).toBe('unknown');
    expect(form.energyLevel).toBe('unknown');
    expect(form.familyFacilities?.toilets).toBe('yes');
    expect(form.accessibility?.wheelchairAccessible).toBe('yes');
    expect(form.visitDurationMinutes).toBe(180);
  });

  it('handles field with value but no evidence object properties', () => {
    const draft = normalizeDraftForReview({
      ...LEGACY_DRAFT,
      familyFacilities: {
        ...LEGACY_DRAFT.familyFacilities,
        parking: { value: 'yes', confidence: 'high' },
      },
    });
    expect(draft.familyFacilities.parking.value).toBe('yes');
    expect(draft.familyFacilities.parking.evidence).toBeNull();
  });

  it('handles completely empty draft shell', () => {
    const draft = normalizeDraftForReview({});
    expect(draft.environment.value).toBe('unknown');
    expect(draft.energyLevel.value).toBe('unknown');
    expect(draft.familyFacilities.toilets.value).toBe('unknown');
  });

  it('legacy enriched metadata without environment or energyLevel is match-safe', () => {
    const facts = extractMatchableFacts(
      'fp-google-headstone',
      'Headstone Manor and Museum',
      'museum',
      20,
      'enriched',
      {
        familypilotPlaceId: 'fp-google-headstone',
        familyFacilities: { toilets: 'yes', parking: 'yes' },
        pushchairSuitability: 'good',
        updatedAt: '2026-08-01T00:00:00.000Z',
        provenance: {},
      },
    );
    expect(facts.environment).toBe('unknown');
    expect(facts.energyLevel).toBe('unknown');
    expect(facts.toilets).toBe('yes');
  });

  it('provider-only venue yields unknown focused fields', () => {
    const facts = extractMatchableFacts(
      'fp-google-provider',
      'Provider Only Park',
      'park',
      15,
      'provider_only',
      null,
    );
    expect(facts.environment).toBe('unknown');
    expect(facts.energyLevel).toBe('unknown');
    expect(facts.toilets).toBe('unknown');
  });

  it('preserves full field evidence when present after normalization', () => {
    const draft = normalizeDraftForReview(LEGACY_DRAFT);
    expect(draft.familyFacilities.toilets.evidence).toContain('Accessible toilets');
    expect(draft.accessibility.wheelchairAccessible?.evidence).toContain('Wheelchair');
  });

  it('does not render field meta keys as accessibility review rows (Golders Hill legacy shape)', () => {
    const draft = normalizeDraftForReview({
      ...LEGACY_DRAFT,
      accessibility: {
        value: 'yes',
        confidence: 'high',
        reason: 'Official source',
        evidence: 'Step-free routes throughout the zoo.',
        sourceUrl: 'https://example.org/visit',
      },
    });
    expect(draft.accessibility.value).toBeUndefined();
    expect(draft.accessibility.unspecified?.value).toBe('yes');
    expect(draft.accessibility.unspecified?.evidence).toContain('Step-free routes');
    expect(draft.accessibility.reason).toBeUndefined();
    expect(draft.accessibility.evidence).toBeUndefined();
  });
});
