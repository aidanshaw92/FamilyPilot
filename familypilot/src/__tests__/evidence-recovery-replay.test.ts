import { describe, expect, it } from 'vitest';

/**
 * The evidence replay set: real sentences from 88 venues' OWN pages, exported read-only from the production evidence
 * store on 7 Oct 2026 (fixtures/evidence-replay), run through the extractor exactly as the worker runs it. Synthetic
 * phrasing tests elsewhere pin individual rules; this file pins what the rules do to the real corpus, in both
 * directions -- the published statements they must now recover, and the look-alikes they must leave unknown.
 *
 * "publishable" below means what auto-approval would accept from the extraction: a single non-conflicting value at high
 * confidence. Approval's other gates (official source type, eligible subject scope, a reading under 14 days old) are
 * unchanged by this work and are tested where they live.
 *
 * See docs/VENUE_EVIDENCE_RECOVERY.md for the method and the before/after measurement.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { replay, compare } = require('../../scripts/replay-evidence-corpus.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadClaims } = require('./fixtures/evidence-replay/load-corpus.cjs');

const VENUE = {
  belmontFarm: 'fp-google-ChIJ_zIJCh8XdkgRnCvSmVMa1iY',
  gladstonePark: 'fp-google-ChIJ99IK4v8QdkgRZNGsdKK0pb8',
  goldersHillPark: 'fp-google-ChIJATb-mYIQdkgRH82PlPcn3cs',
  highgateWood: 'fp-google-ChIJwwdA9ycadkgRYejp29hL2gE',
  rafMuseum: 'fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc',
  flipOutWatford: 'fp-google-ChIJ0ZZcI7hrdkgR4ooSY3kKOMo',
  kentishTownFarm: 'fp-google-ChIJAdLvZfkadkgRjwFvlivSzpo',
  tateModern: 'fp-google-ChIJlRl2MakEdkgR55tr4CNv_B8',
  streathamCommon: 'fp-google-ChIJGQI9j5kGdkgRw15R7n7xqGw',
  victoriaParkTowerHamlets: 'fp-google-ChIJHUND2RgddkgRarf7ZQfLCw4',
  londonFields: 'fp-google-ChIJH7vcjOYddkgRQAmHYvUaK-U',
  mayowPark: 'fp-google-ChIJnUAXxn8BdkgRkznV3rCdTFI',
  southNorwood: 'fp-google-ChIJ-2k6HgUBdkgRy-DSFv0Bv9I',
  designMuseum: 'fp-google-ChIJs0HnpkcDdkgRJjUYVf4jca4',
  seaLife: 'fp-google-ChIJc2nSALkEdkgRviluWxwFsxA',
  saatchi: 'fp-google-ChIJ97pX3M0EdkgR8YFd4G1GZJ8',
  williamMorris: 'fp-google-ChIJf9LtmOcddkgRRv6MezIdvSM',
  sydenhamHillWood: 'fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY',
  mudchute: 'fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI',
  paradoxMuseum: 'fp-google-ChIJQzfybmYFdkgR1tFou0zyzYQ',
  warnerBros: 'fp-google-ChIJC9pWSLVBdkgRMA5Q9eG6egM',
  londonEye: 'fp-google-ChIJc2nSALkEdkgRkuoJJBfzkUI',
} as const;

type Row = { venueId: string; field: string; live: string | null; replay: string | null; publishable: string | null; evidence: string | null };

const result: Map<string, Record<string, { value: string; confidence: string; evidence: string }>> = replay();
const rows: Row[] = compare(result, loadClaims());
const fact = (venue: string, field: string) => result.get(venue)?.[field];
const publishable = (venue: string, field: string) =>
  rows.find((r) => r.venueId === venue && r.field === field)?.publishable ?? null;

describe('published statements the extractor now recovers, from the venues’ own words', () => {
  it.each([
    // [venue, field, value, words the excerpt must carry]
    [VENUE.belmontFarm, 'cafe', 'yes', 'check out our café for a bite to eat'],
    [VENUE.belmontFarm, 'parking', 'yes', 'You can park in the top car park'],
    [VENUE.gladstonePark, 'cafe', 'yes', 'Café'], // "Caf&eacute;" in the stored text, in a council facilities list
    [VENUE.gladstonePark, 'parking', 'yes', 'A small surfaced car park'],
    [VENUE.goldersHillPark, 'cafe', 'yes', 'In the Park, you can find: a café'],
    [VENUE.goldersHillPark, 'toilets', 'yes', 'There are three accessible toilets in the park'],
    [VENUE.highgateWood, 'cafe', 'yes', 'popular café with terrace'],
    [VENUE.rafMuseum, 'babyChanging', 'yes', 'All have baby changing facilities'],
    [VENUE.rafMuseum, 'cafe', 'yes', 'our cafés'],
    [VENUE.victoriaParkTowerHamlets, 'cafe', 'yes', 'both our cafés'],
    [VENUE.victoriaParkTowerHamlets, 'toilets', 'yes', "Victoria Park's public toilets"],
    [VENUE.londonFields, 'cafe', 'yes', 'lido café'],
    [VENUE.londonFields, 'toilets', 'yes', 'Toilets and accessible toilets'],
    [VENUE.mayowPark, 'cafe', 'yes', 'Facilities include: play area café'],
    [VENUE.streathamCommon, 'parking', 'yes', 'There is a small car park at the top of Streatham Common South'],
    [VENUE.flipOutWatford, 'pushchairSuitability', 'good', 'buggy-friendly'],
    [VENUE.tateModern, 'pushchairSuitability', 'good', 'All entrances are accessible with a buggy'],
    [VENUE.kentishTownFarm, 'pushchairSuitability', 'good', 'Plenty of room for buggies'],
    [VENUE.seaLife, 'pushchairSuitability', 'excellent', 'fully accessible with lifts throughout'],
    [VENUE.warnerBros, 'freeParking', 'yes', 'Parking is provided free of charge in our car park'],
    // A weekly closing day is a schedule: "Café Opening Times Tuesday – Sunday, 10am – 4pm Closed: Monday".
    ['fp-google-ChIJIwA11GYTdkgRoeeAutW9svo', 'cafe', 'yes', 'Café Opening Times'],
  ])('%s %s = %s', (venue, field, value, words) => {
    expect(publishable(venue, field)).toBe(value);
    expect(fact(venue, field)?.evidence).toContain(words);
  });
});

describe('look-alikes that must stay unknown, or keep their honest value', () => {
  it('somebody else’s car park is not the venue’s', () => {
    // "Short Term coach parking is available on Seagrave Road" + "The museum does not have a car park"
    expect(publishable(VENUE.designMuseum, 'parking')).toBe('no');
    // "A secure underground car park within suitable walking distance from our Southbank attractions"
    expect(publishable(VENUE.seaLife, 'parking')).toBeNull();
    // "Public car parking is available at Sloane Square Car Park" / "(No parking Mon-Sat 7am to 7pm ...)"
    expect(publishable(VENUE.saatchi, 'parking')).toBeNull();
    // "The London Eye does not have its own car park" beside the Q-Park and National Theatre car parks
    expect(publishable(VENUE.londonEye, 'parking')).toBe('no');
  });

  it('Blue Badge-only parking is not general parking', () => {
    // "Golders Hill Park car park eight bays in the park for Blue Badge holders only."
    expect(publishable(VENUE.goldersHillPark, 'parking')).toBeNull();
    // "The Gallery has three parking bays for blue badge holders only"
    expect(publishable(VENUE.williamMorris, 'parking')).toBeNull();
  });

  it('a facility open on certain days only is not a yes', () => {
    // "The toilets are open Thursday and Sunday, 11am-4pm." -- served as yes today, and withdrawn on refresh
    expect(publishable(VENUE.mayowPark, 'toilets')).toBeNull();
    // "The Kiosk Community Café: every Saturday 9am to 2pm"
    expect(publishable(VENUE.southNorwood, 'cafe')).toBeNull();
    // "toilets ... are available (currently closed as part of refurbishment works)"
    expect(publishable(VENUE.southNorwood, 'toilets')).toBeNull();
  });

  it('the nearest toilet somewhere else is not a toilet here', () => {
    // Sydenham Hill Wood serves toilets = yes today; its page names "the nearest Changing Places Toilet ... in Dulwich Park"
    expect(publishable(VENUE.sydenhamHillWood, 'toilets')).toBeNull();
  });

  it('contradictory statements on the venue’s own pages are withheld, not resolved by guessing', () => {
    // Mudchute: "visitor parking is not available on site" and "you will find a small visitors car park"
    expect(fact(VENUE.mudchute, 'parking')?.value).toBe('conflict');
    expect(publishable(VENUE.mudchute, 'parking')).toBeNull();
  });

  it('negatives and limitations survive: a buggy refusal, a fold-before-boarding rule, a buggy park request', () => {
    expect(publishable(VENUE.paradoxMuseum, 'pushchairSuitability')).toBe('difficult');
    expect(publishable(VENUE.londonEye, 'pushchairSuitability')).toBe('mixed');
    expect(publishable(VENUE.saatchi, 'pushchairSuitability')).toBe('mixed');
    expect(publishable(VENUE.kentishTownFarm, 'parking')).toBe('no');
  });

  it('a café being rebuilt is not evidence of a café, but the temporary one that is open is', () => {
    expect(fact(VENUE.designMuseum, 'cafe')?.evidence).toContain('temporary pop-up shop and cafe are open');
    expect(fact(VENUE.designMuseum, 'cafe')?.evidence).not.toContain('rebuilding');
  });

  it('no venue goes from a confirmed value to its opposite', () => {
    const flipped = rows.filter((r) => r.live && r.publishable && r.live !== r.publishable
      // Streatham Common: "no" was read off the roads' yellow lines; its own page describes its car park.
      && !(r.venueId === VENUE.streathamCommon && r.field === 'parking')
      // SEA LIFE: two of its own pages now agree on "excellent"; "mixed" came from an optional buggy bay.
      && !(r.venueId === VENUE.seaLife && r.field === 'pushchairSuitability')
      // Colne Valley Regional Park (v5): "no" was read off "Parking is not permitted on Denham Court Drive", a road's rule;
      // the same paragraph says "There are two carparks run by Bucks County Council".
      && !(r.venueId === 'fp-google-ChIJq-jJARlxdkgRNLTE490EqVU' && r.field === 'parking'));
    expect(flipped).toEqual([]);
  });
});

describe('coverage on the replay set (88 venues with readable own pages)', () => {
  const count = (field: string, key: 'live' | 'publishable') => rows.filter((r) => r.field === field && r[key]).length;

  it('recovers facts without losing any that are true', () => {
    // Pinned so a rule change that moves coverage is a deliberate edit here, with the reason in the commit.
    expect({
      babyChanging: count('babyChanging', 'publishable'),
      toilets: count('toilets', 'publishable'),
      cafe: count('cafe', 'publishable'),
      parking: count('parking', 'publishable'),
      pushchairSuitability: count('pushchairSuitability', 'publishable'),
      freeParking: count('freeParking', 'publishable'),
      // v5: parking 36 -> 35 and freeParking 15 -> 13. Queen Elizabeth Olympic Park's "parking" was a sub-venue's car park
      // "for facility users" and its "free parking: no" an on-street bay on a nearby avenue; Whitechapel Gallery's "free
      // parking: no" was a public multistorey's charge. None of the three was the venue's own.
      // v6 (extraction pilot): toilets 31 -> 35 (Cutty Sark, Mudchute, Chiswick House, Hackney City Farm: placed toilets),
      // cafe 35 -> 39 (Cutty Sark, Hackney City Farm, Tate Modern, V&A: a café as a place or with its own hours),
      // parking 35 -> 36 (Northala Fields' own car parks "locked in accordance with park
      // locking times"). Each is listed with its sentence in docs/EXTRACTION_PILOT.md.
    }).toEqual({ babyChanging: 26, toilets: 35, cafe: 39, parking: 36, pushchairSuitability: 10, freeParking: 13 });
    // What production serves today for the same venues, for the before/after table.
    expect({
      babyChanging: count('babyChanging', 'live'),
      toilets: count('toilets', 'live'),
      cafe: count('cafe', 'live'),
      parking: count('parking', 'live'),
      pushchairSuitability: count('pushchairSuitability', 'live'),
    }).toEqual({ babyChanging: 23, toilets: 21, cafe: 5, parking: 25, pushchairSuitability: 5 });
  });

  it('every recovered fact carries a quote from the page it came from', () => {
    const recovered = rows.filter((r) => r.publishable && !r.live);
    expect(recovered.length).toBeGreaterThan(40);
    for (const r of recovered) expect(r.evidence?.length, `${r.venueId} ${r.field}`).toBeGreaterThan(15);
  });
});
