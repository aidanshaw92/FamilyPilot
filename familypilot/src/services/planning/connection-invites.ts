import { supabase } from '@/src/services/supabase/client';
import { FamilyProfile } from '@/src/types';

import { PlanningFamily } from './planner';
import { InviteRelationship, buildInviteUrl, isInviteCode } from './invite-links';

export { InviteError, snapshotForSharing } from './connection-snapshot';
export type { InviteFailure } from './connection-snapshot';
import { InviteError, snapshotForSharing } from './connection-snapshot';
import { planningApiUrl } from './recommendations';

/**
 * Connecting families: creating an invitation link, previewing one, accepting one, and listing what is connected.
 *
 * This is the client of `api/planning/connections.js`, which owns the rules (single use, seven days, hashed code, the
 * snapshot that is shared only once an invitation is accepted). Nothing here widens them.
 *
 * WHAT IS SHARED AND WHEN. Creating or accepting shares a snapshot with the other family: a label ("Alex's family"),
 * a location rounded to about a kilometre, the children's AGES (never names), the drive limit, budget tier, whether a
 * buggy comes and the must-have facilities. It never includes an address, a name, a date of birth, or routines unless
 * `shareAvailability` is chosen. Before an invitation is accepted the invitee sees only the label.
 */
export interface Connection {
  id: string;
  pending: boolean;
  expiresAt: string;
  relationship: InviteRelationship | null;
  family: PlanningFamily | null;
}

async function token(): Promise<string> {
  if (!supabase) throw new InviteError('unavailable', 'Connecting families is not available in this build.');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new InviteError('not-signed-in', 'Sign in to connect families.');
  return data.session.access_token;
}

async function request(method: string, body?: unknown, query = ''): Promise<{ status: number; data: any }> {
  const jwt = await token();
  const response = await fetch(`${planningApiUrl('connections')}${query}`, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

export function inviteOrigin(): string {
  return typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://family-pilot-seven.vercel.app';
}

export async function createInvite(
  profile: FamilyProfile,
  relationship: InviteRelationship,
): Promise<{ code: string; url: string; expiresAt: string; id: string }> {
  const family = snapshotForSharing(profile, relationship);
  const { status, data } = await request('POST', { action: 'create', family });
  if (status === 429) throw new InviteError('limit', 'You have a lot of open invitations. Cancel one before creating another.');
  if (status >= 400 || !isInviteCode(data.code)) throw new InviteError('unavailable', data.error || 'Could not create the invitation. Please try again.');
  return { code: data.code, id: data.id, expiresAt: data.expiresAt, url: buildInviteUrl(data.code, inviteOrigin()) };
}

/** What a link may show before anyone is signed in: whether it still works, and the inviter's chosen label. */
export async function previewInvite(code: string): Promise<{ valid: false } | { valid: true; label: string; relationship: InviteRelationship | null }> {
  if (!isInviteCode(code)) return { valid: false };
  const response = await fetch(`${planningApiUrl('connections')}?preview=${code}`, { signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new InviteError('unavailable', data.error || 'Could not check the invitation. Please try again.');
  if (!data.valid) return { valid: false };
  return { valid: true, label: data.inviter?.label ?? 'A FamilyPilot family', relationship: data.inviter?.relationship ?? null };
}

export async function acceptInvite(code: string, profile: FamilyProfile): Promise<{ inviterLabel: string }> {
  if (!isInviteCode(code)) throw new InviteError('invalid', 'That invitation link isn’t valid.');
  const family = snapshotForSharing(profile);
  const { status, data } = await request('POST', { action: 'accept', code, family });
  if (status === 400) throw new InviteError('expired', data.error || 'This invitation has expired, been used already, or is your own.');
  if (status >= 400) throw new InviteError('unavailable', data.error || 'Could not accept the invitation. Please try again.');
  return { inviterLabel: data.inviter?.label ?? 'A FamilyPilot family' };
}

export async function listConnections(): Promise<Connection[]> {
  const { status, data } = await request('GET');
  if (status >= 400) throw new InviteError('unavailable', data.error || 'Connections are unavailable. Please try again.');
  return data.connections as Connection[];
}

export async function removeConnection(id: string): Promise<void> {
  const { status, data } = await request('DELETE', { id });
  if (status >= 400) throw new InviteError('unavailable', data.error || 'Could not remove that. Please try again.');
}
