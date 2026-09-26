import { describe, expect, it } from 'vitest';

const {
  classifyAgeSentence,
  readAgeSet,
  detectPolarity,
  toAdmittedInterval,
  ageSentences,
  unextractableAgeText,
  auditEvidence,
  AGE_SENTENCE,
} = require('../../../server/enrichment/_lib/age-evidence-audit');

/**
 * P0-B3: the audit's own tests.
 *
 * Every sentence below is real wording from the London corpus (or a minimal paraphrase of it).
 * The audit exists to tell us whether the B2 model fits reality, so its classifier has to be
 * pinned against reality rather than against sentences invented to suit it.
 */

const classify = (sentence: string) => classifyAgeSentence(sentence).category;

describe('a door is only a door', () => {
  it('reads a real venue-level prohibition', () => {
    const c = classifyAgeSentence('Under 4s are not admitted to the museum.');
    expect(c.category).toBe('venue_restriction');
    expect(c.scope).toBe('venue');
    expect(c.effect).toBe('excludes');
    expect(c.bounds.minMonthsInclusive).toBe(48);
  });

  it('never treats a carer-eligibility rule as a door', () => {
    /**
     * The worst false positive in the entire corpus, from Woodside Animal Farm. A naive read sees
     * "under 16" and "not permitted" and calls it an admission rule. Published, it would have
     * hidden that venue from every family with a child under 16 -- very nearly every family this
     * product serves -- on a sentence about who may act as a disabled visitor's companion.
     */
    expect(
      classify('Children under 16 are not permitted to accompany a disabled visitor as an Essential Companion.'),
    ).toBe('companion_role_not_admission');
    expect(classify('The carer must be 14+ years old.')).toBe('companion_role_not_admission');
    expect(
      classify('Children who are 16 or 17 years old can visit the attraction unaccompanied by an adult but cannot be responsible for children who are 15 or under.'),
    ).toBe('companion_role_not_admission');
  });

  it('keeps an accompaniment requirement as accompaniment even when it gates entry', () => {
    // Woodside again, and the sentence that really is about admission -- but conditionally, on an
    // adult being present, which is true by construction for a family day out.
    const c = classifyAgeSentence('Children under 16 must be accompanied by an adult to be permitted entry to Woodside Animal Farm.');
    expect(c.category).toBe('accompaniment');
    expect(c.scope).toBe('accompaniment');
    expect(c.effect).toBe('caveat');
  });
});

describe('numbers that are not ages', () => {
  it.each([
    ['Covering over 5,000 acres of historic parkland, the parks provide green spaces.', 'not_an_age_statement'],
    ['Over 1 million visitors enjoy this free playground every year.', 'not_an_age_statement'],
    ['All groups over 8 persons must book a tour ahead of their visit.', 'not_an_age_statement'],
    ['Home to over 500 species in 14 themed zones.', 'not_an_age_statement'],
    ['The aquarium is based over 3 floors and all are wheelchair accessible.', 'not_an_age_statement'],
  ])('%s', (sentence, expected) => {
    expect(classify(sentence)).toBe(expected);
  });

  it('never reads a height or weight limit as an age', () => {
    expect(classify('Children must be strictly under 50kg to ride.')).toBe('height_not_age');
    expect(classify('All children under 1.2m benefit from separate under 1.2m session pricing.')).toBe('height_not_age');
  });
});

describe('an age that does not govern admission', () => {
  it('separates ticket pricing from a door', () => {
    expect(classify('Children under 4 years old can enter the museum for free.')).toBe('pricing_not_admission');
    expect(classify('Children aged under 3s are free.')).toBe('pricing_not_admission');
  });

  it('separates benefit eligibility and memberships from a door', () => {
    expect(
      classify('Entitlement to Disability Living Allowance for children under 16 or DLA/Personal Independent Payments (PIP) for those aged 16-64.'),
    ).toBe('administrative_not_admission');
    expect(classify('A Family membership, for two adults and two children under 18 is also available.')).toBe(
      'administrative_not_admission',
    );
  });

  it('keeps an activity rule off the front door', () => {
    const c = classifyAgeSentence('Soft play is for ages 5 and over.');
    expect(c.category).toBe('activity_restriction');
    expect(c.scope).toBe('activity');
    expect(c.effect).toBe('caveat');
  });
});

describe('positive statements, and the marketing copy that looks like one', () => {
  it.each([
    'Children of all ages are welcome at Paradox Museum London.',
    'Age requirement: Babylon Park is perfect for adults and children of all ages - there is no minimum age for access.',
  ])('a statement about ADMISSION counts: %s', (sentence) => {
    const c = classifyAgeSentence(sentence);
    expect(c.category).toBe('positive_all_ages');
    expect(c.modelGap, 'a positive statement must be reported as a model gap, not silently dropped').toBeTruthy();
  });

  it.each([
    'A fun-filled day out with lots to see and do for children of all ages.',
    'Discover over 260 years of Wedgwood to life for all ages.',
    'A must-visit for all ages, we will inspire and challenge you.',
  ])('marketing copy does not: %s', (sentence) => {
    expect(classifyAgeSentence(sentence).category).toBe('marketing_all_ages');
  });

  it('never reads a qualified positive as an unconditional welcome', () => {
    /**
     * "Suitable for all ages 4+" is the opposite of evidence that a venue admits everyone. Reading
     * the positive half and discarding the qualifier would make contradictory marketing copy the
     * strongest possible support for an all-ages fact.
     */
    const c = classifyAgeSentence('Here are some of the walks you can take, suitable for all ages 4+, with maps sold at 1.');
    expect(c.category).toBe('qualified_positive');
    expect(c.category).not.toBe('positive_all_ages');
    expect(c.modelGap).toBeTruthy();
  });
});

describe('polarity: the output must never invert who gets through the door', () => {
  const admitted = (sentence: string) => {
    const c = classifyAgeSentence(sentence);
    return { category: c.category, min: c.bounds?.minMonthsInclusive ?? null, max: c.bounds?.maxMonthsExclusive ?? null };
  };

  it('a lower-bound prohibition admits the OLDER children', () => {
    expect(admitted('Under 4s are not admitted.')).toEqual({ category: 'venue_restriction', min: 48, max: null });
  });

  it('an upper-bound prohibition admits the YOUNGER children', () => {
    // The inversion this replaces: "over 12s not admitted" previously produced a MINIMUM of 144,
    // admitting exactly the ages the sentence excludes and excluding the ones it admits.
    expect(admitted('Children aged 12 and over are not admitted.')).toEqual({ category: 'venue_restriction', min: null, max: 144 });
    expect(admitted('12+ are not admitted.')).toEqual({ category: 'venue_restriction', min: null, max: 144 });
  });

  it('resolves "over N" upwards, because admitting too many is the safe direction', () => {
    // "Over 12s" may mean 12+ or 13+. Choosing the larger bound shows a venue that might turn a
    // family away; choosing the smaller would hide one that would have let them in.
    expect(admitted('Over 12s are not admitted.')).toEqual({ category: 'venue_restriction', min: null, max: 156 });
  });

  it('reads an admitted-set sentence as the set it admits', () => {
    expect(admitted('Only ages 5+ are admitted.')).toEqual({ category: 'venue_restriction', min: 60, max: null });
    expect(admitted('Children 12 and under only.')).toEqual({ category: 'venue_restriction', min: null, max: 156 });
  });

  it('keeps a recommendation a recommendation', () => {
    const c = classifyAgeSentence('Recommended for ages 3-11.');
    expect(c.category).toBe('recommendation');
    expect(c.scope).not.toBe('venue');
  });

  it('fails open when an excluded band would leave two disjoint admitted ranges', () => {
    // "Ages 5 to 10 are not admitted" admits 0-4 AND 11+, which B2 cannot represent at all.
    const c = classifyAgeSentence('Children aged 5 to 10 are not admitted to the gallery.');
    expect(c.scope).not.toBe('venue');
    expect(toAdmittedInterval(readAgeSet('ages 5 to 10'), 'excluded')).toBeNull();
  });

  it('separates the three polarities', () => {
    expect(detectPolarity('under 4s are not admitted')).toBe('excluded');
    expect(detectPolarity('only ages 5 and over')).toBe('admitted_set');
    expect(detectPolarity('recommended for ages 3-11')).toBe('described');
  });
});

describe('numbers with a unit, and numbers too large to be a child', () => {
  it.each([
    'Thorpe Park boasts over 25 rides and attractions.',
    'Discover over 50 Brand Histories from the last century.',
    'Home to over 150 incredibly lifelike figures.',
    'Our farm has 32 acres and over 100 animals.',
  ])('%s', (sentence) => {
    const c = classifyAgeSentence(sentence);
    expect(c.bounds ?? null, 'a counted thing is not an age').toBeNull();
  });

  it('rejects a counted thing even when the count is a plausible age', () => {
    // Below the 21-year ceiling, so only the unit list can catch these. Without it, "over 12
    // rides" becomes a twelve-year minimum on a theme park.
    expect(readAgeSet('over 12 rides and attractions')).toBeNull();
    expect(readAgeSet('more than 8 exhibits')).toBeNull();
    expect(readAgeSet('over 14 animals on the farm')).toBeNull();
    // ...while the same number about a person is still an age.
    expect(readAgeSet('children over 12 years old')).toMatchObject({ kind: 'above' });
  });

  it('rejects a bound too large to be a child-admission rule', () => {
    expect(readAgeSet('50+ thrilling exhibits')).toBeNull();
    expect(readAgeSet('seniors over 65')).toBeNull();
    // ...but an adults-only door is still readable.
    expect(readAgeSet('18+ only')).toMatchObject({ kind: 'above', months: 216 });
  });

  it('keeps "years old" an age while "years of history" is not', () => {
    expect(readAgeSet('children over 12 years old')).toMatchObject({ kind: 'above' });
    expect(readAgeSet('over 260 years of Wedgwood')).toBeNull();
  });
});

describe('sentences that state two things at once', () => {
  it('refuses to attribute one interval to the wrong fact', () => {
    const c = classifyAgeSentence(
      'Please note, children under the age of 2 go free but the recommended age of the attraction is children aged 6 and over.',
    );
    expect(c.category).toBe('mixed_statement');
    expect(c.mixedSignals).toContain('pricing');
    expect(c.mixedSignals).toContain('recommendation');
    expect(c.modelGap).toBeTruthy();
  });
});

describe('month precision survives the audit', () => {
  it('reads an infant rule in months, not years', () => {
    const c = classifyAgeSentence('Babies under 6 months are not admitted.');
    expect(c.bounds).toMatchObject({ minMonthsInclusive: 6, maxMonthsExclusive: null });
    expect(readAgeSet('under 6 months')).toMatchObject({ months: 6, unit: 'months' });
  });

  it('reads a year range as a half-open month interval', () => {
    expect(classifyAgeSentence('Recommended for ages 3-11.').bounds).toMatchObject({
      minMonthsInclusive: 36,
      maxMonthsExclusive: 144,
    });
  });
});

describe('the two gate questions, which are not the same question', () => {
  const door = {
    familypilotPlaceId: 'fp-a',
    sourceUrl: 'https://a.example/visit',
    sourceType: 'official_website',
    retrievedAt: '2026-09-23',
    extractedText: 'Under 4s are not admitted to the museum at any time.',
  };

  it('a genuine door is eligible to gate if a human approved it', () => {
    /**
     * The metric this replaces was tautological: it appended "no human approval exists" to every
     * candidate and returned false, so "would gate: 0" was guaranteed for every possible corpus,
     * including this sentence. It measured only that B3 is zero-write.
     */
    const [candidate] = auditEvidence([door]).candidates;
    expect(candidate.category).toBe('venue_restriction');
    expect(candidate.eligibleToGateIfHumanApproved).toBe(true);
    expect(candidate.whyNotGating).toEqual([]);
    // ...and it still gates nothing today, because nothing has been written or approved.
    expect(candidate.wouldGateNow).toBe(false);
    expect(candidate.humanReviewRequired).toBe(true);
  });

  it('the Woodside companion-role sentence is not eligible, because it is not a door', () => {
    /**
     * The point the audit exists to make: BEFORE the companion-role guard this sentence was a
     * venue restriction on an official-type page with a long excerpt, so it was eligible to gate
     * the moment a human clicked approve. Afterwards it is not a door at all.
     */
    const [candidate] = auditEvidence([
      { ...door, extractedText: 'Children under 16 are not permitted to accompany a disabled visitor as an Essential Companion.' },
    ]).candidates;
    expect(candidate.category).toBe('companion_role_not_admission');
    expect(candidate.eligibleToGateIfHumanApproved).toBe(false);
    expect(candidate.humanReviewRequired).toBe(false);
  });

  it('a source type the gate does not admit is not eligible either', () => {
    const [candidate] = auditEvidence([{ ...door, sourceType: 'council_page' }]).candidates;
    expect(candidate.category).toBe('venue_restriction');
    expect(candidate.eligibleToGateIfHumanApproved).toBe(false);
    expect(candidate.whyNotGating.join(' ')).toMatch(/source type council_page/);
  });
});

describe('the ledger, and metrics that mean the same thing in both modes', () => {
  it('accounts for every sentence that went in', () => {
    const records = [{
      familypilotPlaceId: 'fp-a', sourceUrl: 'https://a.example/visit', sourceType: 'official_website',
      retrievedAt: '2026-09-23',
      extractedText: 'Under 4s are not admitted. Children of all ages are welcome in the garden. We open at 10am.',
    }];
    const { summary, candidates, skipped } = auditEvidence(records);

    expect(summary.sentenceOccurrences).toBe(candidates.length + skipped.length);
    expect(summary.accountsFor).toBe(true);
    expect(summary.classified).toBe(candidates.length);
    expect(summary.explicitlySkipped).toBe(skipped.length);
  });

  it('counts pages and statements separately, and identically in both input shapes', () => {
    /**
     * Live mode hands one record per page; --file hands one per sentence. A single
     * `sourceTypeCounts` therefore meant two different things depending on how it was run.
     */
    const page = {
      familypilotPlaceId: 'fp-a', sourceUrl: 'https://a.example/visit', sourceType: 'official_website',
      retrievedAt: '2026-09-23', extractedText: 'Under 4s are not admitted. Children of all ages are welcome.',
    };
    const perSentence = [
      { ...page, ageSentences: ['Under 4s are not admitted.'], extractedText: 'Under 4s are not admitted.' },
      { ...page, ageSentences: ['Children of all ages are welcome.'], extractedText: 'Children of all ages are welcome.' },
    ];

    const live = auditEvidence([page]).summary;
    const offline = auditEvidence(perSentence).summary;

    expect(offline.pagesExamined).toBe(live.pagesExamined);
    expect(offline.pageSourceTypeCounts).toEqual(live.pageSourceTypeCounts);
    expect(offline.candidateSourceTypeCounts).toEqual(live.candidateSourceTypeCounts);
    expect(offline.classified).toBe(live.classified);
  });

  it('distinguishes sentence occurrences from unique sentence text', () => {
    const repeated = 'Children must be accompanied by an adult at all times.';
    const { summary } = auditEvidence([
      { familypilotPlaceId: 'fp-a', sourceUrl: 'https://a.example/1', sourceType: 'visitor_info', retrievedAt: '2026-09-23', extractedText: repeated },
      { familypilotPlaceId: 'fp-b', sourceUrl: 'https://b.example/1', sourceType: 'visitor_info', retrievedAt: '2026-09-23', extractedText: repeated },
    ]);
    expect(summary.sentenceOccurrences).toBe(2);
    expect(summary.uniqueSentenceText).toBe(1);
    expect(summary.venuesWithEvidence).toBe(2);
  });

  it('only picks sentences that actually mention age', () => {
    expect(ageSentences('We open at 10am. Under 4s are not admitted. The cafe serves cake.')).toEqual([
      'Under 4s are not admitted.',
    ]);
  });
});

describe('candidate discovery is deliberately broader than classification', () => {
  /**
   * The audit publishes a NEGATIVE result ("no venue in the stored evidence prohibits a child by
   * age"), and a negative result is only worth the recall of the step that finds candidates. Each
   * form below was missing from the front-door detector at some point in this PR, and each one is
   * real wording from production. A miss here is invisible in the report; an over-match is noise
   * that `classifyAgeSentence` discards, so the door is broad on purpose.
   */
  it.each([
    // The reviewer's named production example, at Flip Out Brent Cross.
    ['Children aged 5--12 must have someone in the park supervising them at all times.'],
    ['The minimum age is 5.'],
    ['Children must be aged 8.'],
    ['Children aged 12 or over may visit alone.'],
    ['Children under the age of 12 must be accompanied by a paying adult.'],
    ['No one under the age of 14 is admitted.'],
    ['Only babies 18 months and under are admitted.'],
    ['Children 12 years and over must pay full price.'],
    ['Visitors must be 8 years of age to ride.'],
    ['Children aged 18 months to 5 years are welcome.'],
  ])('finds %s', (sentence) => {
    expect(AGE_SENTENCE.test(sentence)).toBe(true);
  });

  it('classifies the Flip Out supervision rule as accompaniment, not a mystery', () => {
    // Found by the detector but previously dumped into `insufficient_evidence`, because
    // ACCOMPANIMENT_PATTERN knew "supervised" and not "supervising".
    const c = classifyAgeSentence('Children aged 5-12 must have someone in the park supervising them at all times.');
    expect(c.category).toBe('accompaniment');
    expect(c.scope).not.toBe('venue');
  });

  it.each([
    ['The minimum age is 5.', 60, null],
    ['Children must be aged 8.', 96, null],
    ['No one under the age of 14 is admitted.', 168, null],
    ['Only children over 18 months are admitted.', 18, null],
    ['Only babies 18 months and under are admitted.', null, 19],
  ])('reads a door stated without a directional word: %s', (sentence, min, max) => {
    const c = classifyAgeSentence(sentence as string);
    expect(c.category).toBe('venue_restriction');
    expect(c.bounds?.minMonthsInclusive ?? null).toBe(min);
    expect(c.bounds?.maxMonthsExclusive ?? null).toBe(max);
  });

  it('never lets a month-unit bound be read as years', () => {
    // "over 18 months" parsed by the generic "over N" rule is eighteen YEARS: a fifteen-fold error,
    // in the direction that hides families.
    expect(readAgeSet('Only children over 18 months are admitted.')).toMatchObject({ kind: 'above', months: 18, unit: 'months' });
    expect(readAgeSet('Only children over 18 are admitted.')).toMatchObject({ kind: 'above', months: 216, unit: 'years' });
  });

  it.each([
    ['Children aged 18 months to 5 years are welcome.', true],
    ['Sensory play session for children under 13 years with special educational needs.', true],
    ['Children must be supervised by an adult aged 18 years or over.', true],
    ['You must have 20 or more children aged 1 year and over to qualify for a group rate.', true],
    // The other side: a span of history or a card validity is not an age, at any magnitude.
    ['Discover a story bringing over 260 years of Wedgwood to life for all ages.', false],
    ['Discover over 100 years of RAF history, climb aboard iconic aircraft.', false],
    ['Sculpting a Legacy, 14 years of art on the park.', false],
    ['A full access card (£15 for 3 years), which is recognised at thousands of venues.', false],
    ['Thorpe Park boasts over 25 rides and attractions.', false],
    ['get Tickets 50+ thrilling exhibits Fully Interactive For all ages.', false],
  ])('tells an age in years from a span in years: %s', (sentence, isAge) => {
    expect(Boolean(readAgeSet(sentence as string))).toBe(isAge);
  });
});

describe('both sides of the fail-open asymmetry', () => {
  const bounds = (sentence: string) => {
    const c = classifyAgeSentence(sentence);
    return { min: c.bounds?.minMonthsInclusive ?? null, max: c.bounds?.maxMonthsExclusive ?? null };
  };

  /**
   * The safe direction FLIPS with polarity, and getting one side right is not getting it right.
   * For an exclusion, admitting more children means a WIDER bound. For an admitted set, it means a
   * NARROWER one. An earlier revision resolved both upwards, so "Only over 12s are admitted" became
   * 13+ and hid every twelve-year-old's family.
   */
  it('an ambiguous exclusion resolves to the bound that admits MORE', () => {
    expect(bounds('Over 12s are not admitted.')).toEqual({ min: null, max: 156 });
  });

  it('an ambiguous admission resolves to the bound that admits MORE', () => {
    expect(bounds('Only over 12s are admitted.')).toEqual({ min: 144, max: null });
  });

  it('holds at month precision too, where one step is a month and not a year', () => {
    expect(bounds('Children over 18 months are not admitted.')).toEqual({ min: null, max: 19 });
    expect(bounds('Only children over 18 months are admitted.')).toEqual({ min: 18, max: null });
  });

  it('is symmetric for the other direction of bound', () => {
    expect(bounds('Only under 12s are admitted.')).toEqual({ min: null, max: 156 });
    expect(bounds('Under 4s are not admitted.')).toEqual({ min: 48, max: null });
  });
});

describe('the discovery ledger, outside the selected corpus', () => {
  /**
   * The corpus ledger (input = classified + skipped) balances against itself and so can never fail.
   * The check that CAN fail compares this module's page count against a discovery total measured by
   * something else -- the SQL scan over production. A page production says mentions age, that this
   * audit never saw, has to surface as `unexplainedPages`, not disappear.
   */
  const page = (id: string, text: string) => ({
    familypilotPlaceId: id, sourceUrl: `https://${id}.example/visit`, sourceType: 'visitor_info',
    retrievedAt: '2026-09-26', extractedText: text,
  });

  it('reports a page production found but the audit never received', () => {
    const { summary } = auditEvidence([page('a', 'Children under 12 must be accompanied by an adult.')], {
      discovery: { pagesWithAgeWording: 3, venuesWithAgeWording: 2 },
    });
    expect(summary.pagesWithAgeSignal).toBe(1);
    expect(summary.unexplainedPages).toBe(2);
    expect(summary.unexplainedVenues).toBe(1);
    expect(summary.discoveryAccountsFor).toBe(false);
  });

  it('reconciles once the discovery scan declares which pages it could not quote', () => {
    const { summary } = auditEvidence([page('a', 'Children under 12 must be accompanied by an adult.')], {
      discovery: { pagesWithAgeWording: 3, venuesWithAgeWording: 2, unquotablePages: 2, unquotableVenues: 1 },
    });
    expect(summary.unexplainedPages).toBe(0);
    expect(summary.unexplainedVenues).toBe(0);
    expect(summary.discoveryAccountsFor).toBe(true);
  });

  it('books a page with age wording but no quotable sentence on the unextractable side', () => {
    // One block, no sentence punctuation, longer than anything worth quoting: exactly the shape of
    // the 24 production pages the SQL scan finds and the classifier cannot use.
    const unquotable = `${'Opening Hours Tickets Daily Activities Accessibility Finding us '.repeat(12)}accompanied`;
    const { summary, unextractable } = auditEvidence([page('b', unquotable)]);
    expect(ageSentences(unquotable)).toEqual([]);
    expect(unextractableAgeText(unquotable)).not.toBeNull();
    expect(summary.pagesWithAgeSignal).toBe(0);
    expect(summary.pagesWithAgeWording).toBe(1);
    expect(summary.pagesWithAgeWordingButNoSentence).toBe(1);
    expect(unextractable[0].agrees).toBe(true);
  });

  it('leaves the reconciliation unstated rather than claiming it, when no discovery total is given', () => {
    const { summary } = auditEvidence([page('a', 'Children under 12 must be accompanied by an adult.')]);
    expect(summary.expectedPagesWithAgeWording).toBeNull();
    expect(summary.unexplainedPages).toBeNull();
  });
});

describe('the audit cannot write, structurally', () => {
  /**
   * B3 is defined as zero-write, and "we checked once" is not a guarantee. This asserts the audit
   * never so much as mentions a writer, so a future edit that reaches for one fails here rather
   * than in production.
   */
  const fs = require('node:fs');
  const path = require('node:path');
  const FORBIDDEN = [
    'createAgePolicyClaim', 'createApprovedClaim', 'replaceActiveClaim', 'saveMetadata',
    'saveEvidenceRecord', 'approveDraft', 'setClaimStatus', 'disputeClaim', 'expireClaim',
    '.insert(', '.update(', '.upsert(', '.delete(', '.rpc(',
  ];

  it.each([
    ['server/enrichment/_lib/age-evidence-audit.js'],
    ['scripts/audit-age-evidence.js'],
  ])('%s references no writer', (file) => {
    const source = fs.readFileSync(path.join(__dirname, '../../../', file), 'utf8');
    for (const forbidden of FORBIDDEN) {
      expect(source.includes(forbidden), `${file} must not reference ${forbidden}`).toBe(false);
    }
  });
});
