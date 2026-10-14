import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require_ = createRequire(import.meta.url);
const quality = require_('../../../server/places/lib/places-quality.js');
const { googlePlaceToRecord } = require_('../../../server/places/lib/google-places.js');

/**
 * The discovery rules decide which Google places Explore may hold and which group each one lands in.
 *
 * THE DEFECT THESE LOCK DOWN. A place was rejected if ANY of its Google types was on the exclusion list. Family venues very often
 * also carry `cafe`, `library`, `university` or `lodging`, so a museum with a cafe, a farm with a cafe, or the Natural History
 * Museum (which Google also tags `library`) was dropped before it was ever stored, and could never be refreshed either.
 *
 * Type sets marked REAL are the stored types of a venue FamilyPilot already holds. Sets marked HYPOTHETICAL are the shapes the
 * old rule would have dropped; no such venue is stored, because a rejected place is never stored, so they cannot be read back.
 */

type Case = { label: string; primary: string | null; types: string[]; name?: string };
const accepts = ({ primary, types, name }: Case) => quality.isSupportedForIntent(primary, types, 'explore', name ?? 'Example Place');
const category = ({ primary, types, name }: Case) => quality.mapGoogleCategory(primary, types, name ?? 'Example Place');

describe('a place is judged by what it is, not by every service it also offers', () => {
  const MIXED_USE: Array<Case & { group: string }> = [
    // REAL: the venue that started this. Primary museum, also research_institute and library.
    { label: 'REAL Natural History Museum (museum + library + event venue)', primary: 'museum',
      types: ['research_institute', 'tourist_attraction', 'library', 'event_venue', 'museum', 'service', 'point_of_interest', 'establishment'], group: 'museum' },
    // REAL: stale for a different reason (not rejected), kept here so the shape stays accepted.
    { label: 'REAL Royal Academy of Arts (gallery + educational institution)', primary: 'art_gallery',
      types: ['art_gallery', 'tourist_attraction', 'educational_institution', 'association_or_organization', 'service', 'point_of_interest', 'establishment'], group: 'museum' },
    { label: 'HYPOTHETICAL museum with a cafe', primary: 'museum', types: ['museum', 'cafe', 'point_of_interest'], group: 'museum' },
    { label: 'HYPOTHETICAL museum inside a university', primary: 'museum', types: ['museum', 'university', 'school', 'point_of_interest'], group: 'museum' },
    { label: 'HYPOTHETICAL farm with a cafe and a restaurant', primary: 'farm', types: ['farm', 'cafe', 'restaurant', 'point_of_interest'], group: 'farm' },
    { label: 'HYPOTHETICAL zoo on a hotel estate', primary: 'zoo', types: ['zoo', 'lodging', 'tourist_attraction'], group: 'zoo' },
    { label: 'HYPOTHETICAL soft play centre with a cafe', primary: 'indoor_playground', types: ['indoor_playground', 'cafe', 'restaurant'], group: 'soft_play' },
    { label: 'HYPOTHETICAL park with a cafe and a library', primary: 'park', types: ['park', 'cafe', 'library'], group: 'park' },
    { label: 'HYPOTHETICAL aquarium with a restaurant', primary: 'aquarium', types: ['aquarium', 'restaurant', 'tourist_attraction'], group: 'attraction' },
    { label: 'HYPOTHETICAL tourist attraction with an on-site cafe', primary: 'tourist_attraction', types: ['tourist_attraction', 'cafe', 'point_of_interest'], group: 'attraction' },
  ];

  it.each(MIXED_USE)('accepts $label as $group', (c) => {
    expect(accepts(c)).toBe(true);
    expect(category(c)).toBe(c.group);
  });
});

describe('a place that is mainly something else is still rejected', () => {
  const REJECTED: Case[] = [
    { label: 'a hotel that Google also calls a tourist attraction', primary: 'hotel', types: ['hotel', 'lodging', 'tourist_attraction'] },
    { label: 'a restaurant beside a park', primary: 'restaurant', types: ['restaurant', 'park'] },
    { label: 'a cafe that is also filed under museum', primary: 'cafe', types: ['cafe', 'museum'] },
    { label: 'a library that Google also tags museum', primary: 'library', types: ['library', 'museum', 'point_of_interest'] },
    { label: 'REAL College Lane Campus LRC (primary library)', primary: 'library', types: [] },
    { label: 'REAL Troubadour Wembley Park Theatre (primary theatre)', primary: 'performing_arts_theater', types: [] },
    { label: 'a school with a playground', primary: 'school', types: ['school', 'playground'] },
    { label: 'a church that is a tourist attraction', primary: 'church', types: ['church', 'place_of_worship', 'tourist_attraction'] },
    { label: 'a broad tourist_attraction that is mainly a hotel', primary: 'tourist_attraction', types: ['tourist_attraction', 'lodging', 'hotel'] },
    { label: 'a broad tourist_attraction that is mainly a place of worship', primary: 'tourist_attraction', types: ['tourist_attraction', 'place_of_worship'] },
    { label: 'a broad tourist_attraction that is mainly a bar', primary: 'tourist_attraction', types: ['tourist_attraction', 'bar', 'restaurant'] },
    { label: 'a cultural centre that is a temple', primary: 'cultural_center', types: ['cultural_center', 'hindu_temple', 'place_of_worship'] },
    { label: 'a bowling alley that is a night club', primary: 'bowling_alley', types: ['bowling_alley', 'night_club', 'bar'] },
    { label: 'an amusement venue that is a casino', primary: 'amusement_park', types: ['amusement_park', 'casino'] },
    { label: 'no primary type and a pub', primary: null, types: ['pub', 'tourist_attraction'] },
  ];

  it.each(REJECTED)('rejects $label', (c) => {
    expect(accepts(c)).toBe(false);
  });

  it('keeps the restaurant intent exactly as it was: any listed type rejects', () => {
    expect(quality.isSupportedForIntent('restaurant', ['restaurant', 'hotel'], 'restaurant', 'X')).toBe(false);
    expect(quality.isSupportedForIntent('restaurant', ['restaurant', 'food'], 'restaurant', 'X')).toBe(true);
    expect(quality.shouldExcludePlace('cafe', ['cafe', 'lodging'], 'restaurant')).toBe(true);
  });
});

describe('the eight known corrections, from the real stored type sets', () => {
  // Types are what Google returned and FamilyPilot stored. "was" is the group the old rules gave it, which is what is stored today.
  const REAL: Array<{ name: string; primary: string; types: string[]; was: string; now: string | 'rejected' }> = [
    { name: 'Paddington Recreation Ground', primary: 'park',
      types: ['park', 'fitness_center', 'gym', 'sports_complex', 'tennis_court', 'athletic_field', 'sports_club', 'sports_activity_location', 'association_or_organization', 'health', 'point_of_interest', 'establishment'],
      was: 'activity', now: 'park' },
    { name: 'Walthamstow Wetlands', primary: 'nature_preserve', types: ['nature_preserve', 'tourist_attraction', 'park', 'point_of_interest', 'establishment'], was: 'attraction', now: 'park' },
    { name: 'Churchill War Rooms', primary: 'history_museum', types: ['history_museum', 'tourist_attraction', 'museum', 'point_of_interest', 'establishment'], was: 'attraction', now: 'museum' },
    { name: 'Gunnersbury Park', primary: 'park',
      types: ['park', 'non_profit_organization', 'tourist_attraction', 'museum', 'association_or_organization', 'tour_agency', 'travel_agency', 'point_of_interest', 'service', 'establishment'],
      was: 'museum', now: 'park' },
    { name: 'Troubadour Wembley Park Theatre', primary: 'performing_arts_theater', types: [], was: 'park', now: 'rejected' },
    { name: 'College Lane Campus LRC', primary: 'library', types: [], was: 'museum', now: 'rejected' },
  ];

  it.each(REAL)('$name: $was becomes $now', (row) => {
    if (row.now === 'rejected') {
      expect(quality.isSupportedForIntent(row.primary, row.types, 'explore', row.name)).toBe(false);
    } else {
      expect(quality.isSupportedForIntent(row.primary, row.types, 'explore', row.name)).toBe(true);
      expect(quality.mapGoogleCategory(row.primary, row.types, row.name)).toBe(row.now);
    }
  });

  it('a park that is also a farm or a zoo is still that farm or zoo', () => {
    expect(quality.mapGoogleCategory('park', ['park', 'farm', 'educational_institution', 'point_of_interest'], 'Mudchute Park and Farm')).toBe('farm');
    expect(quality.mapGoogleCategory('park', ['park', 'zoo', 'tourist_attraction'], 'Example Park Zoo')).toBe('zoo');
  });

  it('a museum that has a park or an aquarium is still a museum', () => {
    expect(quality.mapGoogleCategory('museum', ['museum', 'aquarium', 'tourist_attraction', 'park'], 'Horniman Museum and Gardens')).toBe('museum');
  });

  it('any museum subtype is a museum', () => {
    for (const type of ['history_museum', 'art_museum', 'childrens_museum']) {
      expect(quality.mapGoogleCategory(type, [type, 'tourist_attraction'], 'Example')).toBe('museum');
    }
  });
});

describe('trampoline parks stay distinguishable from soft play, and nothing is lost for telling them apart', () => {
  // The group stays soft_play for both (the app tells them apart from the venue's own pages and the reviewed map). What this change
  // must not do is destroy the signals that decision reads: the Google types, the primary type and the name.
  const place = (id: string, name: string, primaryType: string, types: string[]) => ({
    id, displayName: { text: name }, location: { latitude: 51.5, longitude: -0.1 }, primaryType, types,
  });

  it('records both kinds with their types intact', () => {
    const tramp = googlePlaceToRecord(place('T1', 'Example Trampoline Park', 'trampoline_park', ['trampoline_park', 'indoor_playground', 'cafe']), 'explore');
    const soft = googlePlaceToRecord(place('S1', 'Example Play Centre', 'indoor_playground', ['indoor_playground', 'cafe']), 'explore');
    expect(tramp.category).toBe('soft_play');
    expect(soft.category).toBe('soft_play');
    expect(tramp.googlePrimaryType).toBe('trampoline_park');
    expect(tramp.googleTypes).toContain('trampoline_park');
    expect(soft.googlePrimaryType).toBe('indoor_playground');
    expect(soft.googleTypes).not.toContain('trampoline_park');
  });

  it('a trampoline park that Google files under park is still found by its name, and keeps its types', () => {
    const record = googlePlaceToRecord(place('A1', 'AirHop Adventure & Trampoline Park Example', 'park', ['park', 'point_of_interest', 'establishment']), 'explore');
    expect(record.category).toBe('soft_play');
    expect(record.googlePrimaryType).toBe('park');
  });

  it('a cafe on site does not turn a soft play centre into a rejection', () => {
    const record = googlePlaceToRecord(place('S2', 'Little Ones Soft Play', 'indoor_playground', ['indoor_playground', 'cafe', 'restaurant']), 'explore');
    expect(record).not.toBeNull();
    expect(record.category).toBe('soft_play');
  });
});
