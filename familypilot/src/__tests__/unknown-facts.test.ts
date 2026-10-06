import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { describeUnknownFact, describeUnknownFactAt } from '@/src/services/planning/unknown-facts';

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

/**
 * In a day with several stops, "here" does not say which. The day's list names each stop, and is shown under a heading a
 * parent would use: "Check before you go", not the evidence store's "Nobody has confirmed these". The honesty is unchanged:
 * every line still says the thing is not confirmed, never that it is or is not there.
 */
describe('a day’s unconfirmed facts name their stop and stay honest', () => {
  it('names the place instead of “here” / “this place”', () => {
    expect(describeUnknownFactAt('familyFacilities.babyChanging', 'Mapped Kitchen')).toBe('Baby changing is not confirmed at Mapped Kitchen');
    expect(describeUnknownFactAt('ageRecommendedFit', 'Kentish Town City Farm')).toBe('Recommended ages are not published for Kentish Town City Farm');
    expect(describeUnknownFactAt('estimatedSpend', 'Kentish Town City Farm')).toBe('What a visit costs at Kentish Town City Farm is not confirmed');
    expect(describeUnknownFactAt('environment', 'Kentish Town City Farm')).toBe('Whether Kentish Town City Farm is indoors or outdoors is not confirmed');
    expect(describeUnknownFactAt('someFutureConstraint', 'Mapped Kitchen')).toBe('Some future constraint is not confirmed at Mapped Kitchen');
  });

  it('falls back to “here” when there is no name, rather than printing an empty place', () => {
    expect(describeUnknownFactAt('familyFacilities.toilets', '  ')).toBe('Toilets are not confirmed here');
  });

  it('every line still says “not confirmed” or “not published”: never a yes, never a no', () => {
    const fields = ['familyFacilities.toilets', 'familyFacilities.babyChanging', 'familyFacilities.parking', 'pushchairSuitability', 'environment',
      'energyLevel', 'estimatedSpend', 'visitDurationMinutes', 'ageRecommendedFit', 'ageAdmission', 'journey', 'budget'];
    for (const field of fields) {
      const line = describeUnknownFactAt(field, 'Somewhere');
      expect(line, field).toMatch(/not (confirmed|published)/);
      expect(line, field).not.toMatch(/\b(has no|does not have|there is no|available|reviewed)\b/i);
    }
  });

  it('the Plan screen heads the list “Check before you go”, never in database terms', () => {
    const source = readFileSync(join(__dirname, '..', 'components', 'planning', 'PlanScreenView.tsx'), 'utf8');
    expect(source).toContain('<Block title="Check before you go"');
    expect(source).not.toMatch(/Nobody has confirmed these/i);
  });
});
