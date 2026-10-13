/**
 * Which families a parent can plan with, and what each one is: one rule for every screen that lists them.
 *
 * Three kinds of family reach the planner:
 *   - connected: an accepted connection, loaded from the account (both sides agreed; it can send and receive plans);
 *   - local: added on this phone from a first name and a postcode (`guest-…`); nobody else sees it, it is only a starting point;
 *   - a connection's copy stored on this phone for a plan (`connected-…`). It is real only while the account still lists the
 *     connection. Once the connections have loaded and it is not among them (the other family disconnected, or the account is
 *     not this one), it is gone: it is kept on the phone, but no screen offers it, so Meet halfway can never plan with a family
 *     that Families does not show. Where the account cannot be asked (signed out, still loading, offline) it is offered as
 *     `unverified` and said to be unchecked, never as connected.
 *
 * Nothing is deleted here: the stored copy is untouched, only what is offered changes.
 */
import { PlanningFamily } from './planner';

export type FamilyKind = 'connected' | 'local' | 'unverified';

export interface PlannableFamily {
  id: string;
  label: string;
  kind: FamilyKind;
  family: PlanningFamily;
}

export function plannableFamilies(input: {
  stored: PlanningFamily[];
  accepted: { family: PlanningFamily }[];
  /** Signed in to an account that can list connections, and the list has loaded. */
  verified: boolean;
}): PlannableFamily[] {
  const byId = new Map<string, PlannableFamily>();
  const acceptedIds = new Set(input.accepted.map((entry) => entry.family.id));
  for (const family of input.stored) {
    if (family.id.startsWith('guest-')) {
      byId.set(family.id, { id: family.id, label: family.label, kind: 'local', family });
    } else if (family.id.startsWith('connected-')) {
      // Replaced by the account's own copy below when it is still connected; otherwise only offered where it cannot be checked.
      if (!acceptedIds.has(family.id) && !input.verified) byId.set(family.id, { id: family.id, label: family.label, kind: 'unverified', family });
    }
  }
  // A connection loaded from the account replaces its stored copy, so a family that has since updated what they share is read as they are now.
  for (const { family } of input.accepted) byId.set(family.id, { id: family.id, label: family.label, kind: 'connected', family });
  return [...byId.values()];
}
