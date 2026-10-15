import { describe, expect, it } from 'vitest';

import { Venue, VenueCategory } from '@/src/types';
import { ageGuidance, facilityEvidence, facilityLines } from '@/src/utils/explore-evidence';
import { ExploreAnchor } from '@/src/utils/explore-geo';
import { ExploreQuery, runExplore } from '@/src/utils/explore-results';

/**
 * Real catalogue entries (names, places and recorded facts as read from production on 13 Oct), so the journeys below are the
 * ones a parent in Camden, or in Romford, would really have against today's data.
 */
type Facts = Partial<Record<'parking' | 'babyChanging' | 'toilets' | 'cafe' | 'playground' | 'wheelchairAccessible', 'yes' | 'no'>> & { pushchairSuitability?: string };
const place = (id: string, name: string, category: VenueCategory, lat: number, lng: number, facts: Facts = {}, extra: Partial<Venue> = {}): Venue => ({
  id, name, category, latitude: lat, longitude: lng, driveMinutes: 20, imageUrl: '', address: 'London',
  familyScore: { score: 70, factors: {} as never, explanation: [] },
  trustedFacts: { toilets: 'unknown', babyChanging: 'unknown', parking: 'unknown', cafe: 'unknown', playground: 'unknown', pushchairSuitability: 'unknown', ...facts } as never,
  ...extra,
}) as Venue;

const BABYLON = place('fp-google-ChIJ7_PV980bdkgROekbwOVWVfo', 'Babylon Park London', 'soft_play', 51.542, -0.145, { parking: 'no' });
const BRENT = place('fp-google-ChIJb5wm6eQQdkgR-qbm_aXw0xw', 'Flip Out Brent Cross', 'soft_play', 51.569, -0.228, { parking: 'no' });
const CANARY = place('fp-google-ChIJ2fFKeuMDdkgRLHMNKVOxX_s', 'Flip Out Canary Wharf', 'soft_play', 51.505, -0.021, { parking: 'yes' });
const WATFORD = place('fp-google-ChIJ0ZZcI7hrdkgR4ooSY3kKOMo', 'Flip Out Watford', 'soft_play', 51.655, -0.392, { babyChanging: 'yes', pushchairSuitability: 'good' });
const AIRHOP = place('fp-google-ChIJbe-XLh0fdkgRnjEVL2_qP3E', 'AirHop Adventure & Trampoline Park Enfield', 'soft_play', 51.643, -0.059);
const JUMP_IN = place('fp-google-ChIJi3VUUWoWdkgRluIRG5hbIlY', 'Jump In by AirHop Adventure & Trampoline Park Elstree', 'soft_play', 51.659, -0.263);

const KENTISH = place('farm-ktcf', 'Kentish Town City Farm', 'farm', 51.552, -0.150, { parking: 'no', toilets: 'yes', pushchairSuitability: 'good' });
const HACKNEY_FARM = place('farm-hcf', 'Hackney City Farm', 'farm', 51.532, -0.067, { cafe: 'yes', parking: 'no', toilets: 'yes', babyChanging: 'yes' });
const MUDCHUTE = place('farm-mudchute', 'Mudchute Park and Farm', 'farm', 51.492, -0.010, { cafe: 'yes', toilets: 'yes', babyChanging: 'yes' });
const BELMONT = place('farm-belmont', "Belmont Children's Farm", 'farm', 51.622, -0.232, { cafe: 'yes', parking: 'yes' });
const LONDON_ZOO = place('zoo-london', 'London Zoo', 'zoo', 51.535, -0.153);

const POSTAL = place('m-postal', 'The Postal Museum', 'museum', 51.525, -0.114, { babyChanging: 'yes', cafe: 'yes' });
const PARADOX = place('m-paradox', 'Paradox Museum London', 'museum', 51.500, -0.164, { pushchairSuitability: 'difficult' });
const BRITISH = place('m-british', 'The British Museum', 'museum', 51.519, -0.127);
const LONDON_EYE = place('a-eye', 'London Eye', 'attraction', 51.503, -0.120, { parking: 'no', toilets: 'yes', babyChanging: 'yes', pushchairSuitability: 'mixed' });
const VICTORIA = place('p-victoria', 'Victoria Park', 'park', 51.54, -0.04, { cafe: 'yes', toilets: 'yes' });
const CLISSOLD = place('p-clissold', 'Clissold Park', 'park', 51.56, -0.09, { playground: 'yes', toilets: 'yes' });
const HIGHBURY = place('p-highbury', 'Highbury Fields', 'park', 51.55, -0.10);
const HOGWARTS = place('fp-google-ChIJjXVQ6QNBdkgRUpu1zpMlFSs', 'Hogwarts Castle', 'attraction', 51.691, -0.418);

const ALL = [BABYLON, BRENT, CANARY, WATFORD, AIRHOP, JUMP_IN, KENTISH, HACKNEY_FARM, MUDCHUTE, BELMONT, LONDON_ZOO, POSTAL, PARADOX, BRITISH, LONDON_EYE, VICTORIA, CLISSOLD, HIGHBURY, HOGWARTS];
const CAMDEN: ExploreAnchor = { kind: 'home', label: 'Near Camden', detail: 'Your home area', latitude: 51.539, longitude: -0.1426 };

const ask = (over: Partial<ExploreQuery> = {}, venues: Venue[] = ALL) =>
  runExplore(venues, { anchor: CAMDEN, scope: 'nearby', radius: 5, query: '', category: 'all', advanced: [], budget: 'any', priceFiltersAvailable: false, ...over });
const names = (rows: { venue: Venue }[]) => rows.map((r) => r.venue.name);

describe('Journey 1: genuine soft play within 5 miles', () => {
  it('lists the two places near Camden whose own pages say they have soft play, nearest-fit first', () => {
    const r = ask({ query: 'soft play' });
    expect(names(r.matches).sort()).toEqual(['Babylon Park London', 'Flip Out Brent Cross']);
    expect(r.interpretation).toBe('Soft play');
  });

  it('adds the trampoline-only parks under their own heading when the distance is widened, never as soft play', () => {
    const r = ask({ query: 'soft play', radius: 10 });
    expect(names(r.matches).sort()).toEqual(['Babylon Park London', 'Flip Out Brent Cross', 'Flip Out Canary Wharf']);
    expect(r.also.map((g) => g.label)).toEqual(['Also: trampoline parks, soft play not on record']);
    expect(names(r.also[0].rows).sort()).toEqual([AIRHOP.name, JUMP_IN.name].sort());
  });

  it('keeps the soft play group\'s chip honest: all six, each with what it is', () => {
    const r = ask({ category: 'play', scope: 'all' });
    expect(r.matches).toHaveLength(6);
  });
});

describe('Journey 2: an indoor museum, with age honestly uncertain', () => {
  it('matches Museums + Indoor within 5 miles and says no age limit is recorded', () => {
    const r = ask({ category: 'museums', advanced: ['indoor'] });
    expect(names(r.matches)).toEqual(expect.arrayContaining(['The Postal Museum', 'The British Museum']));
    const age = ageGuidance(POSTAL);
    expect(age.kind).toBe('typical');
    expect(age.text).toBe('Ages: typical for museums, no limit recorded');
  });

  it('shows a recorded age rule as recorded, and a place with nothing as not recorded', () => {
    const restricted = { ...POSTAL, trustedFacts: { ...POSTAL.trustedFacts, venueAgePolicy: { restrictions: [{ minMonthsInclusive: 48, maxMonthsExclusive: null, sourceUrl: 'x', checkedAt: null }], caveats: [], sourcesDisagree: false } } } as Venue;
    expect(ageGuidance(restricted)).toEqual({ kind: 'recorded', text: 'Ages: its own page sets an age rule, from 4 years' });
    expect(ageGuidance(LONDON_EYE).kind).toBe('unrecorded');
  });

  it('never treats missing age data as suitable or unsuitable', () => {
    expect(ask({ category: 'museums' }).hidden).toEqual([]);
  });
});

describe('Journey 3: a farm with confirmed parking and baby changing', () => {
  const r = ask({ category: 'animals', advanced: ['parking', 'baby_changing'], radius: 10 });

  it('finds none that confirm both, and says so rather than listing places that do not', () => {
    expect(r.matches).toEqual([]);
  });

  it('hides, with the reason, the farms whose own pages say they have no parking', () => {
    expect(names(r.hidden).sort()).toEqual(['Hackney City Farm', 'Kentish Town City Farm']);
    expect(r.hidden[0].reason).toBe('Parking: its own page says there is none');
  });

  it('lists apart the farms that confirm one and have not been checked for the other, as not checked', () => {
    // Those that confirm one of the two come first; a place with neither recorded (London Zoo) follows, marked for both.
    expect(names(r.notChecked).slice(0, 2).sort()).toEqual(["Belmont Children's Farm", 'Mudchute Park and Farm']);
    expect(names(r.notChecked)[2]).toBe('London Zoo');
    expect(r.notChecked.find((x) => x.venue.name === 'Mudchute Park and Farm')?.reason).toBe('Not checked: parking');
    expect(r.notChecked.find((x) => x.venue.name.startsWith('Belmont'))?.reason).toBe('Not checked: baby changing');
    expect(r.notChecked.find((x) => x.venue.name === 'London Zoo')?.reason).toBe('Not checked: parking, baby changing');
  });

  it('offers one tap to relax each filter, with the number it would leave', () => {
    const byId = Object.fromEntries(r.relaxations.map((x) => [x.id, x.count]));
    expect(byId['filter:parking']).toBe(2); // Hackney City Farm and Mudchute confirm baby changing
    expect(byId['filter:baby_changing']).toBe(1); // Belmont confirms parking
  });
});

describe('Journey 4: a playground nearby, and the map', () => {
  it('lists the parks within 5 miles where a playground is confirmed, and not the parks nobody has recorded', () => {
    const r = ask({ category: 'parks', advanced: ['playground'] });
    expect(names(r.matches)).toEqual(['Clissold Park']);
    expect(names(r.notChecked).sort()).toEqual(['Highbury Fields', 'Victoria Park']);
    expect(r.notCheckedFor).toEqual(['playground']);
  });
});

describe('Journey 5: a named attraction, across London', () => {
  it('finds it in Search all', () => {
    expect(names(ask({ scope: 'all', query: 'london eye' }).matches)[0]).toBe('London Eye');
  });

  it('lists it by name in Nearby even when it is beyond the distance, rather than losing it', () => {
    const r = ask({ radius: 2, query: 'london eye', anchor: { ...CAMDEN, latitude: 51.60, longitude: -0.30 } });
    expect(r.matches).toEqual([]);
    expect(names(r.outside)).toEqual(['London Eye']);
  });
});

describe('Journey 7: restrictive filters, an honest explanation, and a way to relax without starting again', () => {
  it('says which things to take off, and what each would leave', () => {
    const r = ask({ category: 'play', advanced: ['outdoor'], radius: 2 });
    expect(r.matches).toEqual([]);
    const ids = r.relaxations.map((x) => x.id);
    expect(ids).toContain('filter:outdoor');
    expect(r.relaxations.find((x) => x.id === 'filter:outdoor')?.count).toBe(1); // Babylon Park, 0.2 miles away
    expect(r.relaxations.every((x) => x.count > 0)).toBe(true);
  });

  it('describes a thin area with its real numbers', () => {
    const romford: ExploreAnchor = { ...CAMDEN, label: 'Near RM1', latitude: 51.576, longitude: 0.183 };
    const r = ask({ anchor: romford });
    expect(r.coverage.within5).toBe(0);
    expect(r.matches).toEqual([]);
    expect(r.relaxations.some((x) => x.id === 'scope')).toBe(true);
  });
});

describe('what is hidden, and why', () => {
  it('hides a place whose own page says buggy access is difficult when Pushchair friendly is on, with the reason', () => {
    const r = ask({ advanced: ['pushchair'], radius: 10 });
    expect(names(r.hidden)).toEqual(['Paradox Museum London']);
    expect(r.hidden[0].reason).toBe('Pushchair access: its own page says it is difficult');
    expect(names(r.matches)).toEqual(expect.arrayContaining(['Kentish Town City Farm']));
  });

  it('hides a household\'s confirmed must-have conflict, and never a place merely not checked', () => {
    const conflicted = { ...BRITISH, fitConflicts: [{ field: 'ageAdmission', detail: 'Admits from age 5; Leo is 7 months' }] } as Venue;
    const r = ask({ category: 'museums' }, [conflicted, POSTAL]);
    expect(names(r.hidden)).toEqual(['The British Museum']);
    expect(r.hidden[0].reason).toBe('Admits from age 5; Leo is 7 months');
    expect(names(r.matches)).toEqual(['The Postal Museum']);
  });

  it('leaves out a place that is not a separate destination', () => {
    expect(names(ask({ scope: 'all' }).located.map((l) => ({ venue: l.venue })))).not.toContain('Hogwarts Castle');
  });
});

describe('what a card says about facilities', () => {
  it('separates confirmed, confirmed none and not recorded', () => {
    expect(facilityLines(facilityEvidence(KENTISH))).toEqual(['Confirmed: toilets, buggy access good', 'Parking: confirmed none', 'Not recorded: baby changing']);
    expect(facilityLines(facilityEvidence(BRITISH))).toEqual(['Not recorded: toilets, baby changing, parking']);
  });
});
