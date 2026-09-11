import { expect, test } from 'vitest';
import { filterVenues } from '../utils/filter-venues';
import { resolveHomeCoordinates } from '../services/places/geo-utils';
import { Venue } from '../types';
const { googlePlaceToRecord } = require('../../../server/places/lib/google-places');

test('Any travel time does not silently hide London venues', () => {
  const venue = { id:'test',category:'park',driveMinutes:70,familyScore:{score:0} } as Venue;
  expect(filterVenues([venue],'all',[],'any',30,'any')).toHaveLength(1);
  expect(filterVenues([venue],'all',[],30,30,'any')).toHaveLength(0);
  expect(filterVenues([venue],'all',[],'any',30,'free')).toHaveLength(0);
});

test('London defaults and Mill Hill resolve independently', () => {
  expect(resolveHomeCoordinates('London').latitude).toBe(51.5074);
  expect(resolveHomeCoordinates('Mill Hill').latitude).toBe(51.613);
});

test('operational does not mean open now and photos have no API key or cached reference', () => {
  const place = {id:'ChIJtest',displayName:{text:'London Park'},location:{latitude:51.5,longitude:-0.1},primaryType:'park',types:['park'],businessStatus:'OPERATIONAL',photos:[{name:'private-reference',authorAttributions:[{displayName:'Photographer'}]}]};
  const record = googlePlaceToRecord(place,'explore');
  expect(record.isOpen).toBeUndefined();
  expect(record.photos[0]).toContain('credit=Photographer');
  expect(record.photos[0]).not.toContain('private-reference');
  expect(googlePlaceToRecord({...place,currentOpeningHours:{openNow:false}},'explore').isOpen).toBe(false);
});
