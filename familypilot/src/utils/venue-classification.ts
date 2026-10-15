import { Venue, VenueCategory } from '@/src/types';

/**
 * WHAT KIND OF PLACE IS THIS, as Explore says it: five groups, and for the play group a subtype that tells soft play from
 * trampoline parks.
 *
 * WHY IT IS NOT JUST `venue.category`. The stored category was assigned by rules that cannot tell apart the things a parent
 * asks about (docs/CATALOGUE_BOTTLENECKS.md, docs/CATALOGUE_CORRECTIONS.md): six venues are filed as soft play, of which two are
 * trampoline parks, one is an indoor play centre that says it has no trampolines, and none is a verified toddler soft play
 * centre; a museum is filed as an attraction, a nature reserve as an attraction, a park as an activity. This module reads the
 * stored category and then applies two things, in this order of authority:
 *
 *   1. REVIEWED: a short list (REVIEWED_PLACES) of the venues in the corrections ledger whose own pages, or whose recorded
 *      Google type, settle the question. Each says what it was read from. It changes only how Explore groups and labels the
 *      place. No stored row changes, and deleting an entry restores today's behaviour for that place exactly.
 *   2. THE NAME, for a place filed as soft play that nobody has reviewed: a name that says trampoline is a trampoline park, a
 *      name that says soft play is soft play, and anything else is "indoor play, soft play not confirmed". Never "soft play".
 *
 * Nothing here invents a fact. "Soft play: confirmed" needs the venue's own words; a trampoline park with no evidence of soft
 * play is "not confirmed", which is different from "none". Indoor and outdoor stay in venue-taxonomy.ts.
 */
export type ExploreGroupId = 'parks' | 'museums' | 'animals' | 'play' | 'attractions';

export const EXPLORE_GROUPS: readonly { id: ExploreGroupId; label: string }[] = [
  { id: 'parks', label: 'Parks & playgrounds' },
  { id: 'museums', label: 'Museums & galleries' },
  { id: 'animals', label: 'Farms & animals' },
  { id: 'play', label: 'Soft play & trampolines' },
  { id: 'attractions', label: 'Attractions & activities' },
];

export function groupLabel(id: ExploreGroupId): string {
  return EXPLORE_GROUPS.find((g) => g.id === id)?.label ?? 'Places';
}

/** What the evidence says about one feature of a play venue. `not_confirmed` is not `no`: nobody has said either way. */
export type PlayFact = 'confirmed' | 'no' | 'not_confirmed';

export interface PlayProfile {
  softPlay: PlayFact;
  trampolines: PlayFact;
}

export interface Classification {
  /** Null for a place that is not an Explore destination (a restaurant, a cafe). */
  group: ExploreGroupId | null;
  /** The words under the title: "Soft play", "Trampoline park", "Nature reserve". */
  label: string;
  /** Present for the play group only. */
  play?: PlayProfile;
  /** True where a reviewed entry says this is not a separate place (part of another venue, or not a family destination). */
  hidden: boolean;
  /** Where a visit usually happens when this differs from the stored category. A usual answer, never a confirmed one. */
  usualEnvironment?: 'indoor' | 'outdoor' | 'mixed';
  /** What the classification stands on, so no screen presents a guess as a checked fact. */
  basis: 'reviewed' | 'name' | 'category';
  /** What the venue's own pages say, for the cards of reviewed play venues. */
  evidence: string[];
}

interface ReviewedPlace {
  group?: ExploreGroupId;
  label?: string;
  /** Where a visit usually happens when the stored category says otherwise. Never a confirmed fact (see environmentOf). */
  usualEnvironment?: 'indoor' | 'outdoor' | 'mixed';
  play?: PlayProfile;
  hidden?: boolean;
  evidence?: string[];
}

/**
 * The reviewed places (docs/CATALOGUE_CORRECTIONS.md, sections 2 and 3), keyed by FamilyPilot place id. Every entry names where
 * its answer comes from; a venue whose evidence is not in the ledger is not here.
 */
export const REVIEWED_PLACES: Readonly<Record<string, ReviewedPlace>> = {
  // Soft play versus trampoline parks, from each venue's own pages.
  'fp-google-ChIJ2fFKeuMDdkgRLHMNKVOxX_s': { // Flip Out Canary Wharf
    group: 'play', label: 'Indoor play centre with soft play',
    play: { softPlay: 'confirmed', trampolines: 'no' },
    evidence: ['Soft play: its own page lists it', 'No trampolines: its own page says so'],
  },
  'fp-google-ChIJb5wm6eQQdkgR-qbm_aXw0xw': { // Flip Out Brent Cross
    group: 'play', label: 'Trampoline park with soft play',
    play: { softPlay: 'confirmed', trampolines: 'confirmed' },
    evidence: ['Soft play and trampolines: its own page lists both'],
  },
  'fp-google-ChIJ0ZZcI7hrdkgR4ooSY3kKOMo': { // Flip Out Watford
    group: 'play', label: 'Trampoline park with soft play',
    play: { softPlay: 'confirmed', trampolines: 'confirmed' },
    evidence: ['Soft play and trampolines: its own page lists both'],
  },
  'fp-google-ChIJ7_PV980bdkgROekbwOVWVfo': { // Babylon Park London
    group: 'play', label: 'Indoor play centre with soft play',
    play: { softPlay: 'confirmed', trampolines: 'not_confirmed' },
    evidence: ['Soft play: its FAQ mentions soft play areas for toddlers and kids'],
  },
  'fp-google-ChIJbe-XLh0fdkgRnjEVL2_qP3E': { // AirHop Adventure & Trampoline Park Enfield
    group: 'play', label: 'Trampoline park',
    play: { softPlay: 'not_confirmed', trampolines: 'confirmed' },
    evidence: ['Trampolines: from its name. Soft play is not confirmed'],
  },
  'fp-google-ChIJi3VUUWoWdkgRluIRG5hbIlY': { // Jump In by AirHop Adventure & Trampoline Park Elstree
    group: 'play', label: 'Trampoline park',
    play: { softPlay: 'not_confirmed', trampolines: 'confirmed' },
    evidence: ['Trampolines: from its name. Soft play is not confirmed'],
  },
  // Filed in the wrong group.
  'fp-google-ChIJYXZohAkQdkgRfyZIWSl03SM': { group: 'parks', label: 'Park with sports facilities', usualEnvironment: 'outdoor' }, // Paddington Recreation Ground
  'fp-google-ChIJgUtOcjEcdkgR6Y_NLIc0XBQ': { group: 'parks', label: 'Nature reserve', usualEnvironment: 'outdoor' }, // Walthamstow Wetlands
  'fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY': { group: 'parks', label: 'Park with a museum', usualEnvironment: 'outdoor' }, // Gunnersbury Park
  'fp-google-ChIJq4lX1doEdkgR5JXPstgQjc0': { group: 'museums', label: 'Museum', usualEnvironment: 'indoor' }, // Churchill War Rooms
  'fp-google-ChIJc2nSALkEdkgRviluWxwFsxA': { group: 'animals', label: 'Aquarium', usualEnvironment: 'indoor' }, // SEA LIFE London Aquarium
  'fp-google-ChIJIzTunOc9dkgRbjkvBBrPY0U': { group: 'attractions', label: 'Seasonal attraction, to be confirmed' }, // Tulleys Tulip Fields
  // Not separate destinations.
  'fp-google-ChIJjXVQ6QNBdkgRUpu1zpMlFSs': { hidden: true }, // Hogwarts Castle: part of Warner Bros. Studio Tour London
  'fp-google-ChIJLcZnZgBBdkgRVa6ewdVh-1w': { hidden: true }, // Harry Potter Studio: an alias of Warner Bros. Studio Tour London
  'fp-google-ChIJt1tI0ZcRdkgRY71kqlLf7Vs': { hidden: true }, // Troubadour Wembley Park Theatre: a theatre
  'fp-google-ChIJoapqFmI8dkgRFrAV0X3pn_A': { hidden: true }, // College Lane Campus LRC: a university library
};

const GROUP_BY_CATEGORY: Partial<Record<VenueCategory, ExploreGroupId>> = {
  park: 'parks',
  beach: 'parks',
  museum: 'museums',
  farm: 'animals',
  zoo: 'animals',
  soft_play: 'play',
  attraction: 'attractions',
  activity: 'attractions',
};

const LABEL_BY_CATEGORY: Partial<Record<VenueCategory, string>> = {
  park: 'Park',
  beach: 'Beach',
  museum: 'Museum',
  farm: 'Farm',
  zoo: 'Zoo',
  attraction: 'Attraction',
  activity: 'Activity',
};

const TRAMPOLINE_NAME = /trampolin|air ?hop|jump in|bounce|flip out/i;
const SOFT_PLAY_NAME = /soft ?play|play ?(centre|center|zone|barn|village)|tots|toddler|ball ?pit|stay (and|&) play/i;

/** The play profile an unreviewed venue filed as soft play can honestly have: from its name only. */
function playFromName(name: string): { play: PlayProfile; label: string } {
  const trampoline = TRAMPOLINE_NAME.test(name);
  const soft = SOFT_PLAY_NAME.test(name);
  if (soft && !trampoline) return { play: { softPlay: 'confirmed', trampolines: 'not_confirmed' }, label: 'Soft play' };
  if (trampoline && !soft) return { play: { softPlay: 'not_confirmed', trampolines: 'confirmed' }, label: 'Trampoline park' };
  if (trampoline && soft) return { play: { softPlay: 'confirmed', trampolines: 'confirmed' }, label: 'Trampoline park with soft play' };
  return { play: { softPlay: 'not_confirmed', trampolines: 'not_confirmed' }, label: 'Indoor play, soft play not confirmed' };
}

export function classify(venue: Pick<Venue, 'id' | 'name' | 'category'>): Classification {
  const reviewed = REVIEWED_PLACES[venue.id];
  const storedGroup = GROUP_BY_CATEGORY[venue.category] ?? null;
  if (reviewed) {
    const group = reviewed.group ?? storedGroup;
    return {
      group,
      label: reviewed.label ?? LABEL_BY_CATEGORY[venue.category] ?? 'Place',
      play: reviewed.play,
      usualEnvironment: reviewed.usualEnvironment,
      hidden: reviewed.hidden === true,
      basis: 'reviewed',
      evidence: reviewed.evidence ?? [],
    };
  }
  if (storedGroup === 'play') {
    const { play, label } = playFromName(venue.name);
    return { group: 'play', label, play, hidden: false, basis: 'name', evidence: [] };
  }
  return {
    group: storedGroup,
    label: LABEL_BY_CATEGORY[venue.category] ?? 'Place',
    hidden: false,
    basis: 'category',
    evidence: [],
  };
}

export function groupOf(venue: Pick<Venue, 'id' | 'name' | 'category'>): ExploreGroupId | null {
  const c = classify(venue);
  return c.hidden ? null : c.group;
}
