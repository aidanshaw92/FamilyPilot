import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseDayRequest, parseRequestProfile } from '@/src/services/recommendation/parse-day-request-client';
import { planningFamilyFromProfile } from '@/src/services/planning/plan-parties';
import { buildSavedBackup } from '@/src/services/saved/saved-backup-projection';
import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import { blankChild, buildOnboardingProfile, newNap } from '@/src/utils/onboarding-draft';
import { FamilyProfile, SavedItem, VenueDetail } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';

/**
 * The family profile stays on the device. These tests put recognisable sentinels in a profile (names a
 * parent would type, a date of birth, how a child gets around, a nap) and then follow the ways data could
 * leave: the Saved backup projection, the planner family that a parent may back up or share, and the
 * day-request parse. If a future change routes a profile field to the network, one of these fails.
 */

const NOW = new Date(2026, 5, 15, 9, 0);
const SENTINELS = ['Zephyrine', 'Quillon', '2025-10-10', '2018-03-20', 'dobKnown', 'mobility', 'mobility-aid', 'carrier', 'childId'];

function profile(): FamilyProfile {
  const baby = { ...blankChild(), id: 'b', name: 'Zephyrine', day: '10', month: '10', year: '2025', mobility: ['carrier', 'buggy'] as never, naps: [newNap()], feedMode: 'interval' as const };
  const older = { ...blankChild(), id: 'o', name: 'Quillon', day: '20', month: '3', year: '2018', mobility: ['mobility-aid'] as never };
  return buildOnboardingProfile({ parentName: 'Sam', homeLocation: 'Bushey', home: { latitude: 51.6, longitude: -0.3 }, children: [baby, older], now: NOW });
}

const FACTS = {
  placeId: 'p1', name: 'Park', category: 'park', driveMinutes: 10, enrichmentStatus: 'enriched',
  minRecommendedAge: 3, maxRecommendedAge: 9, venueAgePolicy: null, toilets: 'yes', babyChanging: 'unknown',
  parking: 'yes', freeParking: 'unknown', pushchairSuitability: 'good', environment: 'outdoor', energyLevel: 'moderate',
  visitDurationMinutes: null, estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'unknown',
} as MatchableVenueFacts;

function mentions(payload: unknown, token: string): boolean {
  return JSON.stringify(payload).includes(token);
}

describe('Saved places backup', () => {
  it('carries no name, date of birth, mobility answer or routine even when the saved venue was scored for this family', () => {
    const p = profile();
    const venue = {
      id: 'p1', name: 'Park', category: 'park', latitude: 51.6, longitude: -0.3, driveMinutes: 10, imageUrl: '',
      photos: [], facilities: [], openingHours: '', description: '', enrichmentStatus: 'enriched', trustedFacts: FACTS,
    } as unknown as VenueDetail;
    const score = calculateFamilyScore(venue, p, { enrichmentStatus: 'enriched' });
    // The score really does name the children, so a leak would be visible.
    expect(mentions(score, 'Zephyrine') || mentions(score, 'Quillon')).toBe(true);

    const item = { id: 'p1', type: 'place', venue: { ...venue, familyScore: score }, savedAt: '2026-06-01T00:00:00Z' } as unknown as SavedItem;
    const payload = buildSavedBackup(['p1'], [item]);
    for (const token of SENTINELS) expect(mentions(payload, token), `backup must not contain ${token}`).toBe(false);
    expect(mentions(payload, 'familyScore')).toBe(false);
  });
});

describe('the planner family a parent can back up or share', () => {
  it('has no name, id, date of birth, mobility answer or child-owned routine label', () => {
    const family = planningFamilyFromProfile({ ...profile() }) as object;
    expect(typeof family).toBe('object');
    for (const token of SENTINELS) expect(mentions(family, token), `planner family must not contain ${token}`).toBe(false);
    // What it does carry is what planning needs: ages, whether a buggy comes, routine times.
    expect(mentions(family, 'ages')).toBe(true);
  });
});

describe('the day-request parse', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('projects the profile to ages, limits and a buggy flag', () => {
    const projected = parseRequestProfile(profile());
    for (const token of SENTINELS) expect(mentions(projected, token), `parse profile must not contain ${token}`).toBe(false);
    expect(projected).toMatchObject({ homeLocation: '', maxDriveMinutes: 30, budgetTier: 'moderate', pushchair: 'yes' });
    expect((projected.members as Array<{ age: number }>).map((m) => m.age)).toEqual([0, 8]);
  });

  it('posts that projection, and gives the request back with the home area restored locally', async () => {
    let sent = '';
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      sent = init.body;
      return { ok: true, json: async () => ({ request: { rawText: 'x', homeLocation: '', constraints: {} } }) };
    }));
    const request = await parseDayRequest('somewhere indoors', profile());
    for (const token of SENTINELS) expect(sent.includes(token), `request body must not contain ${token}`).toBe(false);
    expect(sent).not.toMatch(/"name"/);
    expect(request.homeLocation).toBe('Bushey');
  });
});

describe('no module that talks to the network reads the new child fields', () => {
  const FIELDS = ['dateOfBirth', 'dobKnown', 'ChildMobility', 'childId', '.mobility'];
  const NETWORK = [/\bfetch\(/, /\bsupabase\b/, /sendBeacon/, /XMLHttpRequest/];
  const root = join(__dirname, '..', '..');

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return entry === '__tests__' || entry === 'node_modules' ? [] : files(full);
      return /\.(ts|tsx)$/.test(entry) ? [full] : [];
    });
  }

  it('finds none among src and app', () => {
    const offenders = [...files(join(root, 'src')), ...files(join(root, 'app'))].filter((file) => {
      const text = readFileSync(file, 'utf8');
      return NETWORK.some((re) => re.test(text)) && FIELDS.some((field) => text.includes(field));
    });
    expect(offenders.map((file) => file.replace(root, ''))).toEqual([]);
  });
});
