import { FamilyProfile } from '@/src/types';
import { familyUsesBuggy } from '@/src/utils/family-mobility';
import { DayRequest } from '@/src/types/day-request';
import { AGE_RECOMMENDATION_STRENGTH, childAgesInMonths } from '@/src/services/matching/age-suitability';
import { parseExplicitTextConstraints } from './explicit-constraint-parser';

function getApiBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_RECOMMENDATIONS_API_URL) {
    return process.env.EXPO_PUBLIC_RECOMMENDATIONS_API_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/recommendations`;
  }
  return '/api/recommendations';
}

/**
 * The only part of the family profile that may leave the device for a day-request parse.
 *
 * The profile used to be posted whole, which for a family means every child's name, date of birth,
 * how they get around and their nap and feed times, and the server hands part of it to a language model.
 * The family profile is device-only, so the request carries what the parse actually reads and nothing
 * else: each child's age (no name, no id, no date of birth), the drive limit and budget, and whether the
 * family brings a buggy. The server echoes `homeLocation` into the request it returns, so it is sent
 * empty and restored locally from the profile.
 */
export function parseRequestProfile(profile: FamilyProfile): Record<string, unknown> {
  return {
    members: profile.members
      .filter((member) => member.role === 'child')
      .map((member) => ({ role: 'child', age: member.age, ageMonths: member.ageMonths ?? null })),
    homeLocation: '',
    budgetTier: profile.budgetTier,
    maxDriveMinutes: profile.maxDriveMinutes,
    pushchair: familyUsesBuggy(profile) ? 'yes' : null,
  };
}

export async function parseDayRequest(
  rawText: string,
  profile: FamilyProfile,
): Promise<DayRequest> {
  const response = await fetch(`${getApiBaseUrl()}/parse-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText, profile: parseRequestProfile(profile) }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Parse request failed (${response.status})`);
  }

  const data = (await response.json()) as { request: DayRequest };
  return { ...data.request, homeLocation: profile.homeLocation };
}

/**
 * Offline fallback, used for real when the parse endpoint is unreachable.
 *
 * This is production code, not a test stub: `services/api/index.ts` falls back to it whenever the
 * API call throws. It therefore runs the same shared deterministic parser the server runs, rather
 * than its own regexes. The previous version tested the whole sentence for "must", so
 * "I'd prefer indoors but it must have parking" made `indoor` a hard requirement — exactly the
 * eligibility drift the constraint-authority layer exists to prevent.
 *
 * No model runs here, so there are no suggestions to reconcile: the parent's own words and the
 * profile are the only inputs.
 */
export function parseDayRequestMock(rawText: string, profile: FamilyProfile): DayRequest {
  const { constraints: explicit } = parseExplicitTextConstraints(rawText);

  const constraints = {
    ...(explicit as DayRequest['constraints']),
    // Server-owned, assigned last so nothing above can have touched them.
    ageRecommendedFit: { strength: AGE_RECOMMENDATION_STRENGTH, value: 'in_range' as const },
    budget: { strength: 'preferred' as const, value: 'within_profile' as const },
    journey: { strength: 'required' as const, value: { maxMinutes: profile.maxDriveMinutes } },
  };

  return {
    rawText,
    parsedAt: new Date().toISOString(),
    childAges: profile.members.filter((m) => m.role === 'child').map((m) => m.age),
    childAgeMonthsList: childAgesInMonths(profile.members),
    homeLocation: profile.homeLocation,
    budgetTier: profile.budgetTier,
    maxDriveMinutes: profile.maxDriveMinutes,
    hasPushchair: familyUsesBuggy(profile) || explicit.pushchair != null,
    constraints,
    context: { freeformNotes: rawText.slice(0, 200) },
  };
}
