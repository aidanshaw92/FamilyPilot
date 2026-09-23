import { describe, expect, it } from 'vitest';

const {
  classifyAgeSentence,
  readBounds,
  ageSentences,
  auditEvidence,
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

describe('positive statements, which B2 cannot represent', () => {
  it.each([
    'Children of all ages are welcome at Paradox Museum London.',
    'Age requirement: Babylon Park is perfect for adults and children of all ages - there is no minimum age for access.',
    'A fun-filled day out with lots to see and do for children of all ages.',
  ])('%s', (sentence) => {
    const c = classifyAgeSentence(sentence);
    expect(c.category).toBe('positive_all_ages');
    expect(c.modelGap, 'a positive statement must be reported as a model gap, not silently dropped').toBeTruthy();
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
    expect(readBounds('Babies under 6 months are not admitted.')).toMatchObject({
      minMonthsInclusive: 6,
      unit: 'months',
    });
  });

  it('reads a year range as a half-open month interval', () => {
    expect(readBounds('Recommended for ages 3-11.')).toMatchObject({
      minMonthsInclusive: 36,
      maxMonthsExclusive: 144,
    });
  });
});

describe('the audit writes nothing and reports what it saw', () => {
  it('summarises a small corpus without touching a store', () => {
    const records = [
      {
        familypilotPlaceId: 'fp-a',
        sourceUrl: 'https://a.example/visit',
        sourceType: 'official_website',
        retrievedAt: '2026-09-21',
        extractedText: 'Under 4s are not admitted. Children of all ages are welcome in the garden.',
      },
    ];
    const { summary, candidates } = auditEvidence(records);

    expect(summary.pagesExamined).toBe(1);
    expect(summary.venuesWithEvidence).toBe(1);
    expect(candidates).toHaveLength(2);
    // Nothing gates: B3 is zero-write, so no claim and no human approval exists.
    expect(summary.candidatesThatWouldGate).toBe(0);
    expect(candidates.every((c: { wouldGateUnderB2: boolean }) => c.wouldGateUnderB2 === false)).toBe(true);
  });

  it('explains why a genuine door still would not gate', () => {
    const records = [{
      familypilotPlaceId: 'fp-a', sourceUrl: 'https://a.example/visit', sourceType: 'official_website',
      retrievedAt: '2026-09-21', extractedText: 'Under 4s are not admitted to the museum at any time.',
    }];
    const [candidate] = auditEvidence(records).candidates;
    expect(candidate.category).toBe('venue_restriction');
    expect(candidate.humanReviewRequired).toBe(true);
    expect(candidate.whyNotGating.join(' ')).toMatch(/no human approval/);
  });

  it('only picks sentences that actually mention age', () => {
    expect(ageSentences('We open at 10am. Under 4s are not admitted. The cafe serves cake.')).toEqual([
      'Under 4s are not admitted.',
    ]);
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
