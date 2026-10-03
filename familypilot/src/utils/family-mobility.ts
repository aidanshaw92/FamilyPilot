import { ChildMobility, FamilyMember, FamilyProfile } from '@/src/types';

/**
 * What the family's answers about how the children get around mean for a day out.
 *
 * Two derived facts, and nothing broader, because those are the two the product can act on:
 *
 * - **The family brings a buggy** when any child usually goes in one. This replaces the old
 *   `Boolean(profile.pushchair?.trim())` test, which keyed on a free-text product name that
 *   onboarding never asked, so a parent with a toddler in a buggy got no buggy scoring at all. The
 *   legacy pushchair name still counts: a profile saved before this question existed keeps working.
 * - **The family needs step-free access** when any child uses a mobility aid.
 *
 * Neither is inferred from the other. A wheelchair does not make a venue buggy-suitable and a buggy
 * does not make a family step-free-dependent; the venue evidence for each is separate.
 */

type Mobile = Pick<FamilyMember, 'role' | 'mobility'>;

function children(members: readonly Mobile[] | undefined): Mobile[] {
  return (members ?? []).filter((member) => member.role === 'child');
}

export function childUsesBuggy(member: Pick<FamilyMember, 'mobility'>): boolean {
  return member.mobility?.includes('buggy') ?? false;
}

export function childUsesMobilityAid(member: Pick<FamilyMember, 'mobility'>): boolean {
  return member.mobility?.includes('mobility-aid') ?? false;
}

export function familyUsesBuggy(
  profile: Pick<FamilyProfile, 'members' | 'pushchair'> | null | undefined,
): boolean {
  if (!profile) return false;
  if (typeof profile.pushchair === 'string' && profile.pushchair.trim().length > 0) return true;
  return children(profile.members).some(childUsesBuggy);
}

export function familyNeedsStepFree(
  profile: Pick<FamilyProfile, 'members'> | null | undefined,
): boolean {
  if (!profile) return false;
  return children(profile.members).some(childUsesMobilityAid);
}

/** True once any child has an answer, so "not asked yet" stays distinguishable from "walks". */
export function mobilityAnswered(profile: Pick<FamilyProfile, 'members'>): boolean {
  return children(profile.members).some((member) => (member.mobility?.length ?? 0) > 0);
}

/** The words a parent sees for each answer: onboarding's chips, Edit profile and the Profile summary alike. */
export const MOBILITY_LABELS: Record<ChildMobility, string> = {
  walks: 'Walks',
  buggy: 'Buggy',
  carrier: 'Baby carrier',
  'mobility-aid': 'Wheelchair or mobility aid',
};
