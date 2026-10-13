import type { DayItinerary, SequenceLeg } from '@/src/types/day-sequence';

import { familyDisplayName } from '@/src/utils/family-title';

import { UNDISCLOSED_FIELD } from './must-have-labels';
import { PlanMatch, clockLabel } from './planner';
import type { PlanViewModelInput } from './plan-view-model';

/**
 * Sending a day to a connected family, and what they receive.
 *
 * A saved day (`SavedDay.source`) is the planner's own answer for ONE household's phone: it carries that household's
 * routine overlaps, the routine a visit was shortened for (whose id names a child), whether a pushchair is used, the
 * must-haves it stated, and the photo URLs this device cached. None of that belongs on another family's phone. The
 * connection contract (connection-snapshot.ts) says what a connected family may see; a day sent to them must not widen it,
 * and PR #196's rule applies here too: what the other family needs is used, never read back.
 *
 * So a day is not sent as saved. `buildSharedDay` makes a plain copy of the OUTING (the places, the times, each family's
 * leave and home time, the venue's own facts and notes) with everything private to the sender removed, and
 * `reframeForRecipient` turns it round on arrival so that the recipient reads it as their own plan with the sender as the
 * other family. The server stores it as an opaque JSON object (api/planning/plan-invites.js: size limit only), so this needs
 * no migration and no new endpoint.
 *
 * The envelope is also a valid legacy `PlanMatch` (name, timings, start, end), so an older build that still lists
 * "Shared with you" reads a new invitation instead of failing on it.
 *
 * Pure: no store, no network, no clock.
 */

export const SHARED_DAY_VERSION = 2 as const;
/** The endpoint refuses a snapshot over 8,000 characters; a margin is kept. */
export const MAX_SHARED_JSON = 7500;
/** The sender is always `mine` on their own device. */
export const SENDER_ID = 'mine';
export const OWN_LABEL = 'Our family';

export interface SharedDayEnvelope extends PlanMatch {
  v: typeof SHARED_DAY_VERSION;
  kind: 'day';
  day: PlanViewModelInput;
}

export class SharedDayTooLargeError extends Error {
  constructor() {
    super('This plan is too large to send in the app.');
    this.name = 'SharedDayTooLargeError';
  }
}

export const connectedFamilyId = (connectionId: string): string => `connected-${connectionId}`;
export const connectionIdOf = (familyId: string): string | null => (familyId.startsWith('connected-') ? familyId.slice('connected-'.length) : null);

export function isSharedDayEnvelope(plan: unknown): plan is SharedDayEnvelope {
  const p = plan as Partial<SharedDayEnvelope> | null;
  return Boolean(p && typeof p === 'object' && p.v === SHARED_DAY_VERSION && p.kind === 'day' && p.day && typeof p.day === 'object' && (p.day as PlanViewModelInput).itinerary);
}

/** The connected (account) families a day was planned with: the ones it can be sent to in the app. */
export function sharedDayRecipients(source: PlanViewModelInput): { familyId: string; connectionId: string; label: string }[] {
  const out: { familyId: string; connectionId: string; label: string }[] = [];
  for (const family of source.itinerary.families) {
    const connectionId = connectionIdOf(family.familyId);
    if (connectionId) out.push({ familyId: family.familyId, connectionId, label: family.label });
  }
  return out;
}

/** Whether the day was planned with someone who is not a connected family (added by postcode): it can be shared as text only. */
export function hasUnconnectedFamily(source: PlanViewModelInput): boolean {
  return source.itinerary.families.some((f) => f.familyId !== SENDER_ID && !connectionIdOf(f.familyId));
}

/** Venue facts only. What a venue has or has not published says nothing about who in the party needs it. */
const VENUE_FACT_UNKNOWN = /^(Opening hours|Recommended ages)/i;
const ROUTINE_REASON = /routine|nap|feed/i;

/** The sender's day with everything private to the sender removed, keeping only the recipient's own entries. */
function sanitise(source: PlanViewModelInput, recipientId: string): PlanViewModelInput {
  const it = source.itinerary;
  const itinerary: DayItinerary = {
    ...it,
    families: it.families.map((f) => ({ ...f, notes: [] })),
    unknowns: it.unknowns.filter((u) => VENUE_FACT_UNKNOWN.test(u)),
    reasons: it.reasons.filter((r) => !ROUTINE_REASON.test(r)),
    routineInsights: [],
    homeAfter: [],
    // The recipient's own entries come back to them as they gave them; anyone else's (the sender's included) keep only
    // that something is unconfirmed, never what it is.
    unresolvedMustHaves: it.unresolvedMustHaves.map((m) => (m.familyId === recipientId ? m : { ...m, field: UNDISCLOSED_FIELD })),
  };
  const media: NonNullable<PlanViewModelInput['media']> = {};
  for (const [id, m] of Object.entries(source.media ?? {})) media[id] = { category: m.category };
  const visit = source.visit
    ? source.visit.basis === 'routine-limited'
      ? { minutes: source.visit.minutes, basis: 'chosen' as const }
      : { ...source.visit, routineId: undefined, familyId: undefined, unshortenedMinutes: undefined }
    : undefined;
  const { acceptedConflict: _acceptedConflict, alternatives: _alternatives, ...rest } = source;
  void _acceptedConflict;
  void _alternatives;
  return {
    ...rest,
    itinerary,
    media,
    visit,
    alternatives: [],
    hasRoutines: false,
    buggyFamilyIds: (source.buggyFamilyIds ?? []).filter((id) => id === recipientId),
  };
}

function legacyTimings(it: DayItinerary): PlanMatch['timings'] {
  const arrive = it.stops[0]?.arrive ?? 0;
  const leaveVenue = it.stops[it.stops.length - 1]?.depart ?? 0;
  const leg = (kind: SequenceLeg['kind'], id: string) => it.legs.find((l) => l.kind === kind && 'familyId' in l && l.familyId === id)?.travelMinutes ?? 0;
  return it.families.map((f) => ({
    familyId: f.familyId,
    label: f.label,
    depart: f.depart,
    arrive,
    leaveVenue,
    home: f.home,
    latestDeparture: f.latestDeparture,
    journey: { outbound: leg('rendezvous', f.familyId), inbound: leg('return', f.familyId), source: 'estimated' as const },
    notes: [],
  }));
}

/**
 * The invitation payload for one connected family. Throws `SharedDayTooLargeError` when even the trimmed outing would not
 * fit what the endpoint accepts; the caller then offers the plan as text instead.
 */
export function buildSharedDay(source: PlanViewModelInput, connectionId: string, name: string): SharedDayEnvelope {
  const day = sanitise(source, connectedFamilyId(connectionId));
  const it = day.itinerary;
  const envelope: SharedDayEnvelope = {
    v: SHARED_DAY_VERSION,
    kind: 'day',
    day,
    venueId: it.stops.find((s) => s.anchor)?.placeId ?? it.stops[0]?.placeId ?? '',
    name,
    timings: legacyTimings(it),
    start: it.stops[0]?.arrive ?? 0,
    end: Math.max(0, ...it.families.map((f) => f.home)),
    fairnessGap: it.fairnessGap,
    reasons: it.reasons,
    unknowns: it.unknowns,
    score: it.score,
  };
  // Trim the least useful parts first until it fits: photos' categories, then the place-to-eat details, then the anchor's facts.
  const trims: (((d: PlanViewModelInput) => void) | undefined)[] = [
    undefined,
    (d) => { d.media = undefined; },
    (d) => { d.lunchFacts = undefined; },
    (d) => { d.anchorFacts = undefined; },
  ];
  for (const trim of trims) {
    trim?.(envelope.day);
    if (JSON.stringify(envelope).length <= MAX_SHARED_JSON) return envelope;
  }
  throw new SharedDayTooLargeError();
}

function swapDeep<T>(value: T, swap: (id: string) => string): T {
  if (Array.isArray(value)) return value.map((v) => swapDeep(v, swap)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'familyId' && typeof v === 'string') out[k] = swap(v);
      else if (k === 'familyIds' && Array.isArray(v)) out[k] = v.map((x) => (typeof x === 'string' ? swap(x) : x));
      else out[k] = swapDeep(v, swap);
    }
    return out as T;
  }
  return value;
}

/**
 * The day as the RECIPIENT reads it: they are `mine` ("Our family"), and the sender is the connected family on their
 * phone (`connected-<connection id>`, the id both phones use for each other), under the label the sender shares.
 */
export function reframeForRecipient(day: PlanViewModelInput, opts: { connectionId: string; senderLabel: string }): PlanViewModelInput {
  const recipientOnSender = connectedFamilyId(opts.connectionId);
  const swap = (id: string) => (id === SENDER_ID ? recipientOnSender : id === recipientOnSender ? SENDER_ID : id);
  const labelFor = (id: string, fallback: string) => (id === SENDER_ID ? OWN_LABEL : id === recipientOnSender ? opts.senderLabel : fallback);
  const itinerary = swapDeep(day.itinerary, swap);
  // The Plan screen reads the first family as the reader, so the recipient goes first.
  const families = itinerary.families
    .map((f) => ({ ...f, label: labelFor(f.familyId, f.label) }))
    .sort((a, b) => (a.familyId === SENDER_ID ? -1 : b.familyId === SENDER_ID ? 1 : 0));
  return {
    ...day,
    itinerary: {
      ...itinerary,
      families,
      unresolvedMustHaves: itinerary.unresolvedMustHaves.map((m) => ({ ...m, familyLabel: labelFor(m.familyId, m.familyLabel) })),
    },
    buggyFamilyIds: (day.buggyFamilyIds ?? []).map(swap),
  };
}

/** A short text version of a day, for the phone's share sheet: how a family without an account (or on WhatsApp) is invited. */
export function outingText(source: PlanViewModelInput, title: string, dateLabel: string): string {
  const it = source.itinerary;
  const lines = [`${title} · ${dateLabel}`];
  for (const stop of it.stops) lines.push(`${clockLabel(stop.arrive)}  ${stop.role === 'meal' ? 'Lunch at ' : ''}${stop.name}`);
  for (const f of it.families) lines.push(`${f.label}: leave ${clockLabel(f.depart)}, home about ${clockLabel(f.home)}`);
  lines.push('Times are estimates. Check opening hours before you go.');
  return lines.join('\n');
}

/** Where a sent day has got to, in one line, from the invitations made for it. Pending wins: that is what is still to happen. */
export function describeSent(sent: { status: 'pending' | 'accepted' | 'declined'; otherLabel: string }[]): { text: string; tone: 'waiting' | 'accepted' | 'declined' } | undefined {
  if (!sent.length) return undefined;
  const names = (list: typeof sent) => list.map((i) => familyDisplayName(i.otherLabel)).join(' and ');
  const pending = sent.filter((i) => i.status === 'pending');
  const accepted = sent.filter((i) => i.status === 'accepted');
  const declined = sent.filter((i) => i.status === 'declined');
  if (pending.length) return { text: `Sent to ${names(pending)} · waiting for a reply`, tone: 'waiting' };
  if (accepted.length && declined.length) return { text: `${names(accepted)} accepted · ${names(declined)} declined`, tone: 'accepted' };
  if (declined.length) return { text: `${names(declined)} declined`, tone: 'declined' };
  return { text: `${names(accepted)} accepted`, tone: 'accepted' };
}
