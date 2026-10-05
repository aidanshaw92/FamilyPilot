import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const { classifyAgeStatement, OFFICIAL_SOURCES } = createRequire(import.meta.url)('../../../server/enrichment/_lib/age-evidence.js');

/**
 * The age evidence contract, pinned on real wording from the stored 138-venue cohort (the venue's own pages). What may
 * count as a statement about who a venue is for, and what never does.
 */
const own = { sourceType: 'visitor_info', subjectScope: 'venue_own_subtree' };
const kind = (text: string, ctx = own) => classifyAgeStatement(text, ctx).kind;

describe('what counts as official age evidence', () => {
  it('a supervision rule is a fact about the venue, and never an exclusion', () => {
    for (const t of [
      'Children aged under 8 years old must be accompanied by an adult at all times while at the farm',
      'Children under 11 must be accompanied by an adult',
      'Children aged 15 or under must be accompanied by an adult who is 18 or over',
      'Under 14: Must be accompanied by a paying adult at all times during the visit',
      'Children aged 5--12 must have someone in the park supervising them at all times',
      'Under 16s All visitors under 16 must be accompanied by an adult',
    ]) {
      const r = classifyAgeStatement(t, own);
      expect(r.kind, t).toBe('supervision_rule');
      expect(r.requiresHumanApproval, t).toBe(false);
    }
  });

  it('the venue’s own recommended age is a recommended range (a price clause beside it does not spoil it)', () => {
    const r = classifyAgeStatement('Please note, children under the age of 2* go free but the recommended age of the attraction is children aged 6 and over', own);
    expect(r).toMatchObject({ kind: 'recommended_range', fromYears: 6, toYears: null });
  });

  it('advice about one part of the venue is facility-level, not the venue’s age range', () => {
    expect(kind('Age group This playground is suitable for children 4 to 7, 8 to 14 years old')).toBe('facility_range');
    expect(kind('colourful, state-of-the-art play and climbing equipment for children up to 14 years old')).toBe('facility_range');
  });

  it('a refusal of entry is a door policy and always needs a human', () => {
    const r = classifyAgeStatement('Suitable for under 16s only', own);
    expect(r.kind).toBe('door_policy');
    expect(r.requiresHumanApproval).toBe(true);
  });

  it('plain-word audience is only qualitative', () => {
    expect(kind('Yes — Flip Out Watford is great for young children')).toBe('qualitative');
  });
});

describe('what never counts', () => {
  it('ticket and price bands are not suitability', () => {
    for (const t of ['Child (4 – 17 years): £11', 'Children under 4 years: Free Annual Members: Free', 'Child 5-15 5 - 15 Years Current price, Child: £6',
      'Remember that all children aged under 3 go free to the Aquarium', 'Child Ticket For visitors aged 7 to 16 £10', 'Prices Adult Child 3-15yrs Family 2Ad 4Ch']) {
      expect(kind(t), t).toBe('rejected');
    }
  });

  it('programmes, workshops and events are not the venue’s age range', () => {
    for (const t of ['Activities are suitable for children aged 2+ Morning Session 1: 10', 'Here are some of the walks you can take, suitable for all ages 4+',
      'A fun, mindful children’s yoga class for 5 – 11 year olds', 'Designed for young people aged 11–16 years, Wild Teens offers three action-packed days of outdoor adventure',
      'We offer a Little Flippers Party package specifically for children aged 5 and under', 'Junior Park run for 4-14 year olds']) {
      expect(kind(t), t).toBe('rejected');
    }
  });

  it('marketing "all ages", group sizes and job ages are not evidence', () => {
    for (const t of ['A great day out for all ages', 'You must have 20 or more children aged 1 year and over to qualify for a group rate', 'large groups (20+ people)', 'Volunteers must be aged 16 or over']) {
      expect(kind(t), t).toBe('rejected');
    }
  });

  it('a sentence the extractor cut off is not a statement', () => {
    expect(kind('Suitable for children aged 3 – [')).toBe('rejected');
    expect(kind(' Suitable for children aged 3 &#8211; [')).toBe('rejected');
  });

  it('only the venue’s own pages count: parents, other venues’ pages and unknown sources do not', () => {
    const t = 'Children under 11 must be accompanied by an adult';
    expect(classifyAgeStatement(t, { sourceType: 'parent_report', subjectScope: 'venue_own_subtree' }).reason).toBe('not_official_source');
    expect(classifyAgeStatement(t, { sourceType: 'google_places', subjectScope: 'venue_own_subtree' }).reason).toBe('not_official_source');
    expect(classifyAgeStatement(t, { sourceType: 'visitor_info', subjectScope: 'sibling_unverified' }).reason).toBe('not_about_this_venue');
    expect(classifyAgeStatement(t, { sourceType: 'visitor_info', subjectScope: 'organisation_ancestor' }).reason).toBe('not_about_this_venue');
    expect(OFFICIAL_SOURCES.has('parent_report')).toBe(false);
  });

  it('a category is never an age: no statement, no range', () => {
    for (const t of ['Hackney City Farm is a city farm', 'A museum for curious minds', 'Soft play centre in Watford']) expect(kind(t), t).toBe('rejected');
  });
});
