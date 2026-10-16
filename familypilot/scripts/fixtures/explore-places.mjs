/**
 * A London-wide stand-in for the stored catalogue, for the Explore journeys (`FIXTURE_EXPLORE=1`, see serve-places-fixture.mjs).
 *
 * Names and positions are those of well-known public places, to about 100 m, and the facts follow the SHAPE of what the hosted
 * catalogue records (docs/CATALOGUE_BOTTLENECKS.md): some places have a confirmed "yes", a few a confirmed "no" (only parking has
 * ever been recorded as no), and most have nothing recorded. No place carries a recommended age or a price, because none does
 * today. Nothing here is a claim about a real venue's facilities: it is data to exercise the screens in the states a parent
 * meets. Zero spend: it is read from this file, never from a provider.
 *
 * The soft play ids are the real FamilyPilot ids, because Explore's reviewed classification (src/utils/venue-classification.ts)
 * is keyed by them; every other id is synthetic.
 */
const P = (id) => `fp-google-${id}`;

/** [name, category, latitude, longitude, facts, extra] */
export const EXPLORE_SPEC = [
  // Soft play and trampoline parks: the six stored as soft play.
  { id: P('ChIJ7_PV980bdkgROekbwOVWVfo'), name: 'Babylon Park London', category: 'soft_play', lat: 51.542, lng: -0.145, facts: { parking: 'no' }, ptype: 'amusement_center' },
  { id: P('ChIJb5wm6eQQdkgR-qbm_aXw0xw'), name: 'Flip Out Brent Cross', category: 'soft_play', lat: 51.569, lng: -0.228, facts: { parking: 'no' }, ptype: 'indoor_playground' },
  { id: P('ChIJ2fFKeuMDdkgRLHMNKVOxX_s'), name: 'Flip Out Canary Wharf', category: 'soft_play', lat: 51.505, lng: -0.021, facts: { parking: 'yes' }, ptype: 'indoor_playground' },
  { id: P('ChIJ0ZZcI7hrdkgR4ooSY3kKOMo'), name: 'Flip Out Watford', category: 'soft_play', lat: 51.655, lng: -0.392, facts: { babyChanging: 'yes' }, pushchair: 'good', ptype: 'amusement_park' },
  { id: P('ChIJbe-XLh0fdkgRnjEVL2_qP3E'), name: 'AirHop Adventure & Trampoline Park Enfield', category: 'soft_play', lat: 51.643, lng: -0.059, facts: {}, ptype: 'park' },
  { id: P('ChIJi3VUUWoWdkgRluIRG5hbIlY'), name: 'Jump In by AirHop Adventure & Trampoline Park Elstree', category: 'soft_play', lat: 51.659, lng: -0.263, facts: {}, ptype: 'park' },
  // Farms and animals.
  { name: 'Kentish Town City Farm', category: 'farm', lat: 51.552, lng: -0.150, facts: { parking: 'no', toilets: 'yes' }, pushchair: 'good' },
  { name: 'Hackney City Farm', category: 'farm', lat: 51.532, lng: -0.067, facts: { cafe: 'yes', parking: 'no', toilets: 'yes', babyChanging: 'yes' } },
  { name: 'Mudchute Park and Farm', category: 'farm', lat: 51.492, lng: -0.010, facts: { cafe: 'yes', toilets: 'yes', babyChanging: 'yes' } },
  { name: 'Belmont Children’s Farm', category: 'farm', lat: 51.622, lng: -0.232, facts: { cafe: 'yes', parking: 'yes' } },
  { name: 'London Zoo', category: 'zoo', lat: 51.535, lng: -0.153, facts: {} },
  { name: 'Golders Hill Park Zoo', category: 'zoo', lat: 51.567, lng: -0.189, facts: {} },
  { name: 'Horniman Butterfly House', category: 'zoo', lat: 51.442, lng: -0.060, facts: {} },
  { name: 'Hobbledown Heath', category: 'zoo', lat: 51.459, lng: -0.396, facts: { parking: 'yes', playground: 'yes' } },
  { id: P('ChIJc2nSALkEdkgRviluWxwFsxA'), name: 'SEA LIFE London Aquarium', category: 'attraction', lat: 51.502, lng: -0.120, facts: { toilets: 'yes', babyChanging: 'yes' }, ptype: 'aquarium' },
  // Museums and galleries.
  { name: 'The Postal Museum', category: 'museum', lat: 51.525, lng: -0.114, facts: { babyChanging: 'yes', cafe: 'yes' } },
  { name: 'The British Museum', category: 'museum', lat: 51.519, lng: -0.127, facts: {} },
  { name: 'Paradox Museum London', category: 'museum', lat: 51.500, lng: -0.164, facts: {}, pushchair: 'difficult' },
  { name: 'Young V&A', category: 'museum', lat: 51.529, lng: -0.055, facts: { toilets: 'yes', babyChanging: 'yes', cafe: 'yes' } },
  { name: 'Science Museum', category: 'museum', lat: 51.497, lng: -0.177, facts: { toilets: 'yes', babyChanging: 'yes', cafe: 'yes' } },
  { name: 'V&A East Storehouse', category: 'museum', lat: 51.546, lng: -0.021, facts: { parking: 'no', toilets: 'yes' } },
  { name: 'Freud Museum London', category: 'museum', lat: 51.548, lng: -0.177, facts: {} },
  { name: 'Museum of the Home', category: 'museum', lat: 51.532, lng: -0.076, facts: { cafe: 'yes', toilets: 'yes' } },
  { name: 'Royal Air Force Museum London', category: 'museum', lat: 51.598, lng: -0.238, facts: { parking: 'yes', cafe: 'yes', toilets: 'yes', babyChanging: 'yes' } },
  { name: 'Discover Children’s Story Centre', category: 'museum', lat: 51.539, lng: 0.000, facts: { cafe: 'yes' } },
  { name: 'London Museum Docklands', category: 'museum', lat: 51.508, lng: -0.024, facts: {} },
  { id: P('ChIJq4lX1doEdkgR5JXPstgQjc0'), name: 'Churchill War Rooms', category: 'attraction', lat: 51.502, lng: -0.129, facts: {}, ptype: 'history_museum' },
  // Attractions and activities.
  { name: 'London Eye', category: 'attraction', lat: 51.503, lng: -0.120, facts: { parking: 'no', toilets: 'yes', babyChanging: 'yes' }, pushchair: 'mixed' },
  { name: 'Lane7 London Camden', category: 'activity', lat: 51.542, lng: -0.144, facts: {} },
  { name: 'Alexandra Palace Ice Rink', category: 'activity', lat: 51.595, lng: -0.130, facts: {} },
  { name: 'Rowans Tenpin Bowl', category: 'activity', lat: 51.565, lng: -0.105, facts: {} },
  { id: P('ChIJjXVQ6QNBdkgRUpu1zpMlFSs'), name: 'Hogwarts Castle', category: 'attraction', lat: 51.691, lng: -0.418, facts: {} },
  // Parks and playgrounds.
  { name: 'Clissold Park', category: 'park', lat: 51.560, lng: -0.090, facts: { playground: 'yes', toilets: 'yes', cafe: 'yes' } },
  { name: 'Highbury Fields', category: 'park', lat: 51.550, lng: -0.100, facts: {} },
  { name: 'Victoria Park', category: 'park', lat: 51.540, lng: -0.040, facts: { cafe: 'yes', toilets: 'yes' } },
  { name: 'Gladstone Park', category: 'park', lat: 51.560, lng: -0.240, facts: { playground: 'yes' } },
  { name: 'The Regent’s Park', category: 'park', lat: 51.530, lng: -0.160, facts: { cafe: 'yes', toilets: 'yes' } },
  { name: 'Waterlow Park', category: 'park', lat: 51.570, lng: -0.140, facts: { cafe: 'yes' } },
  { name: 'Golders Hill Park', category: 'park', lat: 51.570, lng: -0.190, facts: { playground: 'yes', cafe: 'yes', toilets: 'yes' } },
  { name: 'Hampstead Heath', category: 'park', lat: 51.560, lng: -0.160, facts: {} },
  { name: 'Primrose Hill', category: 'park', lat: 51.540, lng: -0.160, facts: {} },
  { name: 'Battersea Park', category: 'park', lat: 51.480, lng: -0.160, facts: { playground: 'yes', cafe: 'yes', toilets: 'yes' } },
  { name: 'Queen Elizabeth Olympic Park', category: 'park', lat: 51.540, lng: -0.020, facts: { cafe: 'yes', playground: 'yes' } },
  { name: 'Brockwell Park', category: 'park', lat: 51.450, lng: -0.110, facts: { playground: 'yes' } },
  { id: P('ChIJYXZohAkQdkgRfyZIWSl03SM'), name: 'Paddington Recreation Ground', category: 'activity', lat: 51.530, lng: -0.191, facts: {}, ptype: 'park' },
  { id: P('ChIJgUtOcjEcdkgR6Y_NLIc0XBQ'), name: 'Walthamstow Wetlands, London Wildlife Trust', category: 'attraction', lat: 51.585, lng: -0.051, facts: { toilets: 'yes', cafe: 'yes', babyChanging: 'yes' }, ptype: 'nature_preserve' },
];
