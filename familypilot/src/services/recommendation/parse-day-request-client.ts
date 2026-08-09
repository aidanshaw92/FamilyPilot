import { FamilyProfile } from '@/src/types';
import { DayRequest } from '@/src/types/day-request';

function getApiBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_RECOMMENDATIONS_API_URL) {
    return process.env.EXPO_PUBLIC_RECOMMENDATIONS_API_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/recommendations`;
  }
  return '/api/recommendations';
}

export async function parseDayRequest(
  rawText: string,
  profile: FamilyProfile,
): Promise<DayRequest> {
  const response = await fetch(`${getApiBaseUrl()}/parse-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText, profile }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Parse request failed (${response.status})`);
  }

  const data = (await response.json()) as { request: DayRequest };
  return data.request;
}

/** Client-side mock parser when API unavailable (tests / offline). */
export function parseDayRequestMock(rawText: string, profile: FamilyProfile): DayRequest {
  const text = rawText.toLowerCase();
  const childAges = profile.members.filter((m) => m.role === 'child').map((m) => m.age);
  const constraints: DayRequest['constraints'] = {
    childAgeFit: { strength: 'required', value: 'in_range' },
    journey: { strength: 'required', value: { maxMinutes: profile.maxDriveMinutes } },
    budget: { strength: 'preferred', value: 'within_profile' },
  };

  if (/\bindoor\b/.test(text)) {
    constraints.environment = {
      strength: /\bneed\b|\bmust\b|\bdon't want\b/.test(text) ? 'required' : 'preferred',
      value: 'indoor',
    };
  }

  if (/burn energy|run around|active|let off steam/.test(text)) {
    constraints.energyLevel = { strength: 'preferred', value: 'high' };
  }

  if (/pushchair|buggy|pram|stroller/.test(text)) {
    constraints.pushchair = {
      strength: /don'?t want difficult|need|must/.test(text) ? 'required' : 'preferred',
      value: 'not_difficult',
    };
  }

  if (/parking/.test(text)) {
    constraints.parking = {
      strength: /don'?t want difficult|need|must|easy/.test(text) ? 'required' : 'preferred',
      value: 'yes',
    };
  }

  const hourMatch = text.match(/(\d+)\s*hours?/);
  if (hourMatch) {
    constraints.visitDuration = {
      strength: 'preferred',
      value: { maxMinutes: Number(hourMatch[1]) * 60 },
    };
  }

  return {
    rawText,
    parsedAt: new Date().toISOString(),
    childAges,
    homeLocation: profile.homeLocation,
    budgetTier: profile.budgetTier,
    maxDriveMinutes: profile.maxDriveMinutes,
    hasPushchair: Boolean(profile.pushchair?.trim()) || /pushchair|buggy|pram|stroller/.test(text),
    constraints,
    context: { freeformNotes: rawText.slice(0, 200) },
  };
}
