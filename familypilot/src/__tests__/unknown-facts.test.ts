import { describe, expect, it } from 'vitest';

import { describeUnknownFact } from '@/src/services/planning/unknown-facts';

/**
 * A list of unconfirmed facts only works if a parent can read it. The Plan screen showed
 * "ageRecommendedFit: not confirmed" and "estimatedSpend: not confirmed" verbatim, which is a
 * database column with a colon after it.
 */
describe('an unconfirmed fact reads as a sentence, never as a field name', () => {
  it('names the facilities a parent plans around', () => {
    expect(describeUnknownFact('familyFacilities.toilets')).toBe('Toilets are not confirmed here');
    expect(describeUnknownFact('familyFacilities.babyChanging')).toBe('Baby changing is not confirmed here');
    expect(describeUnknownFact('familyFacilities.parking')).toBe('Parking is not confirmed here');
    expect(describeUnknownFact('pushchairSuitability')).toBe('Pushchair access is not confirmed here');
  });

  it('says recommended ages are unpublished rather than implying anyone was excluded', () => {
    const line = describeUnknownFact('ageRecommendedFit');
    expect(line).toBe('Recommended ages are not published for this place');
    expect(line).not.toMatch(/too young|too old|not allowed/i);
  });

  it('turns an unmapped key into words rather than printing it or dropping it', () => {
    // Dropping would be worse than either: an unconfirmed fact nobody is told about is exactly what
    // this list exists to prevent.
    expect(describeUnknownFact('someFutureConstraint')).toBe('Some future constraint is not confirmed');
    expect(describeUnknownFact('nested.path.wheelchairAccessible')).toBe('Wheelchair accessible is not confirmed');
  });

  it('never leaves a camelCase or namespaced key in the output', () => {
    const fields = [
      'familyFacilities.toilets', 'familyFacilities.babyChanging', 'familyFacilities.parking',
      'pushchairSuitability', 'environment', 'energyLevel', 'estimatedSpend',
      'visitDurationMinutes', 'ageRecommendedFit', 'ageAdmission', 'journey', 'budget',
      'aBrandNewField',
    ];
    for (const field of fields) {
      const line = describeUnknownFact(field);
      expect(line, field).not.toContain('.');
      expect(line, field).not.toMatch(/[a-z][A-Z]/);
      expect(line, field).not.toContain(': not confirmed');
    }
  });
});
