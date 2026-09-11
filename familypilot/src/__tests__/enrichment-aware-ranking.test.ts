import { describe, expect, it } from 'vitest';

const { reorderByEnrichment } = require('../../../server/places/lib/places-quality');

function place(id: string, enrichmentStatus?: string) {
  return { familypilotId: id, name: id, enrichmentStatus };
}

describe('reorderByEnrichment', () => {
  it('surfaces verified venues ahead of enriched and provider-only ones', () => {
    const input = [
      place('provider-1', 'provider_only'),
      place('verified-1', 'verified'),
      place('provider-2', 'provider_only'),
      place('enriched-1', 'enriched'),
    ];

    const result = reorderByEnrichment(input).map((p: { familypilotId: string }) => p.familypilotId);

    expect(result).toEqual(['verified-1', 'enriched-1', 'provider-1', 'provider-2']);
  });

  it('preserves the existing relative order within each trust tier (stable sort)', () => {
    const input = [
      place('provider-a', 'provider_only'),
      place('provider-b', 'provider_only'),
      place('verified-a', 'verified'),
      place('verified-b', 'verified'),
    ];

    const result = reorderByEnrichment(input).map((p: { familypilotId: string }) => p.familypilotId);

    // Both verified places move ahead, but a-before-b within each tier is unchanged -
    // this is a trust-tier nudge, not a re-ranking of relevance/distance within a tier.
    expect(result).toEqual(['verified-a', 'verified-b', 'provider-a', 'provider-b']);
  });

  it('treats missing/unrecognised enrichmentStatus the same as provider_only', () => {
    const input = [place('no-status'), place('verified-1', 'verified'), place('unknown-status', 'ai_draft')];

    const result = reorderByEnrichment(input).map((p: { familypilotId: string }) => p.familypilotId);

    expect(result[0]).toBe('verified-1');
    expect(result).toContain('no-status');
    expect(result).toContain('unknown-status');
  });

  it('is a no-op for an already-homogeneous list', () => {
    const input = [place('a', 'provider_only'), place('b', 'provider_only')];
    expect(reorderByEnrichment(input).map((p: { familypilotId: string }) => p.familypilotId)).toEqual([
      'a',
      'b',
    ]);
  });
});
