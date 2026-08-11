import { describe, expect, it, vi } from 'vitest';

describe('enrichment beta area defaults', () => {
  it('defaults to Mill Hill with a 10 mile radius', async () => {
    delete process.env.ENRICHMENT_BETA_LAT;
    delete process.env.ENRICHMENT_BETA_LNG;
    delete process.env.ENRICHMENT_BETA_RADIUS_KM;
    delete process.env.ENRICHMENT_BETA_LABEL;
    vi.resetModules();

    const { getDefaultBetaArea } = await import('../../../api/enrichment/_lib/beta-area.js');
    const area = getDefaultBetaArea();
    expect(area.label).toBe('Mill Hill');
    expect(area.lat).toBeCloseTo(51.613, 2);
    expect(area.lng).toBeCloseTo(-0.249, 2);
    expect(area.radiusKm).toBeCloseTo(16.1, 1);
  });

  it('allows env overrides for temporary pilot areas', async () => {
    process.env.ENRICHMENT_BETA_LAT = '51.5';
    process.env.ENRICHMENT_BETA_LNG = '-0.1';
    process.env.ENRICHMENT_BETA_RADIUS_KM = '20';
    process.env.ENRICHMENT_BETA_LABEL = 'Custom area';
    vi.resetModules();

    const { getDefaultBetaArea, resolveBetaParams } = await import(
      '../../../api/enrichment/_lib/beta-area.js'
    );
    const area = getDefaultBetaArea();
    expect(area.label).toBe('Custom area');
    expect(area.lat).toBe(51.5);
    expect(area.radiusKm).toBe(20);
    expect(resolveBetaParams({})).toEqual({
      betaLat: 51.5,
      betaLng: -0.1,
      betaRadiusKm: 20,
    });

    delete process.env.ENRICHMENT_BETA_LAT;
    delete process.env.ENRICHMENT_BETA_LNG;
    delete process.env.ENRICHMENT_BETA_RADIUS_KM;
    delete process.env.ENRICHMENT_BETA_LABEL;
  });
});
