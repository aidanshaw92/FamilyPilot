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

  it('bounds the Home deck to a fixed window of mounted cards, all loaded eagerly', () => {
    // The deck used to mount the foreground card and two lite rear layers (3 photographs). It now mounts one
    // card behind and three ahead so the photograph of a card arriving as a strip has already loaded: a swipe
    // never reveals a blank. That is one more photograph on open and none more per swipe, and this pins the
    // window so it cannot quietly grow into "render the whole list".
    const deck = read('src/components/home/RecommendationDeck.tsx');
    const behind = /export const DECK_BEHIND = (\d+)/.exec(deck);
    const ahead = /export const DECK_AHEAD = (\d+)/.exec(deck);
    expect(behind && ahead, 'the deck must declare its window').toBeTruthy();
    expect(Number(behind![1]) + 1 + Number(ahead![1])).toBeLessThanOrEqual(5);
    // The window is what is rendered; the deck never maps the whole list.
    expect(deck).not.toMatch(/venues\.map\(/);
    expect(deck).toMatch(/imageLoading="eager"/);
    // Cards are keyed by venue so a loaded photograph is never loaded a second time.
    expect(deck).toMatch(/key=\{venues\[i\]\.id\}/);
  });
});
