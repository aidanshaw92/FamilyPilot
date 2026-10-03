import { describe, expect, it } from 'vitest';

import { mockVenues } from '@/src/data/mock-data';
import { FamilyProfile, Venue } from '@/src/types';
import { buildDriveCaution, personaliseVenue } from '@/src/utils/personalise-venues';
import { createEmptyProfile } from '@/src/utils/profile-defaults';

/**
 * A long drive is a caution, not a reason the place suits the family.
 *
 * Found by rendering Venue Detail: "Further than your usual 30 min drive" sat under "Why it suits
 * your family" with a green tick, because family-score pushed it into `explanation`. These pin where
 * it lives now -- in the cautions that render under "Good to know" -- and that it is gone from the
 * reasons.
 */

const profile = (maxDriveMinutes: number): FamilyProfile => ({
  ...createEmptyProfile(),
  parentName: 'Test',
  homeLocation: 'Richmond',
  maxDriveMinutes,
  members: [{ id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2022-03-10', age: 4 }],
});

const base = mockVenues[0];
const venueAt = (driveMinutes: number): Venue => ({ ...base, driveMinutes, enrichmentStatus: 'enriched' });

describe('a drive beyond the family limit', () => {
  it('is no longer listed as a reason the place suits the family', () => {
    const personalised = personaliseVenue(venueAt(45), profile(30));
    for (const line of personalised.familyScore.explanation) {
      expect(line, `"${line}" is a caution and must not be a reason`).not.toMatch(/further than your usual/i);
    }
  });

  it('is raised as a caution instead, where the other cautions go', () => {
    const personalised = personaliseVenue(venueAt(45), profile(30));
    expect(personalised.familyScore.cautions ?? []).toContain('Further than your usual 30 min drive');
  });

  it('is not raised when the drive is within the limit', () => {
    const personalised = personaliseVenue(venueAt(20), profile(30));
    expect((personalised.familyScore.cautions ?? []).join(' ')).not.toMatch(/further than your usual/i);
    expect(buildDriveCaution(profile(30), 20)).toBeNull();
    expect(buildDriveCaution(profile(30), 30)).toBeNull();
  });

  it('is not invented for a drive nobody has measured', () => {
    // A place restored from a cloud backup has NaN travel until something measures it. A caution
    // about an unknown distance would be a second fabricated fact beside the first one it replaced.
    expect(buildDriveCaution(profile(30), Number.NaN)).toBeNull();
    const personalised = personaliseVenue(venueAt(Number.NaN), profile(30));
    expect((personalised.familyScore.cautions ?? []).join(' ')).not.toMatch(/further than your usual/i);
  });

  it('comes first among the cautions, because it is the one a parent can act on before leaving', () => {
    const personalised = personaliseVenue(venueAt(45), profile(30));
    const cautions = personalised.familyScore.cautions ?? [];
    expect(cautions[0]).toBe('Further than your usual 30 min drive');
  });
});
