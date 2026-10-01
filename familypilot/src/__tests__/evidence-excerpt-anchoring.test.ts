import { describe, expect, it } from 'vitest';

import { extractPushchairEvidence } from '../../../server/enrichment/_lib/pushchair-evidence.js';

/**
 * An excerpt is the only thing a reviewer sees to judge a claim by, so one that omits its own
 * reasoning makes a sound claim look invented.
 *
 * Scope here is `pushchairSuitability` ONLY, because that is the only place production shows the
 * problem. Measured over all 670 stored texts and 1,260 field-pattern facts, **zero** excerpts were
 * missing the wording that triggered them: the field patterns window a sentence with 320 characters of
 * trailing context, which in practice reaches the trigger. An earlier version of this work also
 * re-anchored those excerpts on the matched rule and gave `freeParking` its own anchor; both were
 * reverted as unjustified, and the `freeParking` anchor was actively dangerous -- `EVIDENCE_ANCHORS`
 * windows a sentence BEFORE matching too, so it shrank the text the rules read, dropped "short break
 * includes" out of range and republished Thorpe Park's false `freeParking = yes` from #115.
 *
 * The pushchair classifier is different in kind: its verdict is reached over several sentences at
 * once, so there is no matching offset to window on, and the excerpt was simply the relevant
 * sentences in page order cut to 400 characters. The reasoning fell off the end.
 */

const pushchair = (text: string) =>
  extractPushchairEvidence(text, {
    url: 'https://venue.example/visit',
    sourceType: 'official_website',
    retrievedAt: '2026-10-01T00:00:00.000Z',
  });

describe('pushchair excerpts lead with the sentence that decided the verdict', () => {
  it('leads with the pram denial for Paradox Museum London', () => {
    // Production: the stored excerpt began with the Zero Gravity Room and never reached the denial
    // that produced the verdict.
    const text =
      'However, please note: The Zero Gravity Room is not wheelchair accessible A few exhibits are ' +
      'not step-free or contain uneven flooring or narrow pathways that may be challenging for some ' +
      'wheelchair users. Please keep in mind that the space is not accessible for prams/strollers. ' +
      'The museum space is inaccessible for prams/strollers but pram storage is available.';
    const fact = pushchair(text);
    expect(fact?.value).toBe('difficult');
    expect(fact?.evidenceText).toMatch(/^Please keep in mind that the space is not accessible for prams/);
  });

  it('leads with the welcome statement rather than unrelated step-free copy', () => {
    // Shaped after Young V&A's live excerpt, which is 400 characters at the cap and reads "Our
    // entrance is step-free and wheelchair accessible." three times followed by travel directions,
    // with no pushchair term anywhere in it. Note that this reordering does NOT repair Young V&A
    // itself: its real page carries no welcome statement at all, so there is nothing to promote --
    // see the ACCESS_ROUTE_PATTERNS finding in docs/snapshots/extraction-quality-2026-10-01. The
    // welcome sentence below is added to exercise the reordering.
    const text =
      'Our entrance is step-free and wheelchair accessible. Our entrance is step-free and wheelchair ' +
      'accessible. Getting here Bethnal Green underground (2-minute walk) Cambridge Heath overground ' +
      '(5-minute walk) Nearest step-free access station is Whitechapel (18-minute walk) Buses 106, ' +
      '254, 388 and D6 stop nearby. Pushchairs are welcome throughout the galleries.';
    const fact = pushchair(text);
    // step-free with no caveats correctly elevates this to excellent; the point of the test is that
    // the excerpt names a pushchair rather than leading with the step-free entrance sentence.
    expect(fact?.value).toBe('excellent');
    expect(fact?.evidenceText).toMatch(/^Pushchairs are welcome throughout the galleries/);
  });

  it('survives the 400-character cap: the reasoning is no longer truncated away', () => {
    // The defect is only visible past the cap. The denial sits last here, more than 400 characters in,
    // so page order alone guarantees it is cut.
    const filler =
      'Getting here Bethnal Green underground is a two-minute walk and Cambridge Heath overground is ' +
      'a five-minute walk from the main entrance. Buses 106, 254, 388 and D6 all stop nearby, and a ' +
      'bike station is available just outside the building for visitors arriving by cycle. ' +
      'Our entrance is step-free and wheelchair accessible throughout the ground floor galleries. ';
    const text = `${filler}Pushchairs are not permitted beyond the foyer.`;
    expect(text.length).toBeGreaterThan(400);
    const fact = pushchair(text);
    expect(fact?.value).toBe('difficult');
    expect(fact?.evidenceText).toMatch(/^Pushchairs are not permitted beyond the foyer/);
  });

  it('respects negation when choosing the deciding sentence', () => {
    // The chosen sentence for a positive verdict is matched against the negation-masked text, so a
    // sentence that only looks welcoming ("prams are not allowed") cannot be promoted as the reason.
    const text =
      'Prams are not allowed in the upper galleries at any time of day for safety reasons. ' +
      'Buggies are welcome across the ground floor and in the garden. Some paths are uneven.';
    const fact = pushchair(text);
    expect(fact?.value).toBe('mixed');
    expect(fact?.evidenceText).not.toMatch(/^Buggies are welcome/);
  });

  it('prefers a deciding sentence that names a pushchair over a bare terrain one', () => {
    // Only reachable for `mixed`, because MIXED_PATTERNS are the one group that does not require a
    // pushchair term: "Many steps lead to..." matches the verdict first in page order, but says
    // nothing about prams. The subject-naming preference and the difficult patterns in the `mixed`
    // set are both load-bearing here, and nothing else in the suite exercises either.
    const text =
      'Many steps lead to the upper floor of the historic house. ' +
      'Pushchairs are welcome in the garden and around the lake. ' +
      'Pushchairs are not suitable for the woodland trail.';
    const fact = pushchair(text);
    expect(fact?.value).toBe('mixed');
    expect(fact?.evidenceText).toMatch(/^Pushchairs are not suitable for the woodland trail/);
  });

  it('does not change any verdict by reordering', () => {
    const cases: Array<[string, string]> = [
      ['Buggies are welcome across the site. Some paths are uneven and can get muddy after rain.', 'good'],
      ['Pushchairs are welcome throughout the museum. All routes are step-free.', 'excellent'],
      ['No prams allowed.', 'difficult'],
      ['Please keep in mind that the space is not accessible for prams/strollers.', 'difficult'],
    ];
    for (const [text, expected] of cases) {
      expect(pushchair(text)?.value).toBe(expected);
    }
  });
});
