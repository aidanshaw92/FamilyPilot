import { Venue } from '@/src/types';
import { classify, ExploreGroupId, PlayKind } from '@/src/utils/venue-classification';

/**
 * What a parent typed into Explore's search, turned into places: by name, by the kind of place they mean ("soft play",
 * "museum", "farm"), or by where ("Camden"). Everything runs on the places already loaded, with no request.
 *
 * THE RULE THAT MATTERS: "soft play" lists the places whose own pages say they have soft play, first, and lists a trampoline
 * park only under its own heading ("Also: trampoline parks, soft play not on record"), never as soft play. "trampoline" lists the
 * places with trampolines and none that says it has none. A name wins over a meaning: typing "London Eye" lists it first.
 * (What a place is comes from venue-classification.ts.)
 *
 * PLAY CAFÉS ARE NOT SOFT PLAY. A café built around play for under-5s whose own pages do not say it has soft play is an Activity, labelled "Play café".
 * "play café", "toddler play", "under 5s" and "indoor toddler activities" find it. "soft play" does not list it as soft play: it appears under its own
 * heading ("Related: play cafés for under-5s"), after the venues whose own pages say soft play. Nothing here claims a venue suits a toddler: a result is
 * there because of what the venue says it is, and the ages shown on a card are the ones the venue wrote.
 */
interface Intent {
  id: string;
  group: ExploreGroupId;
  subtype?: 'soft_play' | 'trampoline' | 'play_cafe' | 'toddler';
  /** Sort places with a confirmed playground first, without leaving out the rest of the parks. */
  preferPlayground?: boolean;
  phrases: string[];
}

const INTENTS: readonly Intent[] = [
  { id: 'soft_play', group: 'play', subtype: 'soft_play', phrases: ['soft play', 'softplay', 'indoor play', 'play centre', 'play center', 'ball pit', 'ball pool'] },
  { id: 'play_cafe', group: 'attractions', subtype: 'play_cafe', phrases: ['play cafe', 'play cafes', 'playcafe', 'role play cafe'] },
  { id: 'toddler', group: 'play', subtype: 'toddler', phrases: ['toddler play', 'toddler activities', 'indoor toddler activities', 'indoor toddler', 'under 5', 'under 5s', 'under fives', 'under 5 activities', 'under 5s activities', 'stay and play', 'baby and toddler'] },
  { id: 'trampoline', group: 'play', subtype: 'trampoline', phrases: ['trampoline', 'trampolines', 'trampoline park', 'bounce', 'bouncing', 'jump', 'jumping'] },
  { id: 'playground', group: 'parks', preferPlayground: true, phrases: ['playground', 'playgrounds', 'swings'] },
  { id: 'parks', group: 'parks', phrases: ['park', 'parks', 'garden', 'gardens', 'heath', 'common', 'woods', 'woodland', 'nature reserve', 'wetlands', 'green space'] },
  { id: 'museums', group: 'museums', phrases: ['museum', 'museums', 'gallery', 'galleries', 'exhibition', 'exhibitions'] },
  { id: 'animals', group: 'animals', phrases: ['farm', 'farms', 'city farm', 'animals', 'animal', 'zoo', 'zoos', 'petting zoo', 'aquarium', 'wildlife'] },
  { id: 'attractions', group: 'attractions', phrases: ['attraction', 'attractions', 'activity', 'activities', 'bowling', 'skating', 'ice skating', 'theme park', 'things to do'] },
];

export interface SearchOutcome {
  /** False for an empty search: the caller shows everything it has. */
  active: boolean;
  /** What the words were taken to mean, for the line that says so ("Soft play"); null when they are a name or a place. */
  interpretation: string | null;
  primary: Venue[];
  /** Places that fit a looser reading, each under its own honest heading and never mixed into `primary`. */
  also: { id: string; label: string; venues: Venue[] }[];
}

/** Lower case, accents folded ("café" is "cafe"), punctuation as spaces. */
const normalise = (value: string): string =>
  value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** The longest phrase of any intent found as whole words in the query, and what is left of the query without it. */
function findIntent(query: string): { intent: Intent; rest: string } | null {
  let best: { intent: Intent; phrase: string } | null = null;
  const padded = ` ${query} `;
  for (const intent of INTENTS) {
    for (const phrase of intent.phrases) {
      if (padded.includes(` ${phrase} `) && (!best || phrase.length > best.phrase.length)) best = { intent, phrase };
    }
  }
  if (!best) return null;
  const rest = padded.replace(` ${best.phrase} `, ' ').replace(/\s+/g, ' ').trim();
  return { intent: best.intent, rest };
}

const stablePartition = <T,>(items: T[], first: (item: T) => boolean): T[] => [...items.filter(first), ...items.filter((i) => !first(i))];

const INTERPRETATION: Record<string, string> = {
  soft_play: 'Soft play',
  play_cafe: 'Play cafés',
  toddler: 'Toddler play: soft play and play cafés',
  trampoline: 'Trampoline parks',
  playground: 'Parks and playgrounds',
  parks: 'Parks and playgrounds',
  museums: 'Museums and galleries',
  animals: 'Farms and animals',
  attractions: 'Attractions and activities',
};

export function searchVenues(venues: readonly Venue[], rawQuery: string): SearchOutcome {
  const query = normalise(rawQuery);
  if (!query) return { active: false, interpretation: null, primary: [...venues], also: [] };

  const nameOf = (v: Venue) => normalise(v.name);
  const textOf = (v: Venue) => `${nameOf(v)} ${normalise(v.address ?? '')}`;
  const tokens = query.split(' ');
  const isNameMatch = (v: Venue) => tokens.every((t) => nameOf(v).includes(t));

  const found = findIntent(query);
  if (found) {
    const restTokens = found.rest ? found.rest.split(' ') : [];
    const placeOk = (v: Venue) => restTokens.every((t) => textOf(v).includes(t));
    const { intent } = found;
    const profile = (v: Venue) => classify(v).play;
    const kind = (v: Venue): PlayKind | null => classify(v).kind;
    const inGroup = (v: Venue) => classify(v).group === intent.group;
    const where = (v: Venue) => placeOk(v);
    // Dedicated soft-play venues first, then venues that are mostly something else but whose own pages confirm a soft-play area.
    const softPlayFirst = (list: Venue[]) => stablePartition(list, (v) => kind(v) === 'soft_play');
    const playCafes = () => venues.filter((v) => where(v) && kind(v) === 'play_cafe');

    let primary: Venue[];
    const also: SearchOutcome['also'] = [];
    if (intent.subtype === 'soft_play') {
      primary = softPlayFirst(venues.filter((v) => where(v) && profile(v)?.softPlay === 'confirmed'));
      const trampolineOnly = venues.filter((v) => where(v) && inGroup(v) && profile(v)?.softPlay !== 'confirmed' && profile(v)?.trampolines === 'confirmed');
      const unconfirmed = venues.filter((v) => where(v) && inGroup(v) && profile(v)?.softPlay === 'not_confirmed' && profile(v)?.trampolines !== 'confirmed' && kind(v) !== 'play_cafe');
      const cafes = playCafes();
      if (cafes.length) also.push({ id: 'play_cafes', label: 'Related: play cafés for under-5s, soft play not on record', venues: cafes });
      if (unconfirmed.length) also.push({ id: 'indoor_play', label: 'Indoor play, soft play not confirmed', venues: unconfirmed });
      if (trampolineOnly.length) also.push({ id: 'trampoline_only', label: 'Also: trampoline parks, soft play not on record', venues: trampolineOnly });
    } else if (intent.subtype === 'play_cafe') {
      primary = playCafes();
      const soft = softPlayFirst(venues.filter((v) => where(v) && profile(v)?.softPlay === 'confirmed' && kind(v) === 'soft_play'));
      if (soft.length) also.push({ id: 'soft_play_related', label: 'Related: soft play', venues: soft });
    } else if (intent.subtype === 'toddler') {
      // What a parent of a toddler means by these words is "somewhere indoors for little ones": the venues that say soft play first, the play cafés under their own heading.
      primary = softPlayFirst(venues.filter((v) => where(v) && profile(v)?.softPlay === 'confirmed'));
      const cafes = playCafes();
      if (cafes.length) also.push({ id: 'play_cafes', label: 'Play cafés for under-5s', venues: cafes });
    } else if (intent.subtype === 'trampoline') {
      primary = venues.filter((v) => where(v) && inGroup(v) && profile(v)?.trampolines === 'confirmed');
    } else {
      primary = venues.filter((v) => where(v) && inGroup(v));
      if (intent.preferPlayground) primary = stablePartition(primary, (v) => v.trustedFacts?.playground === 'yes');
    }
    // A name that matches wins over a meaning: it is listed first, and is never dropped for not being "of the kind".
    const byName = venues.filter((v) => isNameMatch(v) && !primary.includes(v) && !also.some((g) => g.venues.includes(v)));
    primary = stablePartition([...primary, ...byName], isNameMatch);
    if (primary.length || also.length) {
      return { active: true, interpretation: INTERPRETATION[intent.id] ?? null, primary, also };
    }
  }

  // A name, or a place ("Camden"): the words are in the name or the address.
  const named = venues.filter((v) => tokens.every((t) => textOf(v).includes(t)));
  return { active: true, interpretation: null, primary: stablePartition(named, isNameMatch), also: [] };
}

/** Whether every word typed is in the place's name: the test for "this is the place they named". */
export function nameMatches(venue: Venue, rawQuery: string): boolean {
  const query = normalise(rawQuery);
  if (!query) return false;
  const name = normalise(venue.name);
  return query.split(' ').every((token) => name.includes(token));
}

