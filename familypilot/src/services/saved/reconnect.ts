/**
 * Reconnecting a saved place whose venue has a new listing. Pure: no store, no request, no screen.
 *
 * WHY. A parent's saved places and saved days live on their device, and name a venue by an id that came with the venue's old provider copy. When a venue is
 * listed again from an independent source it has a new id, so the old one stops resolving: the saved row still draws (from the copy kept on the device) but
 * opening it finds nothing. There is no server-side map from old ids to new ones, on purpose: a map would decide for a parent, silently and in bulk, that two
 * records are one place, and a wrong match would quietly attach their plan to somebody else's venue.
 *
 * WHAT THIS DOES INSTEAD. It PROPOSES: the places in today's catalogue that look like the saved one, with why. It never chooses. The parent confirms one (or none),
 * and only then is the saved place pointed at the new venue. Two places that are close in name and position are both shown; the parent decides.
 *
 * WHAT IT NEVER TOUCHES. A saved day's rendered itinerary (what the day was, as it was planned) is left exactly as it is. Only the id the day would be rebuilt
 * from is repointed, and only for the id the parent confirmed.
 */
import type { SavedDay } from '@/src/stores/planning-store';
import type { SavedItem, Venue, VenueCategory } from '@/src/types';

/** What a saved place remembers about itself, which is all the match has to go on. */
export interface SavedRef { id: string; name: string; category: VenueCategory; latitude: number; longitude: number }
export interface Proposal { venue: Venue; score: number; metres: number; reasons: string[] }
export interface Proposals { proposals: Proposal[]; ambiguous: boolean }

/** A candidate must be this close, and its name this similar, to be proposed at all. A shared word is not enough. */
export const MAX_METRES = 300;
export const MIN_NAME_SCORE = 0.6;
export const MAX_PROPOSALS = 3;
/** Two proposals whose scores are this close are not told apart: the parent is told there is more than one. */
export const AMBIGUITY_GAP = 0.15;

/** Groups of categories a place may move between without being a different kind of place (a house filed as a museum, an aquarium as a zoo). */
const KIND: Record<string, string> = {
  park: 'outdoor', museum: 'visit', attraction: 'visit', zoo: 'visit', farm: 'farm', activity: 'activity', soft_play: 'activity', beach: 'outdoor',
};
const kindOf = (category: string) => KIND[category] ?? category;

/** Words that do not tell two places apart. */
const FILLER = new Set(['the', 'of', 'and', 'a', 'at', 'in', 'on', 'for', 'london']);

export function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token && !FILLER.has(token));
}

/** Share of the words the two names have in common, over the words of the shorter one (so "Kew Gardens" matches "Royal Botanic Gardens, Kew" only as far as it should). */
export function nameScore(a: string, b: string): number {
  const x = new Set(nameTokens(a)); const y = new Set(nameTokens(b));
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const token of x) if (y.has(token)) shared += 1;
  const shorter = Math.min(x.size, y.size);
  const longer = Math.max(x.size, y.size);
  // overlap on the shorter name, damped when the longer one has many more words the saved one does not
  return (shared / shorter) * (0.6 + 0.4 * (shorter / longer));
}

export function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** A saved place needs reconnecting when its id is not among the ids the catalogue serves now. */
export function needsReconnect(venueId: string, servedIds: ReadonlySet<string>): boolean {
  return !servedIds.has(venueId);
}

export const refOf = (venue: Venue): SavedRef => ({ id: venue.id, name: venue.name, category: venue.category, latitude: venue.latitude, longitude: venue.longitude });

/**
 * The places in the catalogue that look like the saved one: the same kind of place, within 300 m, with most of the name's words in common. Nearest-best first,
 * at most three. `ambiguous` says the top two are too alike to call.
 */
export function proposeCandidates(ref: SavedRef, catalogue: readonly Venue[]): Proposals {
  const found: Proposal[] = [];
  for (const venue of catalogue) {
    if (venue.id === ref.id) continue;
    if (kindOf(venue.category) !== kindOf(ref.category)) continue;
    if (![venue.latitude, venue.longitude, ref.latitude, ref.longitude].every(Number.isFinite)) continue;
    const metres = metresBetween(ref.latitude, ref.longitude, venue.latitude, venue.longitude);
    if (metres > MAX_METRES) continue;
    const score = nameScore(ref.name, venue.name);
    if (score < MIN_NAME_SCORE) continue;
    const reasons = [score >= 0.99 ? 'same name' : 'similar name', metres < 50 ? 'in the same spot' : `${Math.round(metres)} m away`];
    found.push({ venue, score, metres, reasons });
  }
  // better name first; between equals, the nearer
  found.sort((a, b) => b.score - a.score || a.metres - b.metres);
  const proposals = found.slice(0, MAX_PROPOSALS);
  const ambiguous = proposals.length > 1 && proposals[0].score - proposals[1].score < AMBIGUITY_GAP;
  return { proposals, ambiguous };
}

/**
 * Point a saved place at the venue the parent confirmed. Keeps the row's group, its saved time and its own id, so nothing about how it is listed changes
 * but which place it opens. The old copy is replaced, not merged: nothing the device kept about the old listing survives on the new row.
 */
export function reconnectSaved(items: readonly SavedItem[], oldId: string, venue: Venue): SavedItem[] {
  return items.map((item) => (item.venue.id === oldId ? { ...item, venue } : item));
}

/** The saved ids with the old one replaced, in the same position. */
export function reconnectIds(savedIds: readonly string[], oldId: string, newId: string): string[] {
  const out = savedIds.map((id) => (id === oldId ? newId : id));
  return out.filter((id, index) => out.indexOf(id) === index);
}

/**
 * A saved day is rebuilt from its draft. Repoint the draft's venue id and nothing else: the day's rendered itinerary (`source`) is what was planned and stays as
 * it is, so a day already made is never altered by this.
 */
export function reconnectDays(days: readonly SavedDay[], oldId: string, newId: string): SavedDay[] {
  return days.map((day) => (day.draft?.venueId === oldId ? { ...day, draft: { ...day.draft, venueId: newId } } : day));
}
