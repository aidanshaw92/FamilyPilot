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

/** The wire shape: exactly what the server's allow-list accepts, nothing the person did not agree to share. */
export interface SharedFamilySnapshot {
  label: string;
  area: string;
  latitude: number;
  longitude: number;
  ages: number[];
  maxDriveMinutes: number;
  budgetTier: PlanningFamily['budgetTier'];
  pushchair: boolean;
  required: PlanningFamily['required'];
  relationship?: InviteRelationship;
  shareAvailability: boolean;
  /** Present only when the person explicitly shares home time; otherwise absent, not empty. */
  routines?: PlanningFamily['routines'];
}

const UK_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}$/i;
const roundKm = (n: number) => Math.round(n * 100) / 100;

/**
 * The area word a connection sees. A full postcode names a few dozen homes, so it is cut back to its outward part
 * ("WD23 4AB" -> "WD23"); free text keeps only what precedes the first comma, so "12 High St, Bushey" shares "Bushey"
 * and never a street number.
 */
export function coarseArea(raw: string | undefined): string {
  const text = (raw ?? '').trim();
  if (!text) return 'Nearby';
  const postcode = text.match(UK_POSTCODE);
  if (postcode) return postcode[1].toUpperCase();
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  const named = parts.find((p) => !/\d/.test(p)) ?? parts[parts.length - 1] ?? text;
  const outward = named.match(/^([A-Z]{1,2}\d[A-Z\d]?)\b/i);
  return (outward ? outward[1].toUpperCase() : named).slice(0, 40);
}

export function snapshotForSharing(
  profile: FamilyProfile,
  relationship?: InviteRelationship,
  shareAvailability = false,
): SharedFamilySnapshot {
  const derived = planningFamilyFromProfile(profile);
  if (typeof derived === 'string') {
    throw new InviteError('no-profile', 'Add your family details first so a connection has something to share.');
  }
  const first = profile.parentName?.trim().split(/\s+/)[0];
  const snapshot: SharedFamilySnapshot = {
    label: first ? `${first}’s family` : 'A FamilyPilot family',
    area: coarseArea(derived.area),
    // About a kilometre, rounded here so a precise home location never leaves the device.
    latitude: roundKm(derived.latitude),
    longitude: roundKm(derived.longitude),
    ages: derived.ages,
    maxDriveMinutes: derived.maxDriveMinutes,
    budgetTier: derived.budgetTier,
    pushchair: derived.pushchair,
    required: derived.required,
    relationship,
    shareAvailability,
  };
  if (shareAvailability) snapshot.routines = derived.routines;
  return snapshot;
}
