/**
 * Rows read from the hosted catalogue (public.place_records joined to public.venue_family_metadata) on 2026-10-12, read-only,
 * reduced to the fields Family Fit reads. Facts only: no recommended ages, buggy ratings or terrain were stored for any of
 * these on that date, which is exactly the state the grading has to be sensible in. Used by the grading regression tests and
 * the before/after report; nothing here is invented.
 */
import { VenueFamilyMetadata } from '@/src/types/places';

export interface StoredVenueRow {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  metadata: VenueFamilyMetadata;
}

const row = (id: string, name: string, category: string, latitude: number, longitude: number, meta: Partial<VenueFamilyMetadata>): StoredVenueRow => ({
  id, name, category, latitude, longitude,
  metadata: { familypilotPlaceId: id, enrichmentStatus: 'enriched', ...meta } as VenueFamilyMetadata,
});

export const STORED_VENUES: Record<string, StoredVenueRow> = {
  goldersHill: row('fp-google-ChIJATb-mYIQdkgRH82PlPcn3cs', 'Golders Hill Park', 'park', 51.567476, -0.1883365, {
    facilities: ['toilets', 'baby_changing', 'cafe', 'playground'],
    familyFacilities: { cafe: 'yes', toilets: 'yes', playground: 'yes', babyChanging: 'yes' },
    accessibility: { accessibleToilet: 'yes' },
  }),
  hampsteadHeath: row('fp-google-ChIJIzJDyggadkgROFAV19Ti070', 'Hampstead Heath', 'park', 51.5608, -0.1629, {
    facilities: ['toilets', 'baby_changing'],
    familyFacilities: { toilets: 'yes', babyChanging: 'yes' },
    accessibility: { accessibleToilet: 'yes' },
  }),
  primroseHill: row('fp-google-ChIJ2yb0sesadkgRIQOyE6qMxLU', 'Primrose Hill', 'park', 51.5387, -0.1607, {
    facilities: [], familyFacilities: {}, accessibility: {},
  }),
  batterseaPark: row('fp-google-ChIJOWBQvA4FdkgRQf5iYYFF1v4', 'Battersea Park', 'park', 51.4791, -0.1565, {
    facilities: ['playground'], familyFacilities: { playground: 'yes' }, accessibility: {},
  }),
  hackneyFarm: row('fp-google-ChIJvS60MMEcdkgRSMlH5VxD51Y', 'Hackney City Farm', 'farm', 51.5325, -0.0646, {
    facilities: ['toilets', 'baby_changing', 'cafe'],
    familyFacilities: { cafe: 'yes', parking: 'no', toilets: 'yes', babyChanging: 'yes' },
    accessibility: { accessibleToilet: 'yes' },
  }),
  kentishFarm: row('fp-google-ChIJAdLvZfkadkgRjwFvlivSzpo', 'Kentish Town City Farm', 'farm', 51.5516, -0.1468, {
    facilities: ['toilets'],
    familyFacilities: { parking: 'no', toilets: 'yes', freeParking: 'no' },
    pushchairSuitability: 'good',
    accessibility: { accessibleToilet: 'yes', wheelchairAccessible: 'yes' },
  }),
  woodsideFarm: row('fp-google-ChIJUbfIyIRIdkgRcKIgh6f-Y9c', 'Woodside Animal Farm', 'farm', 51.9, -0.42, {
    facilities: ['toilets', 'baby_changing', 'cafe', 'playground'],
    familyFacilities: { cafe: 'yes', toilets: 'yes', playground: 'yes', freeParking: 'yes', babyChanging: 'yes' },
    pushchairSuitability: 'mixed',
    accessibility: { accessibleToilet: 'yes', wheelchairAccessible: 'yes' },
  }),
  hobbledown: row('fp-google-ChIJqfua7FhzdkgRqSRaMoloxR0', 'Hobbledown Heath', 'zoo', 51.42, -0.33, {
    facilities: ['parking', 'playground'], familyFacilities: { parking: 'yes', playground: 'yes' }, accessibility: {}, environment: 'outdoor',
  }),
  raf: row('fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc', 'Royal Air Force Museum London', 'museum', 51.5984, -0.2383, {
    facilities: ['toilets', 'baby_changing', 'parking', 'cafe', 'playground'],
    familyFacilities: { cafe: 'yes', parking: 'yes', toilets: 'yes', playground: 'yes', freeParking: 'no', babyChanging: 'yes' },
    pushchairSuitability: 'good',
    accessibility: { accessibleToilet: 'yes', wheelchairAccessible: 'yes' },
  }),
  horniman: row('fp-google-ChIJSzwgydoDdkgRndnXVYQGXBI', 'Horniman Museum and Gardens', 'museum', 51.4412, -0.0612, {
    facilities: ['toilets', 'baby_changing', 'cafe', 'playground'],
    familyFacilities: { cafe: 'yes', toilets: 'yes', playground: 'yes', babyChanging: 'yes' },
    accessibility: { accessibleToilet: 'yes' },
  }),
  youngVA: row('fp-google-ChIJyxOhp9scdkgR3ciFcAfeG1c', 'Young V&A', 'museum', 51.5293, -0.0553, {
    facilities: ['toilets', 'baby_changing', 'cafe'],
    familyFacilities: { cafe: 'yes', toilets: 'yes', babyChanging: 'yes' },
    accessibility: { accessibleToilet: 'yes', wheelchairAccessible: 'yes' },
  }),
  discover: row('fp-google-ChIJJ2CD1mEddkgRAuOi9iSzBrk', "Discover Children's Story Centre", 'museum', 51.5407, 0.0018, {
    facilities: ['cafe'], familyFacilities: { cafe: 'yes' }, accessibility: {},
  }),
  flipOutWatford: row('fp-google-ChIJ0ZZcI7hrdkgR4ooSY3kKOMo', 'Flip Out Watford', 'soft_play', 51.65, -0.39, {
    facilities: ['baby_changing'], familyFacilities: { babyChanging: 'yes' }, pushchairSuitability: 'good',
    accessibility: { accessibleToilet: 'yes', wheelchairAccessible: 'yes' }, environment: 'indoor',
  }),
  babylonPark: row('fp-google-ChIJ7_PV980bdkgROekbwOVWVfo', 'Babylon Park London', 'soft_play', 51.5156, -0.1527, {
    facilities: [], familyFacilities: { parking: 'no' }, accessibility: {}, environment: 'indoor',
  }),
  thorpePark: row('fp-google-ChIJYQVF6Hh3dkgRKW4X8lXi-HI', 'Thorpe Park', 'activity', 51.405, -0.512, {
    facilities: ['parking'], familyFacilities: { parking: 'yes' }, accessibility: {},
  }),
};
