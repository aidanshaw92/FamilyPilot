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

/**
 * The five kinds of play venue Explore keeps apart, and never folds into one another:
 *
 *   soft_play        a venue whose own pages say it is soft play
 *   play_cafe        a café built around play for under-5s that does NOT say it has soft play (Activities, labelled "Play café")
 *   trampoline_park  a venue whose own pages say it has trampolines
 *   climbing_centre  a venue whose own pages say it is a climbing centre
 *   indoor_activity  any other indoor play or activity venue, including one filed as soft play that nobody has read
 *
 * A venue has ONE kind (what it mostly is) and, separately, a play profile (which features its own pages confirm). A trampoline park with a soft-play
 * area is a `trampoline_park` whose profile says soft play is confirmed: a search for soft play finds it, after the dedicated soft-play venues.
 */
export type PlayKind = 'soft_play' | 'play_cafe' | 'trampoline_park' | 'climbing_centre' | 'indoor_activity';

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
  /** Present for the play group, and for a reviewed play café or climbing centre. */
  play?: PlayProfile;
  /** Which kind of play venue this is, where it is one (see PlayKind). Null for a park, a museum, a farm. */
  kind: PlayKind | null;
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
  kind?: PlayKind;
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
    group: 'play', kind: 'soft_play', label: 'Indoor play centre with soft play',
    play: { softPlay: 'confirmed', trampolines: 'no' },
    evidence: ['Soft play: its own page lists it', 'No trampolines: its own page says so'],
  },
  'fp-google-ChIJb5wm6eQQdkgR-qbm_aXw0xw': { // Flip Out Brent Cross
    group: 'play', kind: 'trampoline_park', label: 'Trampoline park with soft play',
    play: { softPlay: 'confirmed', trampolines: 'confirmed' },
    evidence: ['Soft play and trampolines: its own page lists both'],
  },
  'fp-google-ChIJ0ZZcI7hrdkgR4ooSY3kKOMo': { // Flip Out Watford
    group: 'play', kind: 'trampoline_park', label: 'Trampoline park with soft play',
    play: { softPlay: 'confirmed', trampolines: 'confirmed' },
    evidence: ['Soft play and trampolines: its own page lists both'],
  },
  'fp-google-ChIJ7_PV980bdkgROekbwOVWVfo': { // Babylon Park London
    group: 'play', kind: 'soft_play', label: 'Indoor play centre with soft play',
    play: { softPlay: 'confirmed', trampolines: 'not_confirmed' },
    evidence: ['Soft play: its FAQ mentions soft play areas for toddlers and kids'],
  },
  'fp-google-ChIJbe-XLh0fdkgRnjEVL2_qP3E': { // AirHop Adventure & Trampoline Park Enfield
    group: 'play', kind: 'trampoline_park', label: 'Trampoline park',
    play: { softPlay: 'not_confirmed', trampolines: 'confirmed' },
    evidence: ['Trampolines: from its name. Soft play is not confirmed'],
  },
  'fp-google-ChIJi3VUUWoWdkgRluIRG5hbIlY': { // Jump In by AirHop Adventure & Trampoline Park Elstree
    group: 'play', kind: 'trampoline_park', label: 'Trampoline park',
    play: { softPlay: 'not_confirmed', trampolines: 'confirmed' },
    evidence: ['Trampolines: from its name. Soft play is not confirmed'],
  },
  // Tranche C (docs/SOFT_PLAY_TRANCHE_C_FINDINGS.md): independent records, each classified from the OPERATOR'S OWN WORDS read once on 14 October 2026. Inert until
  // an approved Tranche C release puts these ids in the registry; until then nothing here matches a venue. An age appears only where the venue wrote it, and a
  // food registration (the FSA's FHRS, which names and places these venues) is never evidence of what a venue offers or who it suits.
  'fp-fhrs-346104': { // Gambado, Chelsea
    group: 'play', kind: 'soft_play', label: 'Soft play', play: { softPlay: 'confirmed', trampolines: 'not_confirmed' },
    evidence: ['Soft play: its own page calls itself "London’s Best SOFT play centre"', 'A soft play zone for under-4s, with a baby area: its own page', 'Play sessions listed for ages 0 to 17: its own page'],
  },
  'fp-fhrs-1691253': { // Abuela Play Café, Coulsdon
    group: 'play', kind: 'soft_play', label: 'Soft play', play: { softPlay: 'confirmed', trampolines: 'not_confirmed' },
    evidence: ['Soft play: its own page says "the amazing soft play zone"', 'A session listed for ages 9 months to 6 years: its own page'],
  },
  'fp-fhrs-1367047': { // Halo Play Café, Uxbridge
    group: 'play', kind: 'soft_play', label: 'Soft play', play: { softPlay: 'confirmed', trampolines: 'not_confirmed' },
    evidence: ['Soft play: its own pages are titled "Soft play & dining"', 'Equipment suitable for ages 0 to about 9 or 10, with a height limit of 148 cm: its own page'],
  },
  'fp-fhrs-1532159': { // Little Peeps Soft Play, Chessington
    group: 'play', kind: 'soft_play', label: 'Soft play', play: { softPlay: 'confirmed', trampolines: 'not_confirmed' },
    evidence: ['Soft play: a jungle-themed area for under-2s and a larger one: its own page', 'Soft play recommended up to 8 years: its own page', 'It also has bowling and a gaming zone'],
  },
  'fp-fhrs-1836741': { // Moo Moo's Play Café, Cobham
    group: 'play', kind: 'soft_play', label: 'Soft play', play: { softPlay: 'confirmed', trampolines: 'not_confirmed' },
    evidence: ['Soft play: its own page is titled "Soft Play in Cobham"'],
  },
  'fp-fhrs-1935590': { // The Jump Zone, Beckton
    group: 'play', kind: 'trampoline_park', label: 'Trampoline park', play: { softPlay: 'not_confirmed', trampolines: 'confirmed' },
    evidence: ['Trampolines: its own page', 'A weekday term-time session for under-5s ("Toddler Takeover"): its own page'],
  },
  'fp-fhrs-1434379': { // Flip Out, Brent Cross
    group: 'play', kind: 'trampoline_park', label: 'Trampoline park with soft play', play: { softPlay: 'confirmed', trampolines: 'confirmed' },
    evidence: ['Trampolines and soft play: its own page lists both'],
  },
  'fp-fhrs-1857771': { // Clip 'n Climb at The O2
    group: 'attractions', kind: 'climbing_centre', label: 'Climbing centre', play: { softPlay: 'not_confirmed', trampolines: 'not_confirmed' },
    evidence: ['Climbing: its own page', 'Mini Mountaineer sessions for ages 2 to 4; standard sessions from 4: its own page'],
  },
  'fp-fhrs-1937580': { // Clip 'n Climb, Croydon
    group: 'attractions', kind: 'climbing_centre', label: 'Climbing centre with a soft-play area', play: { softPlay: 'confirmed', trampolines: 'not_confirmed' },
    evidence: ['Climbing, and a soft-play area open every day: its own page', 'Mini Mountaineer sessions for ages 2 to 4: its own page'],
  },
  // Play cafés: Activities, labelled "Play café". Their own pages do not say soft play, so a search for soft play never lists them as soft play.
  'fp-fhrs-1961932': { // Cheeky Chops Play Café, Twickenham
    group: 'attractions', kind: 'play_cafe', label: 'Play café', play: { softPlay: 'not_confirmed', trampolines: 'not_confirmed' },
    evidence: ['A play café: its own page says "for children aged 0-5 years"', 'Soft play is not mentioned on its page'],
  },
  'fp-fhrs-1677302': { // Dreami Play Café, Hackney
    group: 'attractions', kind: 'play_cafe', label: 'Play café', play: { softPlay: 'not_confirmed', trampolines: 'not_confirmed' },
    evidence: ['A play café: its own page says "children aged 0–6"', 'Soft play is not mentioned on its page'],
  },
  'fp-fhrs-1756533': { // Raffys Play Café, Bromley
    group: 'attractions', kind: 'play_cafe', label: 'Play café', play: { softPlay: 'not_confirmed', trampolines: 'not_confirmed' },
    evidence: ['A role-play café for under-5s: its own page', 'Soft play is not mentioned on its page'],
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
function playFromName(name: string): { play: PlayProfile; label: string; kind: PlayKind } {
  const trampoline = TRAMPOLINE_NAME.test(name);
  const soft = SOFT_PLAY_NAME.test(name);
  if (soft && !trampoline) return { play: { softPlay: 'confirmed', trampolines: 'not_confirmed' }, label: 'Soft play', kind: 'soft_play' };
  if (trampoline && !soft) return { play: { softPlay: 'not_confirmed', trampolines: 'confirmed' }, label: 'Trampoline park', kind: 'trampoline_park' };
  if (trampoline && soft) return { play: { softPlay: 'confirmed', trampolines: 'confirmed' }, label: 'Trampoline park with soft play', kind: 'trampoline_park' };
  return { play: { softPlay: 'not_confirmed', trampolines: 'not_confirmed' }, label: 'Indoor play, soft play not confirmed', kind: 'indoor_activity' };
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
      kind: reviewed.kind ?? null,
      usualEnvironment: reviewed.usualEnvironment,
      hidden: reviewed.hidden === true,
      basis: 'reviewed',
      evidence: reviewed.evidence ?? [],
    };
  }
  if (storedGroup === 'play') {
    const { play, label, kind } = playFromName(venue.name);
    return { group: 'play', label, play, kind, hidden: false, basis: 'name', evidence: [] };
  }
  return {
    group: storedGroup,
    label: LABEL_BY_CATEGORY[venue.category] ?? 'Place',
    kind: null,
    hidden: false,
    basis: 'category',
    evidence: [],
  };
}

export function groupOf(venue: Pick<Venue, 'id' | 'name' | 'category'>): ExploreGroupId | null {
  const c = classify(venue);
  return c.hidden ? null : c.group;
}
