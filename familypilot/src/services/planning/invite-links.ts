/**
 * Connection invites as links.
 *
 * An invite is the existing single-use, expiring connection code (`planning_connections`, 256 random bits, stored only
 * as a SHA-256 hash, seven days, one acceptance), carried in a link instead of being typed. The link holds that code and
 * nothing else: no name, no address, no child, no account id.
 *
 * Pure parsing and formatting only; the network calls are in `connection-invites.ts`.
 */
export const INVITE_PATH = 'invite';
const CODE = /^[a-f0-9]{64}$/;

export type InviteRelationship = 'partner' | 'family' | 'friend';
export const INVITE_RELATIONSHIPS: readonly InviteRelationship[] = ['partner', 'family', 'friend'];

export function isInviteCode(value: unknown): value is string {
  return typeof value === 'string' && CODE.test(value);
}

export function buildInviteUrl(code: string, origin: string): string {
  return `${origin.replace(/\/$/, '')}/${INVITE_PATH}/${code}`;
}

/** The code inside a pasted link, or a bare code, or null. Tolerates whitespace and a trailing slash or query. */
export function parseInviteCode(input: string | null | undefined): string | null {
  const text = (input ?? '').trim();
  if (!text) return null;
  if (isInviteCode(text.toLowerCase())) return text.toLowerCase();
  const match = new RegExp(`/${INVITE_PATH}/([a-fA-F0-9]{64})(?:[/?#]|$)`).exec(text);
  return match ? match[1].toLowerCase() : null;
}

/** The message that goes with a link when it is shared. It names no one and says what accepting shares. */
export function inviteShareMessage(url: string, relationship: InviteRelationship, inviterFirstName?: string): string {
  const who = inviterFirstName?.trim() ? `${inviterFirstName.trim()} has` : 'I’ve';
  const what =
    relationship === 'partner'
      ? 'plan days out together'
      : relationship === 'family'
        ? 'plan days out with family'
        : 'plan days out with friends';
  return `${who} invited you to ${what} on FamilyPilot. The link works once and expires in 7 days: ${url}`;
}
