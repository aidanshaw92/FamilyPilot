import { describe, expect, it } from 'vitest';

import {
  classifyPushchairSuitability,
  collectRelevantSentences,
} from '../../../server/enrichment/_lib/pushchair-evidence.js';

/**
 * These are not invented strings. Every sentence in the PRODUCTION block below was live in
 * FamilyPilot's `venue_source_evidence` on 2026-09-30, on the page behind Paradox Museum London's
 * active `pushchairSuitability = good` claim, while the page itself says prams cannot go in.
 */
const PARADOX_ZERO_GRAVITY =
  'However, please note: The Zero Gravity Room is not wheelchair accessible A few exhibits are not ' +
  'step-free or contain uneven flooring or narrow pathways that may be challenging for some ' +
  'wheelchair users.';
const PARADOX_DENIAL_1 = 'Please keep in mind that the space is not accessible for prams/strollers.';
const PARADOX_DENIAL_2 =
  'The museum space is inaccessible for prams/strollers but pram storage is available at the entrance.';
const PARADOX_FAQ_HEADING = 'Are prams allowed?';

const PARADOX_PRODUCTION_TEXT = [
  PARADOX_ZERO_GRAVITY,
  PARADOX_DENIAL_1,
  PARADOX_DENIAL_2,
  PARADOX_FAQ_HEADING,
].join(' ');

describe('pushchair suitability: the Paradox Museum production regression', () => {
  it('classifies the real Paradox Museum page as difficult, not good', () => {
    expect(classifyPushchairSuitability(PARADOX_PRODUCTION_TEXT)).toEqual({
      value: 'difficult',
      confidence: 'high',
    });
  });

  it('does not treat the FAQ question heading as a welcome statement', () => {
    // "Are prams allowed?" contains the substring "prams allowed", which satisfied a welcome pattern
    // and was the signal that actually produced `good` in production. A question asserts nothing.
    expect(collectRelevantSentences(PARADOX_PRODUCTION_TEXT)).not.toContain(PARADOX_FAQ_HEADING);
  });

  it('yields no verdict at all when the only pushchair mention is a question', () => {
    // Fail closed. Previously the question both qualified the page for classification AND supplied
    // the positive signal, so a page that says nothing produced a parent-facing answer.
    expect(
      classifyPushchairSuitability('Do you have parking? Are prams allowed? How do I book?'),
    ).toBeNull();
  });
});

describe('pushchair suitability: explicit pram denials outrank generic accessibility positives', () => {
  it('reads "not accessible for prams/strollers" as difficult', () => {
    expect(classifyPushchairSuitability(PARADOX_DENIAL_1)).toEqual({
      value: 'difficult',
      confidence: 'high',
    });
  });

  it('reads "inaccessible for prams/strollers" as difficult', () => {
    expect(classifyPushchairSuitability(PARADOX_DENIAL_2)).toEqual({
      value: 'difficult',
      confidence: 'high',
    });
  });

  it('is not talked out of difficult by step-free and lift wording elsewhere on the page', () => {
    const text =
      'Step-free access is available to all floors and there are lifts to every gallery. ' +
      PARADOX_DENIAL_1;
    expect(classifyPushchairSuitability(text)).toEqual({ value: 'difficult', confidence: 'high' });
  });
});

describe('pushchair suitability: negation-aware positive signals', () => {
  it('lets step-free contribute positively when it is not negated', () => {
    const text = 'Pushchairs are welcome throughout the museum. All routes are step-free.';
    expect(classifyPushchairSuitability(text)).toEqual({ value: 'excellent', confidence: 'high' });
  });

  it('does not let "not step-free" contribute positively', () => {
    // The same welcome statement, but the venue says the routes are NOT step-free. That must not
    // upgrade the verdict to excellent on the strength of the word "step-free" appearing.
    const text = 'Pushchairs are welcome throughout the museum. Some routes are not step-free.';
    const result = classifyPushchairSuitability(text);
    expect(result?.value).not.toBe('excellent');
  });

  it('gives no verdict for the Zero Gravity sentence, which never names a pushchair', () => {
    // Worth stating why: this sentence is entirely about wheelchairs, so the pushchair-term gate
    // rejects it on its own. It does NOT demonstrate anything about negation -- see the next test.
    expect(classifyPushchairSuitability(PARADOX_ZERO_GRAVITY)).toBeNull();
  });

  it('does not manufacture good from a negated step-free phrase near a pushchair mention', () => {
    // The second, independent path to `good`: ACCESS_ROUTE_PATTERNS only needs a pushchair-or-
    // wheelchair term within 50 characters of "step-free", with no sentence punctuation between.
    // Paradox's real text satisfies that shape, but only via "wheelchair", so a pushchair term is
    // added here to make the branch reachable and prove the masking is what stops it.
    const text = 'Pushchairs and wheelchairs: a few exhibits are not step-free';
    expect(classifyPushchairSuitability(text)).toBeNull();
  });

  it('reads a flat "No prams allowed" as difficult, not as a welcome', () => {
    // Found by probing the exported classifier directly rather than in the corpus, and it is the
    // same shape of bug as Paradox: the denial rule was written as `no pram` with a trailing word
    // boundary, so the plural slipped past it, while "prams allowed" matched a welcome pattern in
    // those same three words. A flat denial was being read as permission.
    expect(classifyPushchairSuitability('No prams allowed.')).toEqual({
      value: 'difficult',
      confidence: 'high',
    });
  });

  it('classifies a denial too short to be a candidate sentence', () => {
    // "No prams." is nine characters. The candidate-gathering splitter drops fragments of ten or
    // fewer, which is correct there and was wrong once classifier input was routed through it.
    expect(classifyPushchairSuitability('No prams.')).toEqual({
      value: 'difficult',
      confidence: 'high',
    });
  });

  it('does not read a negated welcome verb as a welcome', () => {
    // "allowed" sits 6 characters from "pushchairs" here, which satisfied a welcome pattern even
    // though the sentence denies access. Left unmasked this downgrades the verdict from difficult
    // to mixed, because an explicit denial plus an apparent welcome is treated as a contradiction.
    const text = 'Prams are not allowed, and pushchairs must be left at the entrance.';
    expect(classifyPushchairSuitability(text)).toEqual({ value: 'difficult', confidence: 'high' });
  });
});

describe('pushchair suitability: a real welcome plus a local caveat is still not difficult', () => {
  it('returns mixed, not difficult, when an explicit welcome meets an explicit local limit', () => {
    const text =
      'Pushchairs are welcome in the park and around the farmyard. ' +
      'Pushchairs are not suitable for the woodland trail, which has steps.';
    expect(classifyPushchairSuitability(text)).toEqual({ value: 'mixed', confidence: 'high' });
  });

  it('returns good, not difficult, for a welcome alongside terrain caveats', () => {
    const text =
      'Buggies are welcome across the site. Some paths are uneven and can get muddy after rain.';
    expect(classifyPushchairSuitability(text)).toEqual({ value: 'good', confidence: 'high' });
  });
});

/**
 * Two served claims, both found by sweeping production rather than by reading code.
 *
 *   Victoria and Albert Museum  good  "The Cromwell Road and Exhibition Road entrances are step-free
 *                                      and wheelchair accessible. Access The nearest step-free tube
 *                                      stations are Knightsbridge ..."
 *   V&A East Storehouse         good  "We encourage you to leave buggies here before heading to the
 *                                      upper levels Access Our entrance is step-free and wheelchair
 *                                      accessible."
 *
 * The first is about tube stations. The second says the opposite of what was published. Both survived
 * a fresh re-crawl on the then-current code, so neither was stale data.
 */
describe('a wheelchair near step-free is not evidence about a pushchair', () => {
  // Verbatim from production on 2026-10-01.
  const VA = 'The Cromwell Road and Exhibition Road entrances are step-free and wheelchair accessible. '
    + 'Access The nearest step-free tube stations are Knightsbridge (0 miles) and Earl\'s Court (1 miles). '
    + 'Buggies are available to borrow.';
  const VA_EAST = 'We encourage you to leave buggies here before heading to the upper levels '
    + 'Access Our entrance is step-free and wheelchair accessible.';

  it('publishes nothing for the V&A, whose step-free sentence is about entrances and tube stations', () => {
    expect(classifyPushchairSuitability(VA)).toBeNull();
  });

  it('publishes nothing for V&A East, whose sentence asks visitors to leave buggies behind', () => {
    expect(classifyPushchairSuitability(VA_EAST)).toBeNull();
  });

  it('still reads step-free when it is a PUSHCHAIR that is near it', () => {
    // The fix narrows the pair, it does not disable it.
    expect(classifyPushchairSuitability('Pushchairs can reach every gallery and the route is step-free.')?.value)
      .toBe('good');
  });

  it('publishes nothing when the wheelchair comes BEFORE step-free either', () => {
    // Verbatim, and on three venues' pages at once -- the V&A, Young V&A and V&A East Storehouse.
    // It is a wheelchair section heading followed by a wheelchair sentence; no pushchair in sight.
    // A mutation that restored `wheelchair` to only the first of the two alternatives broke no test
    // until this one existed, because every other case here has step-free first.
    const WHEELCHAIR_SECTION = 'Wheelchair and physical access Using a wheelchair There is step-free '
      + 'access throughout our building. Buggies are available to borrow.';
    expect(classifyPushchairSuitability(WHEELCHAIR_SECTION)).toBeNull();
  });

  it('publishes nothing for Gunnersbury\'s limited-mobility wording', () => {
    expect(
      classifyPushchairSuitability('Visitors who are wheelchair users or who have limited mobility '
        + 'Step-free access is available throughout the museum. Pushchairs can be brought in.'),
    ).not.toBeNull();
    // ^ that one DOES carry a pushchair sentence of its own, so a verdict is right. The wheelchair
    // span must not be what produces it:
    expect(
      classifyPushchairSuitability('Visitors who are wheelchair users or who have limited mobility '
        + 'Step-free access is available throughout the museum. A buggy store is by the entrance.'),
    ).toBeNull();
  });

  it('keeps wide aisles reading for both, because width serves both equally', () => {
    expect(classifyPushchairSuitability('Our wide aisles mean pushchairs can move freely throughout.')?.value)
      .toBe('good');
  });

  it('does not widen the pair to buggy or pram, which would republish station advice', () => {
    // Winter Wonderland, verbatim, and already pinned in venue-source-integrity.test.ts as something
    // the corpus shows must not become a venue fact. A first attempt at this fix widened the
    // pushchair side to `buggy|buggies|pram` and brought it straight back.
    expect(classifyPushchairSuitability('If you require step-free access or are travelling with a buggy, '
      + 'it is advised to use Green Park or Bond Street stations to make use of the lift facilities.')).toBeNull();
  });
});

/**
 * "Leave your buggy here" is a limitation, not a welcome: part of the venue cannot be done with a
 * pushchair. 17 occurrences across the stored corpus, and before this it supported nothing -- so a
 * page that both welcomed buggies AND asked visitors to park them read as an unqualified `good`.
 */
describe('being asked to leave the buggy is a limitation', () => {
  it('turns a welcome into mixed rather than good', () => {
    expect(
      classifyPushchairSuitability(
        'Buggies are welcome in the grounds, but we ask you to leave buggies before the upper floor.',
      )?.value,
    ).toBe('mixed');
  });

  it('leaves an unqualified welcome alone', () => {
    expect(classifyPushchairSuitability('Buggies are welcome in all our galleries.')?.value).toBe('good');
  });

  it('does not override an explicit refusal', () => {
    expect(classifyPushchairSuitability('No prams allowed. Please leave your pushchair at reception.')?.value)
      .toBe('difficult');
  });
});
