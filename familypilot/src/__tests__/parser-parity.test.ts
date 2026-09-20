import { describe, expect, it } from 'vitest';

import { parseDayRequestMock } from '@/src/services/recommendation/parse-day-request-client';
import { FamilyProfile } from '@/src/types';

/**
 * One rule set, three paths.
 *
 * The app falls back to `parseDayRequestMock` for real whenever the parse endpoint throws
 * (services/api/index.ts), so it is production code. It previously carried its own regexes, and
 * they disagreed with the server's: it tested the whole sentence for "must", so
 * "I'd prefer indoors but it must have parking" made `indoor` a hard requirement.
 *
 * Every fixture below runs through all three paths and must come out identical. A rule added to
 * one path and not another fails here rather than in a parent's results.
 */

const PROFILE = {
  homeLocation: 'London',
  budgetTier: 'moderate',
  maxDriveMinutes: 45,
  pushchair: '',
  members: [{ id: 'c1', name: 'Kid', role: 'child', age: 3 }],
} as unknown as FamilyProfile;

type Expected = Record<string, { strength: string; value: unknown } | undefined>;

/** Fields the parent's words own. Server-owned fields are asserted separately. */
const TEXT_FIELDS = ['environment', 'energyLevel', 'pushchair', 'babyChanging', 'toilets', 'parking', 'visitDuration'];

const CORPUS: Array<{ raw: string; expect: Expected; why?: string }> = [
  {
    raw: 'It must have baby changing and parking',
    expect: {
      babyChanging: { strength: 'required', value: 'yes' },
      parking: { strength: 'required', value: 'yes' },
    },
    why: 'strength carries across a coordinating "and"',
  },
  {
    raw: 'We need parking and we want to run around',
    expect: {
      parking: { strength: 'required', value: 'yes' },
      energyLevel: { strength: 'preferred', value: 'high' },
    },
    why: 'a segment stating its own strength takes over',
  },
  {
    raw: "I'd prefer indoors but it must have parking",
    expect: {
      environment: { strength: 'preferred', value: 'indoor' },
      parking: { strength: 'required', value: 'yes' },
    },
    why: 'contrast must not leak the "must" backwards onto the preference',
  },
  {
    raw: 'We need parking but would prefer somewhere calm',
    expect: {
      parking: { strength: 'required', value: 'yes' },
      energyLevel: { strength: 'preferred', value: 'low' },
    },
    why: 'contrast in the other direction',
  },
  {
    raw: 'We need parking but somewhere indoors',
    expect: {
      parking: { strength: 'required', value: 'yes' },
      environment: { strength: 'preferred', value: 'indoor' },
    },
    why: 'the contrastive segment states no strength of its own, so it must not inherit "need"',
  },
  {
    raw: 'We must have parking though quiet is nice',
    expect: {
      parking: { strength: 'required', value: 'yes' },
      energyLevel: { strength: 'preferred', value: 'low' },
    },
    why: 'same, via "though"',
  },
  // Postposed negation. The concept comes BEFORE the marker, which an earlier version let
  // through: "parking is not required" even survived as required/yes, the exact inverse.
  { raw: "Parking isn't important", expect: {}, why: 'negation after the concept still negates' },
  { raw: 'Parking is not important', expect: {} },
  { raw: "Parking isn't required", expect: {} },
  { raw: 'Parking is not required', expect: {} },
  { raw: "Baby changing isn't important", expect: {} },
  { raw: 'Not indoors', expect: {}, why: 'bare "not" negates too' },

  // Mixed modality in one segment. Required must not leak onto a concept the parent called ideal.
  {
    raw: 'We need somewhere indoors ideally with parking',
    expect: {
      environment: { strength: 'required', value: 'indoor' },
      parking: { strength: 'preferred', value: 'yes' },
    },
    why: '"ideally" governs what follows it, not what precedes',
  },
  {
    raw: 'It must be indoors preferably with parking',
    expect: {
      environment: { strength: 'required', value: 'indoor' },
      parking: { strength: 'preferred', value: 'yes' },
    },
  },
  {
    raw: 'We need somewhere indoors with parking if possible',
    expect: {
      environment: { strength: 'required', value: 'indoor' },
      parking: { strength: 'preferred', value: 'yes' },
    },
    why: 'a postfix qualifier softens only the concept it follows',
  },
  {
    raw: 'Parking is essential but indoors would be nice',
    expect: {
      parking: { strength: 'required', value: 'yes' },
      environment: { strength: 'preferred', value: 'indoor' },
    },
    why: 'a marker after the concept still governs it when none precedes',
  },

  // Same field stated more than once. "First positive statement wins" discarded corrections.
  {
    raw: "I'd prefer outdoors but I need indoors",
    expect: { environment: { strength: 'required', value: 'indoor' } },
    why: 'a later requirement must not be discarded by an earlier preference',
  },
  {
    raw: "I need indoors but I'd prefer outdoors",
    expect: { environment: { strength: 'required', value: 'indoor' } },
    why: 'and a later preference must not weaken an earlier requirement',
  },
  {
    raw: 'Parking would be nice but parking is essential',
    expect: { parking: { strength: 'required', value: 'yes' } },
  },
  {
    raw: 'Parking is essential but parking would also be nice',
    expect: { parking: { strength: 'required', value: 'yes' } },
  },
  {
    raw: 'We need indoors but we need outdoors',
    expect: {},
    why: 'two equally authoritative contradictions fail open rather than guessing a side',
  },
  {
    raw: 'I prefer indoors but I prefer outdoors',
    expect: {},
    why: 'same at preference level',
  },

  // A following preference marker must not reach backwards over an inherited requirement.
  {
    raw: 'We need parking and baby changing preferably with toilets',
    expect: {
      parking: { strength: 'required', value: 'yes' },
      babyChanging: { strength: 'required', value: 'yes' },
      toilets: { strength: 'preferred', value: 'yes' },
    },
    why: '"preferably" governs the toilets after it, not the baby changing before it',
  },
  {
    raw: 'We need baby changing and parking ideally somewhere indoors',
    expect: {
      babyChanging: { strength: 'required', value: 'yes' },
      parking: { strength: 'required', value: 'yes' },
      environment: { strength: 'preferred', value: 'indoor' },
    },
  },
  { raw: 'Parking is essential', expect: { parking: { strength: 'required', value: 'yes' } } },
  { raw: 'Parking would be nice', expect: { parking: { strength: 'preferred', value: 'yes' } } },

  { raw: "I don't need parking", expect: {}, why: 'negation yields no positive constraint' },
  { raw: "We don't need baby changing", expect: {} },
  { raw: 'Something without parking', expect: {} },
  { raw: 'No parking needed', expect: {} },
  { raw: 'A walk in the park', expect: {}, why: '"park" is a venue, not parking' },
  { raw: 'Somewhere within 20 minutes of home', expect: {}, why: 'travel time, not visit length' },
  { raw: 'Somewhere within 1 hour of home', expect: {}, why: 'hours are travel here too' },
  { raw: 'Under 45 minutes drive', expect: {} },
  { raw: 'Less than an hour away', expect: {} },
  {
    raw: 'We can stay for up to 2 hours',
    expect: { visitDuration: { strength: 'preferred', value: { maxMinutes: 120 } } },
  },
  {
    raw: 'A visit of no more than 90 minutes',
    expect: { visitDuration: { strength: 'preferred', value: { maxMinutes: 90 } } },
  },
  {
    raw: 'We need somewhere indoors, it must have baby changing and parking, and we want to burn off energy.',
    expect: {
      environment: { strength: 'required', value: 'indoor' },
      babyChanging: { strength: 'required', value: 'yes' },
      parking: { strength: 'required', value: 'yes' },
      energyLevel: { strength: 'preferred', value: 'high' },
    },
    why: 'the sentence production was tested with',
  },
];

async function serverOpenAiPath(raw: string, model: Record<string, unknown> = {}) {
  const { normaliseDayRequest } = await import('../../../server/recommendations/day-request-schema.js');
  return normaliseDayRequest({ rawText: raw, constraints: model }, PROFILE).constraints;
}

async function serverMockPath(raw: string) {
  const { parseMockDayRequest } = await import('../../../server/recommendations/day-request-schema.js');
  return parseMockDayRequest(raw, PROFILE).constraints;
}

function clientFallbackPath(raw: string) {
  return parseDayRequestMock(raw, PROFILE).constraints as Record<string, unknown>;
}

describe('all three parser paths agree', () => {
  for (const fixture of CORPUS) {
    it(`${fixture.raw}${fixture.why ? ` — ${fixture.why}` : ''}`, async () => {
      const paths = {
        'server openai': await serverOpenAiPath(fixture.raw),
        'server mock': await serverMockPath(fixture.raw),
        'client fallback': clientFallbackPath(fixture.raw),
      };

      for (const [name, constraints] of Object.entries(paths)) {
        for (const field of TEXT_FIELDS) {
          expect((constraints as Record<string, unknown>)[field], `${name} → ${field}`).toEqual(
            fixture.expect[field],
          );
        }

        // Server-owned, identical on every path regardless of the text.
        expect((constraints as Record<string, { strength: string; value: unknown }>).journey, `${name} journey`).toEqual({
          strength: 'required',
          value: { maxMinutes: 45 },
        });
        expect((constraints as Record<string, unknown>).budget, `${name} budget`).toEqual({
          strength: 'preferred',
          value: 'within_profile',
        });
        expect((constraints as Record<string, unknown>).ageRecommendedFit, `${name} age`).toEqual({
          strength: 'preferred',
          value: 'in_range',
        });
        expect((constraints as Record<string, unknown>).childAgeFit, `${name} legacy key`).toBeUndefined();
      }
    });
  }
});

describe('the client fallback no longer reads strength from the whole sentence', () => {
  it('does not make a preference required because "must" appears later', () => {
    // The precise old-behaviour bug. /\bmust\b/.test(wholeSentence) made indoor required.
    const constraints = clientFallbackPath("I'd prefer somewhere indoors, but it must have parking") as Record<
      string,
      { strength: string }
    >;
    expect(constraints.environment.strength).toBe('preferred');
    expect(constraints.parking.strength).toBe('required');
  });

  it('does not invent a required pushchair from a profile pushchair', () => {
    const withBuggy = { ...PROFILE, pushchair: 'Yes' } as unknown as FamilyProfile;
    const constraints = parseDayRequestMock('Somewhere fun today', withBuggy).constraints as Record<string, unknown>;
    expect(constraints.pushchair).toBeUndefined();
  });

  it('still records that the family has a pushchair when the text says so', () => {
    expect(parseDayRequestMock('we will have the buggy', PROFILE).hasPushchair).toBe(true);
  });
});

describe('model suggestions are dropped unless the parent supported them', () => {
  it('drops an invented pushchair rather than merely softening it', async () => {
    const constraints = await serverOpenAiPath(
      'We need somewhere indoors, it must have baby changing and parking, and we want to burn off energy.',
      { pushchair: { strength: 'required', value: 'not_difficult' } },
    );
    // Capping it to preferred would still move fit classification and ranking.
    expect((constraints as Record<string, unknown>).pushchair).toBeUndefined();
  });

  it('drops a model field the parent explicitly negated', async () => {
    const constraints = await serverOpenAiPath("I don't need parking", {
      parking: { strength: 'preferred', value: 'yes' },
    });
    expect((constraints as Record<string, unknown>).parking).toBeUndefined();
  });

  it('keeps a model field the text does support, softened', async () => {
    const constraints = await serverOpenAiPath('somewhere with parking', {
      parking: { strength: 'required', value: 'yes' },
    });
    // Deterministic parsing already made it preferred; the model cannot raise it.
    expect((constraints as Record<string, { strength: string }>).parking.strength).toBe('preferred');
  });
});
