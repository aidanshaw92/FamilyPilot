import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/**
 * The deterministic readiness test for the first beta: which review decisions five venues need to be recommendation-ready, and
 * why the other five are not. Pure function of the committed pilot files and the readiness rules; see
 * scripts/pilot/beta-five-readiness.cjs. If this fails, either the evidence files or the rules changed and the beta scope must be
 * re-confirmed with the owner, not the expectation silently edited.
 */
const req = createRequire(import.meta.url);
const { betaFiveReadiness } = req('../../scripts/pilot/beta-five-readiness.cjs') as {
  betaFiveReadiness: () => {
    decisions: string[]; wave1: string[]; named: string[]; notLoadBearing: string[];
    venues: { name: string; ready: boolean; level: string; required: string[]; missing: string[] }[];
  };
};

const result = betaFiveReadiness();
const venue = (name: string) => result.venues.find((v) => v.name === name)!;

describe('beta five readiness', () => {
  it('is deterministic', () => {
    expect(betaFiveReadiness()).toEqual(result);
  });

  it('needs exactly 21 decisions: 9 wave-1 safety and 12 named', () => {
    expect(result.decisions).toHaveLength(21);
    expect(result.wave1).toHaveLength(9);
    expect(result.named).toHaveLength(12);
  });

  it('makes exactly these five venues recommendation-ready', () => {
    expect(result.venues.filter((v) => v.ready).map((v) => v.name)).toEqual([
      "Discover Children's Story Centre",
      'Horniman Museum and Gardens',
      'London Zoo',
      'Royal Air Force Museum London',
      'Science Museum',
    ]);
  });

  it('names the load-bearing decisions for each ready venue', () => {
    const short = (name: string) => venue(name).required.map((id) => id.split(':')[1]).sort();
    expect(short("Discover Children's Story Centre")).toEqual(['pricing.paid', 'toilets.toilets', 'transport.parking']);
    expect(short('Horniman Museum and Gardens')).toEqual(['transport.parking']);
    expect(short('London Zoo')).toEqual(['activities.zootown', 'pricing.variable', 'toilets.toilets', 'transport.parking']);
    expect(short('Royal Air Force Museum London')).toEqual([]);
    expect(short('Science Museum')).toEqual(['activities.the-garden', 'pricing.free', 'toilets.toilets', 'transport.parking']);
  });

  it('every named decision is load-bearing; the wave-1 safety decisions guard correctness, not readiness', () => {
    const needed = new Set(result.venues.flatMap((v) => v.required));
    expect(result.named.every((id) => needed.has(id))).toBe(true);
    expect(result.notLoadBearing.sort()).toEqual(result.wave1.slice().sort());
  });

  it('states why each of the other five is not ready', () => {
    const missing = (name: string) => venue(name).missing;
    expect(missing('Babylon Park London')).toEqual(['cost', 'familyEssentials']);
    expect(missing('Battersea Park')).toEqual(['opening', 'cost', 'gettingThere', 'familyEssentials']);
    expect(missing('Gunnersbury Park')).toEqual(['childActivity']);
    expect(missing('Mudchute Park and Farm')).toEqual(['gettingThere', 'childActivity']);
    expect(missing('Natural History Museum')).toEqual(['cost', 'gettingThere', 'childActivity', 'familyEssentials']);
    for (const name of ['Babylon Park London', 'Battersea Park', 'Gunnersbury Park', 'Mudchute Park and Farm', 'Natural History Museum']) {
      expect(venue(name).ready).toBe(false);
    }
  });
});
