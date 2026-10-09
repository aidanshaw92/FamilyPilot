import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const req = createRequire(import.meta.url);
const { factsFor } = req('../../scripts/pilot/live-readiness.cjs');
const { readiness } = req('../../scripts/pilot/readiness.cjs');

/** The live readiness check turns production's claims and the shipped reviewed data into the same facts the readiness rules use. */
const AS_OF = '2026-10-09';
const venue = (claims: object[], id = 'v1') => ({ venueId: id, name: 'V', providerHours: true, claims });
const none = { claims: [] };
const level = (v: ReturnType<typeof venue>, admission = none, activities: object[] = []) => {
  const { facts } = factsFor(v, { admission, activities, asOf: AS_OF });
  return readiness(facts, { view: 'auto', layerA: { hours: true } });
};
const claim = (fieldKey: string, value: unknown, validUntil = '2026-11-30', approvedBy = 'human:owner') => ({ fieldKey, value, validUntil, approvedBy });
const ESSENTIALS = [claim('familyFacilities.toilets', 'yes'), claim('familyFacilities.parking', 'no')];
const free = (venueId = 'v1', checkedAt = '2026-10-08') => ({ claims: [{ venueId, decision: 'publish', pricing: { status: 'free', source: { checkedAt } } }] });
const playground = claim('familyFacilities.playground', 'yes');

describe('live readiness', () => {
  it('a venue with nothing in production is discoverable and lists every missing requirement', () => {
    const r = level(venue([]));
    expect(r.level).toBe('discoverable');
    expect(r.missing).toEqual(['cost', 'gettingThere', 'childActivity', 'familyEssentials']);
  });

  it('is recommendation-ready only when cost, getting there, an activity and the essentials are all present', () => {
    expect(level(venue([...ESSENTIALS, playground]), free()).level).toBe('recommendation-ready');
    expect(level(venue([...ESSENTIALS, playground])).missing).toEqual(['cost']);
    expect(level(venue([claim('familyFacilities.toilets', 'yes'), playground]), free()).missing).toEqual(['gettingThere']);
  });

  it('an expired claim does not count, and neither does a "hold" or "refuse" price', () => {
    expect(level(venue([claim('familyFacilities.toilets', 'yes', '2026-10-01'), claim('familyFacilities.parking', 'no'), playground]), free()).missing).toEqual(['familyEssentials']);
    for (const decision of ['hold', 'refuse']) {
      const adm = { claims: [{ venueId: 'v1', decision, pricing: { status: 'free', source: { checkedAt: '2026-10-08' } } }] };
      expect(level(venue([...ESSENTIALS, playground]), adm).missing).toEqual(['cost']);
    }
  });

  it('a parking "no" is a stated fact about getting there; an unknown is not', () => {
    expect(level(venue([claim('familyFacilities.parking', 'no')])).requirements.gettingThere).toBe(true);
    expect(level(venue([claim('familyFacilities.parking', 'unknown')])).requirements.gettingThere).toBe(false);
  });

  it('a tiered price counts as a variable price; a price older than 400 days does not count', () => {
    const tiered = { claims: [{ venueId: 'v1', decision: 'publish', pricing: { status: 'paid', tiers: [{}], source: { checkedAt: '2026-10-08' } } }] };
    expect(level(venue([...ESSENTIALS, playground]), tiered).level).toBe('recommendation-ready');
    expect(level(venue([...ESSENTIALS, playground]), free('v1', '2025-01-01')).missing).toEqual(['cost']);
  });

  it('a reviewed permanent activity counts as something for children, only inside its 90-day lifetime', () => {
    const act = (retrievedAt: string) => [{ venueId: 'v1', kind: 'provision', label: 'zootown', minMonths: 0, maxMonthsExclusive: 96, evidence: { retrievedAt } }];
    expect(level(venue(ESSENTIALS), free(), act('2026-10-08')).requirements.childActivity).toBe(true);
    expect(level(venue(ESSENTIALS), free(), act('2026-05-01')).requirements.childActivity).toBe(false);
  });

  it('marks which facts were accepted automatically and which a person approved', () => {
    const { why } = factsFor(venue([claim('familyFacilities.toilets', 'yes', '2026-11-30', 'source_evidence_auto_v2'), claim('familyFacilities.parking', 'no')]), { admission: none, activities: [], asOf: AS_OF });
    expect(why.join('|')).toMatch(/toilets=yes \[auto-accepted\]/);
    expect(why.join('|')).toMatch(/parking=no \[human-approved\]/);
  });
});
