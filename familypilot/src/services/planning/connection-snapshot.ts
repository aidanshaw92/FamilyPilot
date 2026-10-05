import { FamilyProfile } from '@/src/types';

import { PlanningFamily } from './planner';
import { InviteRelationship } from './invite-links';
import { planningFamilyFromProfile } from './plan-parties';

/**
 * The household as it will be shared with a connection: planning-shaped, labelled by first name ("Alex’s family"), with
 * the children's AGES and never their names or dates of birth. Pure, so what a connection receives is asserted in tests.
 * The server rounds the location to about a kilometre and drops anything not on its short allow-list.
 */
export type InviteFailure = 'not-signed-in' | 'no-profile' | 'limit' | 'invalid' | 'expired' | 'own' | 'unavailable';

export class InviteError extends Error {
  readonly failure: InviteFailure;
  constructor(failure: InviteFailure, message: string) {
    super(message);
    this.name = 'InviteError';
    this.failure = failure;
  }
}

export function snapshotForSharing(
  profile: FamilyProfile,
  relationship?: InviteRelationship,
  shareAvailability = false,
): PlanningFamily & { relationship?: InviteRelationship; shareAvailability: boolean } {
  const derived = planningFamilyFromProfile(profile);
  if (typeof derived === 'string') {
    throw new InviteError('no-profile', 'Add your family details first so a connection has something to share.');
  }
  const first = profile.parentName?.trim().split(/\s+/)[0];
  return { ...derived, label: first ? `${first}’s family` : 'A FamilyPilot family', relationship, shareAvailability };
}
