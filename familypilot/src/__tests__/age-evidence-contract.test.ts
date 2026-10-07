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

/**
 * HARDENING, from the 7 Oct 2026 audit of the stored official pages (docs/AGE_SUITABILITY_YIELD.md). Before this the
 * recommended-range rule would have accepted any number after "recommended for / best for / ideal for / suitable for":
 * a visit length, a head count, a ride height, a group size, a school year. Nothing publishes from this contract yet; these
 * pin what a producer must never be allowed to accept when one is built.
 */
describe('age-adjacent wording never becomes a recommended age', () => {
  const NOT_AN_AGE: Array<[string, string]> = [
    ['visit length', 'Best for a visit of 2 to 3 hours.'],
    ['head count', 'Recommended for 4 people per table.'],
    ['group size', 'Ideal for groups of 10 to 20.'],
    ['ride height', 'Suitable for riders over 1.2m.'],
    ['guest height', 'Designed for guests 90cm to 140cm tall.'],
    ['family ticket definition', 'Family ticket: recommended for 2 adults and 2 children aged 3-15.'],
    ['school workshop', 'Our school workshops are suitable for children aged 5 to 11 (Key Stage 1 and 2).'],
    ['school group', 'The school visit is suitable for pupils in Year 3 and 4.'],
    ['adult audience', 'Recommended for adults aged 18 and over.'],
    ['evening event', 'Suitable for ages 18+ only after 6pm.'],
    ['price bands', 'Under 5s: £4. Ages 5–12: £6.'],
    ['under-3s free', 'Under 3s free. Recommended for children 3 and over to pay the child price.'],
    ['a rating', 'Best for 5 stars on arrival.'],
    ['a capacity', 'Suitable for up to 30 children at a time.'],
    ['family friendly', 'A great family friendly day out for all the family.'],
    ['existence of children’s facilities', 'We have a children’s playground, baby changing and a soft play area for little ones.'],
    ['category', 'Hackney City Farm is a city farm.'],
    ['height restriction', 'Children under 1.2m can still enjoy a wide range of attractions.'],
    ['admission rule', 'Only adults supervising children up to the age of 12 will be admitted.'],
    ['ticket band', 'Child (4 – 17 years): £10.50 Children under 4 years: Free'],
    ['membership definition', 'Explore the Museum and Gardens as a family (up to 2 adults and 3 children aged three and above).'],
    ['ride pricing', 'Add a ride on the Time Machine Coaster for just £3 per child aged 12 and under.'],
    ['an online resource', 'online resources available for families, with activities to do at home with children aged 6–11 years.'],
    ['a costume rule', 'Children aged 14 and under are welcome to wear costumes at Young V&A.'],
  ];

  it.each(NOT_AN_AGE)('%s is not a recommended age', (_why, text) => {
    const r = classifyAgeStatement(text, own);
    expect(['recommended_range', 'facility_range', 'door_policy'], text).not.toContain(r.kind);
  });

  it('a range stated in months is rejected, never rounded to years', () => {
    // Belmont's soft play, real wording. Before: read as "up to 6".
    for (const t of ['Belmont Farm’s purpose built soft play area accommodates children from 6 months to 10 years', 'Our soft play area is for children aged 6 months and over']) {
      const r = classifyAgeStatement(t, own);
      expect(r.kind, t).toBe('rejected');
      expect(r.toYears ?? null, t).toBeNull();
    }
  });

  it('a session, class or party for an age is a programme, not the venue’s range (plurals included)', () => {
    for (const t of ['Soft Play sessions are open to children aged 2 to 5', 'Our workshops are suitable for children aged 5 to 11', 'Birthday parties are best for children aged 4 to 8', 'Holiday clubs are recommended for ages 6 to 12']) {
      expect(kind(t), t).toBe('rejected');
    }
  });

  it('still accepts the one wording the audit found at venue level, and the playgrounds', () => {
    expect(classifyAgeStatement('the recommended age of the attraction is children aged 6 and over', own)).toMatchObject({ kind: 'recommended_range', fromYears: 6, toYears: null });
    expect(classifyAgeStatement('Recommended for ages 3–8', own)).toMatchObject({ kind: 'recommended_range', fromYears: 3, toYears: 8 });
    expect(classifyAgeStatement('Suitable for children aged 5+', own)).toMatchObject({ kind: 'recommended_range', fromYears: 5, toYears: null });
    expect(classifyAgeStatement('This playground is suitable for children 4 to 7, 8 to 14 years old', own).kind).toBe('facility_range');
  });

  it('the sentence must be about the venue’s own pages: the same wording from a parent or a stranger is nothing', () => {
    const t = 'the recommended age of the attraction is children aged 6 and over';
    expect(classifyAgeStatement(t, { sourceType: 'parent_report', subjectScope: 'venue_own_subtree' }).kind).toBe('rejected');
    expect(classifyAgeStatement(t, { sourceType: 'visitor_info', subjectScope: 'other_catalogue_venue' }).kind).toBe('rejected');
    expect(classifyAgeStatement(t, { sourceType: 'visitor_info', subjectScope: 'sibling_unverified' }).kind).toBe('rejected');
  });
});

describe('a venue-level candidate is not a fact until its own pages agree (SEA LIFE, 7 Oct 2026)', () => {
  // Real sentences from the same venue's own stored pages. Each classifies on its own; together they conflict, which is why a
  // producer must reconcile across pages and why this venue's age stays unknown (docs/AGE_SUITABILITY_YIELD.md).
  it('the price-note sentence reads as a venue-level range, and the same site\'s accessibility guide says "all ages"', () => {
    const faq = classifyAgeStatement('Please note, children under the age of 2* go free but the recommended age of the attraction is children aged 6 and over.', own);
    const guide = classifyAgeStatement('SEA LIFE London Aquarium is suitable all children of all ages.', own);
    expect(faq).toMatchObject({ kind: 'recommended_range', fromYears: 6, toYears: null });
    expect(guide.kind).toBe('rejected');
    expect(guide.reason).toBe('marketing');
  });
});
