import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8');

/**
 * Every venue photograph a parent sees costs real money. A `/api/places/photo` request that misses
 * the CDN buys a Place Details call AND a Place Photos call from Google, so one photograph nobody
 * looked at is two billable requests.
 *
 * Measured at an iPhone viewport (390x844) against the local fixture on 2026-10-01, driving the real
 * exported web bundle with a browser and counting requests:
 *
 *                            BEFORE   AFTER
 *   Home, on open                 3       3    all three are genuinely on screen
 *   Explore, on open             12       6
 *   Explore, scrolled to the end 15      15    unchanged; the saving is on open
 *
 * Only index=0 is ever requested on either screen, so the three stored photos per venue are not
 * eagerly resolved. These assertions pin the two mechanisms that produced the halving, because both
 * are a single prop away from silently reverting.
 */
describe('the photo request budget', () => {
  it('defaults VenueImage to lazy loading and passes it to the image', () => {
    const src = read('src/components/ui/VenueImage.tsx');
    // The prop, its default, and the pass-through. Dropping any one of the three restores eager
    // loading on every list in the app.
    expect(src).toMatch(/loading\?:\s*'lazy'\s*\|\s*'eager'/);
    expect(src).toMatch(/loading\s*=\s*'lazy'/);
    expect(src).toMatch(/<Image[^>]*\bloading=\{loading\}/);
  });

  it('keeps Explore’s venue list windowed rather than mapped into a ScrollView', () => {
    const src = read('app/(tabs)/explore.tsx');
    // `loading="lazy"` alone does NOT fix this: the attribute was verified on the <img>, and
    // Chromium still fetched all twelve, because its near-viewport threshold is over a thousand
    // pixels on a fast connection. Windowing the list keeps the row out of the tree entirely.
    expect(src).toMatch(/<FlatList/);
    const initial = /initialNumToRender=\{(\d+)\}/.exec(src);
    const window = /windowSize=\{(\d+)\}/.exec(src);
    expect(initial, 'Explore must bound how many rows it renders up front').not.toBeNull();
    expect(window, 'Explore must bound its render window').not.toBeNull();
    // Bounded, and bounded tightly enough to matter. React Native's own default windowSize is 21,
    // which renders ten screens either side and buys every photograph in the list.
    expect(Number(initial![1])).toBeLessThanOrEqual(6);
    expect(Number(window![1])).toBeLessThanOrEqual(3);
    // The rows a parent cannot see must not be mapped out alongside the list.
    expect(src).not.toMatch(/filteredVenues\.map\(/);
  });

  it('still shows the deck’s rear cards, which are not hidden layers', () => {
    // Measured: Home's three photographs are all 100% within the viewport at 86-100% effective
    // opacity. They are part of the approved deck, so none of them is a free saving, and the deck
    // is deliberately NOT lazy-gated.
    const deck = read('src/components/home/RecommendationDeck.tsx');
    expect(deck).toMatch(/PlaceShowcaseCardRear/);
    const rearCount = (deck.match(/<PlaceShowcaseCardRear/g) ?? []).length;
    expect(rearCount).toBe(2);
  });
});
