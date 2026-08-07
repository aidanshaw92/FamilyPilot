import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyEnrichmentAuth, isAuthConfigured } = require('../../../api/enrichment/lib/auth');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validateVerifiedRequirements, resolveEnrichmentStatus } = require('../../../api/enrichment/lib/validation');

describe('enrichment API auth', () => {
  it('rejects requests without token', () => {
    const original = process.env.ENRICHMENT_ADMIN_TOKEN;
    process.env.ENRICHMENT_ADMIN_TOKEN = 'secret-token';
    const res = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      body: null as unknown,
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
    };
    const ok = verifyEnrichmentAuth({ headers: {} }, res);
    expect(ok).toBe(false);
    expect(res.statusCode).toBe(401);
    process.env.ENRICHMENT_ADMIN_TOKEN = original;
  });

  it('reports auth not configured when token missing', () => {
    const original = process.env.ENRICHMENT_ADMIN_TOKEN;
    delete process.env.ENRICHMENT_ADMIN_TOKEN;
    expect(isAuthConfigured()).toBe(false);
    process.env.ENRICHMENT_ADMIN_TOKEN = original;
  });
});

describe('enrichment API validation mirror', () => {
  it('rejects malformed verified payload server-side', () => {
    expect(() =>
      resolveEnrichmentStatus({ requestedStatus: 'verified' }, null),
    ).toThrow();
  });

  it('validates unknown distinct from unset', () => {
    const result = validateVerifiedRequirements({
      categoryConfirmed: 'unknown',
      ageNotes: 'All ages welcome',
      familyFacilities: { toilets: 'unknown', babyChanging: 'unknown', parking: 'unknown' },
      pushchairSuitability: 'unknown',
      extendedTerrain: 'unknown',
      lastChecked: new Date().toISOString().slice(0, 10),
      enrichmentProvenance: {
        sourceType: 'official_website',
        checkedDate: new Date().toISOString().slice(0, 10),
      },
    });
    expect(result.ok).toBe(true);
  });
});
