/**
 * Asking today's catalogue what is listed where a saved place was, so a place whose old listing has gone can be offered a successor.
 *
 * What this is allowed to do: read. It calls the stored-catalogue read (`intent=catalogue`, nearest first), which is a database read behind the search
 * endpoint and holds no Google client (`catalogue-endpoint.js`, `googleCalls: 0`), so looking never spends anything and never discovers through a provider.
 * It sends the saved place's own position (a public venue's position, not the family's home) and a small radius, and nothing else.
 *
 * What it never does: choose. It returns what is listed and what looks like the saved place (`proposeCandidates`, which only ever proposes); the parent
 * confirms in the sheet. A request that fails is NOT an answer: an outage must never read as "this place is gone", so failure throws and the caller shows
 * nothing at all.
 */
import { mergePlaceToVenue } from '@/src/services/places/merge-place';
import type { ExternalPlaceRecord } from '@/src/types/places';
import type { SavedItem, Venue } from '@/src/types';

import { MAX_METRES, proposeCandidates, refOf, type Proposals } from './reconnect';

function baseUrl(): string {
  if (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_PLACES_API_URL) return process.env.EXPO_PUBLIC_PLACES_API_URL.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) return `${window.location.origin}/api/places`;
  return '/api/places';
}

/** What the catalogue says about one saved place. */
export type SuccessorLookup =
  /** The saved id is still listed: there is nothing to offer, and the row shows nothing extra. */
  | { status: 'listed' }
  /** The saved id is not listed now, and today's catalogue has places that look like it. */
  | { status: 'relisted'; proposals: Proposals }
  /** The saved id is not listed now, and nothing nearby looks like it. */
  | { status: 'gone' };

/**
 * Only a place that came from Google can have lost its listing to the recovery: independent venues keep their ids. A saved restaurant, hotel or shop is not
 * in the venue catalogue at all, so "not listed" would be a wrong answer for it and it is never looked up.
 */
export function mayHaveLostItsListing(item: SavedItem): boolean {
  const venue = item.venue;
  if (item.type !== 'place') return false;
  if (!Number.isFinite(venue.latitude) || !Number.isFinite(venue.longitude)) return false;
  return venue.provider === 'google' || venue.id.startsWith('fp-google-');
}

/** Pure: what a catalogue answer means for one saved place. Tested without a network. */
export function readLookup(saved: SavedItem, records: readonly ExternalPlaceRecord[]): SuccessorLookup {
  const ref = refOf(saved.venue);
  if (records.some((record) => record.familypilotId === ref.id)) return { status: 'listed' };
  // The venue is built for display; the "home" for travel time is the saved position itself, so no family location is involved.
  const catalogue: Venue[] = records.map((record) => mergePlaceToVenue(record, null, ref.latitude, ref.longitude));
  const proposals = proposeCandidates(ref, catalogue);
  return proposals.proposals.length > 0 ? { status: 'relisted', proposals } : { status: 'gone' };
}

/** Looks the saved place up. Throws on any failure (an unreachable catalogue is not "gone"). */
export async function lookUpSuccessor(saved: SavedItem): Promise<SuccessorLookup> {
  const { latitude, longitude } = saved.venue;
  const radiusKm = Math.max(0.5, (MAX_METRES * 1.5) / 1000);
  const query = new URLSearchParams({ intent: 'catalogue', lat: String(latitude), lng: String(longitude), radiusKm: String(radiusKm), limit: '60' });
  const response = await fetch(`${baseUrl()}/search?${query.toString()}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`catalogue ${response.status}`);
  const body = (await response.json()) as { places?: ExternalPlaceRecord[]; intent?: string };
  if (body.intent !== 'catalogue' || !Array.isArray(body.places)) throw new Error('not a catalogue answer');
  return readLookup(saved, body.places);
}
