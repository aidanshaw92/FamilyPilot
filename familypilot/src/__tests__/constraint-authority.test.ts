import { describe, expect, it } from 'vitest';

import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { matchVenueToDayRequest } from '@/src/services/matching/day-request-matcher';
import { DayRequest, MatchableVenueFacts } from '@/src/types/day-request';
import { VenueFamilyMetadata } from '@/src/types/places';

/**
 * Who is allowed to decide that a venue disappears.
 *
 *   1. the family profile and this server   (ageRecommendedFit, journey, budget)
 *   2. deterministic parsing of the parent's own words
 *   3. the model, as soft suggestions only
 *
 * Both production failure modes are pinned below as fixtures. Before the prompt fix the model
 * dropped "it must have parking" entirely; after it, it invented a required pushchair nobody
 * mentioned and a 30-minute journey limit against a profile that said 45. The second is the
 * dangerous one: day-request-matcher evaluates journey at `required` whatever strength the
 * request declares, so an invented 30 removes every venue 31-45 minutes away.
 */

const PROFILE = {
  homeLocation: 'London',
  budgetTier: 'moderate' as const,
  maxDriveMinutes: 45,
  members: [{ role: 'child', age: 3 }],
};

/** The exact sentence production was tested with. */
const CASE_A = 'We need somewhere indoors, it must have baby changing and parking, and we want to burn off energy.';

async function schema() {
  return import('../../../server/recommendations/day-request-schema.js');
}

async function normalise(rawText: string, modelConstraints: Record<string, unknown> = {}) {
  const { normaliseDayRequest } = await schema();
  return normaliseDayRequest({ rawText, constraints: modelConstraints }, PROFILE);
}

describe('deterministic text restores what the model dropped', () => {
  it('restores a required parking from "it must have parking"', async () => {
    const out = await normalise('It must have parking', {});
    expect(out.constraints.parking).toEqual({ strength: 'required', value: 'yes' });
  });

  it('restores a required baby changing from "must have baby changing"', async () => {
    const out = await normalise('We must have baby changing', {});
    expect(out.constraints.babyChanging).toEqual({ strength: 'required', value: 'yes' });
  });

  it('restores a required indoor environment from "need somewhere indoors"', async () => {
    const out = await normalise('We need somewhere indoors', {});
    expect(out.constraints.environment).toEqual({ strength: 'required', value: 'indoor' });
  });

  it('restores a preferred high energy from "want to burn off energy"', async () => {
    const out = await normalise('We want to burn off energy', {});
    expect(out.constraints.energyLevel).toEqual({ strength: 'preferred', value: 'high' });
  });

  it('production case A: all four survive a model that returned nothing', async () => {
    const out = await normalise(CASE_A, {});
    expect(out.constraints.environment).toEqual({ strength: 'required', value: 'indoor' });
    expect(out.constraints.babyChanging).toEqual({ strength: 'required', value: 'yes' });
    expect(out.constraints.parking).toEqual({ strength: 'required', value: 'yes' });
    expect(out.constraints.energyLevel).toEqual({ strength: 'preferred', value: 'high' });
  });
});

describe('a model-only field can never gate', () => {
  it('production case: an invented pushchair is dropped, not merely softened', async () => {
    // Nothing in case A mentions a pushchair. Run 59063 in production emitted it as `required`.
    // Softening it to `preferred` would stop it excluding a venue but still move fit
    // classification, preferredUnknowns, ranking and the explanation the parent reads.
    const out = await normalise(CASE_A, {
      pushchair: { strength: 'required', value: 'not_difficult' },
    });
    expect(out.constraints.pushchair).toBeUndefined();
  });

  it('an invented environment the text never mentions is dropped', async () => {
    const out = await normalise('Something fun for a 3 year old', {
      environment: { strength: 'required', value: 'indoor' },
    });
    expect(out.constraints.environment).toBeUndefined();
  });

  it('a model field the parent negated is dropped rather than reintroduced', async () => {
    const out = await normalise("I don't need parking", {
      parking: { strength: 'required', value: 'yes' },
    });
    expect(out.constraints.parking).toBeUndefined();
  });

  it('drops every ungrounded model field, not just the ones we saw fail', async () => {
    const out = await normalise('Something fun', {
      environment: { strength: 'required', value: 'indoor' },
      energyLevel: { strength: 'required', value: 'high' },
      pushchair: { strength: 'required', value: 'not_difficult' },
      babyChanging: { strength: 'required', value: 'yes' },
      toilets: { strength: 'required', value: 'yes' },
      parking: { strength: 'required', value: 'yes' },
    });
    // Nothing in "Something fun" supports any of them, so only the server-owned three survive.
    expect(Object.keys(out.constraints).sort()).toEqual(['ageRecommendedFit', 'budget', 'journey']);
  });
});

describe('the model-suggestion layer itself', () => {
  /**
   * Since unsupported fields are dropped, and a supported field is by construction one the
   * deterministic parser also produced, `reconcileConstraints` always overwrites whatever the
   * model contributed. The model therefore cannot currently change the final constraint object
   * at all — which is the intended consequence of giving it no authority, not an accident.
   *
   * The `required -> preferred` cap inside modelSuggestions is consequently unreachable through
   * normaliseDayRequest today. It is kept as defence in depth for any future change to the
   * reconciliation order, and pinned here directly so it cannot rot unnoticed.
   */
  it('caps a surviving model field to preferred', async () => {
    const { modelSuggestions } = await schema();
    // environment and energyLevel read the caller's strength (normaliseConstraint), unlike the
    // tri-state fields which hardcode preferred, so they are what the cap actually protects.
    const out = modelSuggestions(
      {
        constraints: {
          environment: { strength: 'required', value: 'indoor' },
          energyLevel: { strength: 'required', value: 'high' },
        },
      },
      new Set(['environment', 'energyLevel']),
    );
    expect(out.environment).toEqual({ strength: 'preferred', value: 'indoor' });
    expect(out.energyLevel).toEqual({ strength: 'preferred', value: 'high' });
  });

  it('drops a field the text does not support', async () => {
    const { modelSuggestions } = await schema();
    const out = modelSuggestions(
      { constraints: { pushchair: { strength: 'required', value: 'not_difficult' } } },
      new Set(),
    );
    expect(out.pushchair).toBeUndefined();
  });

  it('drops a server-owned field outright rather than normalising it', async () => {
    const { modelSuggestions } = await schema();
    const out = modelSuggestions(
      { constraints: { journey: { strength: 'required', value: { maxMinutes: 5 } }, budget: { strength: 'required', value: 'within_profile' } } },
      new Set(['journey', 'budget']),
    );
    const fields = out as unknown as Record<string, unknown>;
    expect(fields.journey).toBeUndefined();
    expect(fields.budget).toBeUndefined();
  });
});

describe('server and profile own age, journey and budget', () => {
  it('production case: a model journey of 30 cannot override a profile of 45', async () => {
    const out = await normalise('Something fun for a 3 year old', {
      journey: { strength: 'preferred', value: { maxMinutes: 30 } },
    });
    expect(out.constraints.journey).toEqual({ strength: 'required', value: { maxMinutes: 45 } });
  });

  it('a model journey at required strength cannot override it either', async () => {
    const out = await normalise('x', { journey: { strength: 'required', value: { maxMinutes: 10 } } });
    expect(out.constraints.journey.value.maxMinutes).toBe(45);
  });

  it('a model budget of any strength leaves budget at preferred/within_profile', async () => {
    for (const strength of ['required', 'context', 'preferred']) {
      const out = await normalise('x', { budget: { strength, value: 'within_profile' } });
      expect(out.constraints.budget).toEqual({ strength: 'preferred', value: 'within_profile' });
    }
  });

  it('age stays exactly as P0-B1 established it', async () => {
    const out = await normalise('Something fun for a 3 year old', {
      childAgeFit: { strength: 'required', value: 'in_range' },
      ageRecommendedFit: { strength: 'required', value: 'in_range' },
    });
    expect(out.constraints.ageRecommendedFit).toEqual({ strength: 'preferred', value: 'in_range' });
    expect(out.constraints.childAgeFit).toBeUndefined();
  });
});

describe('explicit text beats the model', () => {
  it('deterministic required is not weakened by a model preferred', async () => {
    const out = await normalise('It must have parking', {
      parking: { strength: 'preferred', value: 'yes' },
    });
    expect(out.constraints.parking).toEqual({ strength: 'required', value: 'yes' });
  });

  it('deterministic preferred is not upgraded to required by the model', async () => {
    const out = await normalise("I'd prefer somewhere with parking", {
      parking: { strength: 'required', value: 'yes' },
    });
    expect(out.constraints.parking).toEqual({ strength: 'preferred', value: 'yes' });
  });

  it('a contradicting model value loses to the parent’s own words', async () => {
    const out = await normalise('We need somewhere indoors', {
      environment: { strength: 'preferred', value: 'outdoor' },
    });
    expect(out.constraints.environment).toEqual({ strength: 'required', value: 'indoor' });
  });
});

describe('deterministic extractor rules', () => {
  /** Annotated: inference would otherwise narrow to whatever shape the first call returns. */
  type ExplicitConstraints = Record<string, { strength: string; value: unknown }>;

  async function explicit(text: string): Promise<ExplicitConstraints> {
    const { parseExplicitTextConstraints } = await import(
      '../../../server/recommendations/explicit-constraint-parser.js'
    );
    return parseExplicitTextConstraints(text).constraints as unknown as ExplicitConstraints;
  }

  it('carries a strength across "and" only until a segment states its own', async () => {
    // "must have baby changing and parking" - parking inherits required.
    const carried = await explicit('it must have baby changing and parking');
    expect(carried.babyChanging.strength).toBe('required');
    expect(carried.parking.strength).toBe('required');

    // "need parking and we want to run around" - the second segment says "want".
    const split = await explicit('we need parking and we want to run around');
    expect(split.parking.strength).toBe('required');
    expect(split.energyLevel.strength).toBe('preferred');
  });

  it('never produces required from a bare mention', async () => {
    const out = await explicit('somewhere with parking and toilets');
    expect(out.parking.strength).toBe('preferred');
    expect(out.toilets.strength).toBe('preferred');
  });

  it('does not read a venue called a park as a parking requirement', async () => {
    expect(await explicit('a walk in the park')).toEqual({});
    expect(await explicit('we love Primrose Hill park')).toEqual({});
  });

  it('does not read a drive limit as a visit length', async () => {
    // "within 20 minutes" is how far they will travel, not how long they will stay.
    expect(await explicit('somewhere within 20 minutes of home')).toEqual({});
    const stated = await explicit('we can stay for up to 2 hours');
    expect((stated.visitDuration.value as { maxMinutes: number }).maxMinutes).toBe(120);
  });

  it('extracts nothing from text that states no requirement', async () => {
    expect(await explicit('Something fun for a 3 year old')).toEqual({});
  });
});

describe('both parser paths share one rule set', () => {
  it('the offline mock produces the same authoritative constraints as the real path', async () => {
    const { parseMockDayRequest } = await schema();
    const offline = parseMockDayRequest(CASE_A, PROFILE);
    const online = await normalise(CASE_A, {});

    for (const field of ['environment', 'babyChanging', 'parking', 'energyLevel', 'journey', 'budget', 'ageRecommendedFit']) {
      expect(offline.constraints[field], `offline ${field}`).toEqual(online.constraints[field]);
    }
  });
});

describe('downstream: a hallucinated constraint cannot remove a venue', () => {
  const metadata: VenueFamilyMetadata = {
    familypilotPlaceId: 'fp-authority',
    enrichmentStatus: 'enriched',
    familyFacilities: { toilets: 'yes' },
    provenance: {},
    updatedAt: '2026-09-01T00:00:00.000Z',
  };

  function facts(driveMinutes: number): MatchableVenueFacts {
    // Everything the model might invent is `unknown` here - the state that fails a required
    // constraint closed.
    return extractMatchableFacts('fp-authority', 'Authority Park', 'park', driveMinutes, 'enriched', metadata, undefined);
  }

  it('keeps a venue eligible despite an invented required pushchair and environment', async () => {
    const request = (await normalise('Something fun for a 3 year old', {
      pushchair: { strength: 'required', value: 'not_difficult' },
      environment: { strength: 'required', value: 'indoor' },
      toilets: { strength: 'required', value: 'yes' },
    })) as unknown as DayRequest;

    const match = matchVenueToDayRequest(facts(20), { ...request, hasPushchair: true });
    expect(match.eligible).toBe(true);
  });

  it('a venue 40 minutes away survives a model that asked for 30', async () => {
    // The profile allows 45. Production run 59068 emitted journey preferred/30; the matcher
    // evaluates journey at required regardless, so this is the case that really excluded venues.
    const request = (await normalise('Something fun for a 3 year old', {
      journey: { strength: 'preferred', value: { maxMinutes: 30 } },
    })) as unknown as DayRequest;

    expect(matchVenueToDayRequest(facts(40), request).eligible).toBe(true);
    // And the profile limit is still enforced at its own value.
    expect(matchVenueToDayRequest(facts(50), request).eligible).toBe(false);
  });

  it('a postposed negation cannot exclude a venue', async () => {
    // "parking isn't important" against unknown parking. An earlier version let parking through
    // as a positive preference, and "parking is not required" even survived as required.
    const request = (await normalise("Parking isn't important", {})) as unknown as DayRequest;
    expect((request.constraints as Record<string, unknown>).parking).toBeUndefined();
    expect(matchVenueToDayRequest(facts(20), request).eligible).toBe(true);
  });

  it('a merely-ideal concept cannot exclude a venue', async () => {
    const request = (await normalise('We need somewhere indoors ideally with parking', {})) as unknown as DayRequest;
    const constraints = request.constraints as unknown as Record<string, { strength: string }>;
    expect(constraints.environment.strength).toBe('required');
    expect(constraints.parking.strength).toBe('preferred');

    // The stated requirement is satisfied, so unknown parking must not remove the venue.
    const indoors = { ...facts(20), environment: 'indoor' as const };
    expect(matchVenueToDayRequest(indoors, request).eligible).toBe(true);
  });

  it('still lets the parent’s own stated requirement exclude a venue', async () => {
    // The layer removes the model's authority, not the parent's. An unknown facility the parent
    // said they need must still fail closed.
    const request = (await normalise('We must have baby changing', {})) as unknown as DayRequest;
    expect(matchVenueToDayRequest(facts(20), request).eligible).toBe(false);
  });
});
