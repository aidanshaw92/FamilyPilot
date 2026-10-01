import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  classifyPushchairSuitability,
  extractPushchairEvidence,
  collectRelevantSentences,
  hasPushchairSpecificTerm,
  maskNonPushchairBuggy,
} = require('../../../server/enrichment/_lib/pushchair-evidence.js');

const verdict = (text: string): string | null => {
  const r = classifyPushchairSuitability(text) as { value: string } | null;
  return r ? r.value : null;
};

/**
 * "Buggy" is the commonest UK word for a pushchair, and this field depends on reading it that way.
 * It is also what a stately home calls the golf buggy that ferries visitors from the car park.
 *
 * Hatfield Park served `pushchairSuitability = difficult` -- "Hard going with a pushchair" to a
 * parent -- off a sentence announcing that its golf-buggy shuttle was suspended.
 */
describe('a golf buggy is a vehicle, not a pushchair', () => {
  it('does not read a suspended buggy shuttle as a terrain warning', () => {
    // Hatfield Park's deciding sentence, verbatim. The footer chrome in front of it is part of the
    // same pseudo-sentence because the footer run carries no sentence terminator.
    expect(verdict('Etheldreda’s Parish Church Real Tennis Court Follow Us Instagram Facebook '
      + 'LinkedIn Privacy Notice | Cookie Notice | Terms & Conditions of Sale &copy; 2026 Hatfield '
      + 'Park | Hatfield Park Partnership, The Estate Office, Melon Ground, Hatfield Park, Hatfield, '
      + 'Herts, AL9 5NB Opening Times Prices - Hatfield Park Please note there is currently no buggy '
      + 'service at Hatfield Park.')).toBeNull();
    // The same sentence on its own, which is what a refetched page would carry.
    expect(verdict('Please note there is currently no buggy service at Hatfield Park.')).toBeNull();
  });

  it('reads the sentence that says what the buggy actually is', () => {
    // Hatfield says it twice, on two pages, in two wordings.
    expect(verdict('When the park is open, a golf buggy is available to assist those who may need '
      + 'help from the car park to the Stable Yard and/or the entrance to the House & Gardens.')).toBeNull();
    expect(verdict('When the park is open, a golf buggy is available to help those who may need '
      + 'assistance from the car park to the Stable Yard and/or entrance to the House & Gardens.')).toBeNull();
  });

  it('does not qualify a page for classification at all', () => {
    // The term gate runs on the masked text, so a page whose only pushchair word is a golf buggy is
    // not even collected. Otherwise its terrain wording could still reach a `mixed` verdict.
    expect(hasPushchairSpecificTerm('A golf buggy is available from the car park.')).toBe(false);
    expect(collectRelevantSentences('A golf buggy is available from the car park. The paths are '
      + 'gravel and uneven in places.')).toEqual([]);
  });
});

/**
 * The mask is deliberately narrow. Masking can only move a verdict towards unknown, so every word
 * added here costs coverage -- which is why only the vehicle compounds are listed.
 */
describe('the pushchair sense of buggy still decides the field', () => {
  it('keeps a flat denial', () => {
    expect(verdict('No buggies are allowed in the house.')).toBe('difficult');
    expect(verdict('No pushchairs are allowed in the gallery.')).toBe('difficult');
  });

  it('keeps a welcome', () => {
    expect(verdict('Buggies are welcome throughout the farm.')).toBe('good');
  });

  it('reads Woodside Animal Farm as mixed, which is what its page says', () => {
    // Verbatim. This expectation was `difficult` when the test was first written, matching the
    // served value -- and the served value was wrong. The page says the whole park IS accessible for
    // buggies and that one building is not, so `difficult` ("hard going with a pushchair") told a
    // parent the opposite of the sentence it came from. "buggy park" is still NOT masked: it is
    // where you leave a pushchair, which is a real limitation.
    expect(verdict('Buggies The whole park is accessible for buggies but please note that for fire '
      + 'safety reasons buggies are not permitted in the PlayBarn. We do have an undercover buggy '
      + 'park, which is a safe dry place to leave your buggy.')).toBe('mixed');
  });

  it('still reads buggy hire, which at a visitor attraction is a pushchair to borrow', () => {
    expect(maskNonPushchairBuggy('Buggy hire is available at the entrance.'))
      .toContain('Buggy hire');
    expect(verdict('Buggy hire is available and buggies are welcome throughout.')).toBe('good');
  });

  it('reads a page that uses BOTH senses', () => {
    // The gate alone is not enough here: this page has a real pushchair term, so it qualifies, and
    // the vehicle wording must still be masked where the verdict is decided and where the excerpt is
    // built. Otherwise "no buggy service" outvotes the welcome, and the excerpt a parent reads leads
    // with a golf buggy.
    const text = 'Buggies are welcome throughout the park. Please note there is currently no buggy '
      + 'service at Hatfield Park. A golf buggy is available to assist those who may need help from '
      + 'the car park.';
    expect(verdict(text)).toBe('good');
    expect(collectRelevantSentences(text)).toEqual(['Buggies are welcome throughout the park.']);
    const evidence = extractPushchairEvidence(text, {
      url: 'https://example.org/visit', sourceType: 'visitor_info', retrievedAt: new Date().toISOString(),
    }) as { value: string; evidenceText: string } | null;
    expect(evidence?.value).toBe('good');
    expect(evidence?.evidenceText).not.toContain('golf buggy');
    expect(evidence?.evidenceText).not.toContain('buggy service');
  });

  it('masks only the compound, leaving the rest of the sentence readable', () => {
    const masked = maskNonPushchairBuggy('A golf buggy runs to the Stable Yard, and buggies are welcome.');
    expect(masked).not.toContain('golf buggy');
    expect(masked).toContain('buggies are welcome');
  });
});
