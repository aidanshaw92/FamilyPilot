import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  extractEvidenceFromText,
  isNonVehicleParkingOnly,
  isCycleTravelContext,
  FIELD_PATTERNS,
} = require('../../../server/enrichment/_lib/evidence-extractor.js');

const META = { url: 'https://example.org/visit', sourceType: 'family_page', pageTitle: 'Visit' };

const parkingFacts = (text: string): string[] => {
  const facts = (extractEvidenceFromText(text, META) ?? []) as Array<{ field: string; value: string }>;
  return [...new Set(facts.filter((f) => f.field === 'parking' || f.field === 'freeParking').map((f) => `${f.field}=${f.value}`))].sort();
};

const parkingYes = (FIELD_PATTERNS as Array<{ field: string; yes: RegExp[] }>).find((f) => f.field === 'parking')!.yes;

/**
 * `familyFacilities.parking = yes` renders to a parent as "Parking confirmed on site", so it is a
 * claim about somewhere to leave a CAR. A buggy park is somewhere to leave a pushchair.
 *
 * Three served claims rested on this wording in production on 2026-10-01. The excerpts below are the
 * real stored text, zero-width space and all.
 */
describe('parking for things that are not cars does not establish car parking', () => {
  it('suppresses the three production false positives', () => {
    expect(parkingFacts('family which will be automatically applied to your basket. Buggy parking is available in Gallery Square. Different galleries have different accessible elements')).toEqual([]);
    expect(parkingFacts('Buggy park ​Buggy parking is available in the Welcome Area near the main entrance.')).toEqual([]);
    expect(parkingFacts('Cycling Bicycle parking is available at the Gallery.')).toEqual([]);
  });

  it('suppresses the other corpus-attested forms', () => {
    for (const text of [
      'Buggy park is located on the Lower Ground floor.',
      'Pushchair storage is available near the entrance.',
      'Pram storage is provided by the cloakroom.',
      'Bike parking is available.',
      'Cycle parking is available at the entrance.',
      'There are bike racks by the gate.',
      'Cycle racks are provided outside.',
      'Buggy bays are available in the foyer.',
    ]) {
      expect(parkingFacts(text), `expected no parking fact for: ${text}`).toEqual([]);
    }
  });

  it('preserves legitimate car parking wording', () => {
    expect(parkingFacts('Free parking is available on site for visitors.')).toContain('parking=yes');
    expect(parkingFacts('Car parking is available at the venue.')).toContain('parking=yes');
    expect(parkingFacts('There is a large free car park for visitors.')).toContain('parking=yes');
    expect(parkingFacts('Visitor car park is available.')).toContain('parking=yes');
    expect(parkingFacts('Parking is available on site.')).toContain('parking=yes');
    // Woodside Animal Farm's real wording.
    expect(parkingFacts('Parking All car parking is free.')).toContain('freeParking=yes');
  });

  it('preserves the car-parking qualifiers that make up the bulk of the corpus', () => {
    // accessible 92 occurrences, priority 66, coach 18 -- all of them cars (or coaches), all kept.
    expect(parkingFacts('Accessible parking is available for visitors with a Blue Badge.')).toContain('parking=yes');
    expect(parkingFacts('Priority parking is available close to the main doors.')).toContain('parking=yes');
    expect(parkingFacts('Coach parking is available by prior arrangement.')).toContain('parking=yes');
  });

  it('does not reject a sentence that states both, only the non-vehicle half', () => {
    // Removing the phrase and re-testing, rather than dropping the sentence, is what keeps this true.
    expect(parkingFacts('Buggy parking is available in Gallery Square. Free parking is available on site for cars.')).toContain('parking=yes');
    expect(parkingFacts('Bicycle parking is available, and there is a visitor car park on site.')).toContain('parking=yes');
  });

  it('leaves a correct negative alone, because negatives are decided first', () => {
    // Kentish Town City Farm's real excerpt: the value comes from "No parking directly outside the
    // farm" and the sentence also happens to mention bicycle parking. A guard that rejected the whole
    // sentence would have disturbed a true `no`.
    const kentishTown = '24 46 Car Parking No parking directly outside the farm, restricted parking in surrounding streets weekdays 8 -6 , Pay and display parking on Queen’s Crescent Vicar& ;s Road Plenty of room for buggies Bicycle parking inside the farm School visits';
    expect(parkingFacts(kentishTown)).toContain('parking=no');
  });

  it('covers freeParking too, not just parking', () => {
    // A mutation that applied the guard to `parking` alone broke no test, which was a gap in these
    // tests rather than a defensible alternative: `freeParking.yes` carries /parking\s+is\s+free/i,
    // so "Buggy parking is free" would otherwise publish free CAR parking off a pushchair bay.
    expect(parkingFacts('Buggy parking is free.')).toEqual([]);
    expect(parkingFacts('Bicycle parking is free of charge.')).toEqual([]);
    expect(parkingFacts('Car parking is free.')).toContain('freeParking=yes');
  });

  it('is a predicate about the sentence, exercised directly', () => {
    expect(isNonVehicleParkingOnly('Buggy parking is available in Gallery Square.', parkingYes)).toBe(true);
    expect(isNonVehicleParkingOnly('Free parking is available on site.', parkingYes)).toBe(false);
    expect(isNonVehicleParkingOnly('Bicycle parking is available, and there is a visitor car park on site.', parkingYes)).toBe(false);
  });
});

/**
 * The phrase guard above needs "bike" and "parking" next to each other. One production page never
 * writes them that way, and still published car parking off a bike rack:
 *
 *   the Design Museum  parking=yes  "Using a bike is a fantastic way to travel to the museum safely
 *                                    where a number of parking spaces are provided."
 *
 * Measured over every stored page on 2026-10-01, this rule fires on 3 of the 70 live parking-positive
 * sentences, changes exactly ONE verdict (the two others the phrase guard already rejected), and
 * costs no sentence in the corpus a real car park.
 */
describe('a sentence whose only traveller is a cyclist does not establish car parking', () => {
  it('suppresses the production false positive the phrase guard cannot see', () => {
    expect(
      parkingFacts('Using a bike is a fantastic way to travel to the museum safely where a number of parking spaces are provided.'),
    ).toEqual([]);
  });

  it('suppresses the same shape across the cycling vocabulary', () => {
    for (const text of [
      // Every sentence here was checked to CHANGE verdict when the guard is removed. The first
      // draft of this list said "Cyclists WILL find ...", which `matchField` already suppresses on
      // the bare word "will" -- it passed without the guard and proved nothing.
      'Cyclists are catered for, with a number of parking spaces provided by the entrance.',
      'Arriving by bicycle is easy and free parking is available by the gate.',
      'Cycling here is simple, with parking available next to the main door.',
      'Bikes can be left by the gate and parking is available next to the door.',
    ]) {
      expect(parkingFacts(text), `expected no parking fact for: ${text}`).toEqual([]);
    }
  });

  it('spares a sentence that also names a motor vehicle, so the car park survives', () => {
    expect(parkingFacts('Cyclists are welcome and there is free parking available for cars.')).toContain('parking=yes');
    expect(parkingFacts('Whether you come by bike or by car, parking is available on site.')).toContain('parking=yes');
    // "driving" alone is enough: the motor list is deliberately generous, because every term in it
    // KEEPS a positive and so can only ever cost a true fact, never manufacture one.
    expect(parkingFacts('If you are driving, parking is available; cyclists are welcome too.')).toContain('parking=yes');
  });

  it('leaves The Wallace Collection\'s correct negative alone', () => {
    // The real stored excerpt. It names bike docking stations AND a car, so this rule never reaches
    // it -- and the `no` patterns are decided before the `yes` loop in any case.
    const wallace = 'The nearest Santander bike docking stations are: Hinde Street George Street Portman Street Visiting by Car Unfortunately, we do not have any visitor parking available on site.';
    expect(parkingFacts(wallace)).toContain('parking=no');
  });

  it('reads the masked sentence, so a cycle rack beside a real car park costs nothing', () => {
    // This is the whole reason the rule composes with the phrase mask instead of running on the raw
    // sentence: "cycle racks" is consumed by the mask, leaving no cyclist to suppress anything.
    expect(parkingFacts('Free parking is available and there are cycle racks too.')).toContain('parking=yes');
    expect(parkingFacts('Free parking is available and there are cycle racks too.')).toContain('freeParking=yes');
    expect(parkingFacts('Parking is available on site, with bike parking by the entrance.')).toContain('parking=yes');
  });

  it('is a predicate about the sentence, exercised directly', () => {
    expect(isCycleTravelContext('Using a bike is a fantastic way to travel to the museum safely where a number of parking spaces are provided.')).toBe(true);
    expect(isCycleTravelContext('Free parking is available and there are cycle racks too.')).toBe(false);
    expect(isCycleTravelContext('Whether you come by bike or by car, parking is available on site.')).toBe(false);
    expect(isCycleTravelContext('Parking is available on site.')).toBe(false);
  });
});
