/**
 * The two photography contracts, as data. The installers, the tests and docs/PHOTOGRAPHY_BRIEFS.md all read from here, so
 * the numbers cannot drift apart.
 *
 * A. WELCOME: brand/lifestyle imagery. Generated photography is appropriate. Seven slots, one campaign.
 * B. FIXTURE: synthetic venue photographs for the visual-test/demo fixture ONLY. Never shown as a real venue.
 *
 * Home and Explore show REAL venues, so their photographs come from the provider/cache pipeline or fall back to the
 * non-photographic category art. They have no entry here and never will.
 */

/** Welcome slots (docs/WELCOME_PHOTOGRAPHY.md). `px` is the 3x size to supply; `focal` is % from left, % from top. */
export const WELCOME_SLOTS = [
  { id: 'zoo', scene: 'giraffe', px: [369, 606], focal: [38, 28] },
  { id: 'farm', scene: 'child interacting with a rabbit', px: [521, 522], focal: [55, 52] },
  { id: 'cafe', scene: 'family-friendly café / coffee', px: [460, 480], focal: [50, 52] },
  { id: 'crafts', scene: "children's arts and crafts", px: [322, 572], focal: [40, 50] },
  { id: 'soft-play', scene: 'child playing in colourful soft play', px: [478, 430], focal: [55, 50] },
  { id: 'puddles', scene: 'child in wellies in a puddle / outdoor activity', px: [412, 389], focal: [50, 55] },
  { id: 'aquarium', scene: 'penguin', px: [400, 350], focal: [40, 50] },
];

export const WELCOME_OUTPUT = {
  maxBytes: 150 * 1024,
  /** Aim under the hard budget so a later re-encode never tips a file over it. */
  targetBytes: 140 * 1024,
  qualityRange: [80, 60],
  chroma: '4:2:0',
  progressive: true,
};

/** Fixture categories: the synthetic photograph a card of that kind shows. Portrait 4:5 serves Home's hero and Explore's crop. */
export const FIXTURE_PHOTOS = [
  { id: 'museum', required: true },
  { id: 'park', required: true },
  { id: 'soft-play', required: true },
  { id: 'farm', required: true },
  { id: 'attraction', required: true },
  { id: 'aquarium', required: false },
  { id: 'zoo', required: false },
];

export const FIXTURE_OUTPUT = {
  px: [1600, 2000],
  minPx: [1200, 1500],
  maxBytes: 450 * 1024,
  targetBytes: 400 * 1024,
  qualityRange: [82, 62],
};
