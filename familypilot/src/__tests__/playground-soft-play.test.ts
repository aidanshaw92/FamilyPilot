import { describe, expect, it } from 'vitest';

const {
  extractEvidenceFromText,
  isSoftPlayOnlyPlayground,
} = require('../../../server/enrichment/_lib/evidence-extractor.js');

/**
 * `familyFacilities.playground` must not be published from soft-play wording.
 *
 * This is not a taxonomy opinion. FamilyPilot has already decided that soft play and a playground are
 * different things, in every place the decision surfaces:
 *
 *   - `src/types/index.ts` gives `FacilityType` both `playground` and `soft_play`, and `VenueCategory`
 *     a separate `soft_play`.
 *   - `FacilityGrid.tsx` draws them as two chips with two labels ("Playground", "Soft play").
 *   - `format-category.ts` names soft play in its own right.
 *   - `plan-categories.ts` filters `soft_play` by venue category.
 *   - `facility-match.ts`'s `buildFacilityMissingCaution` matches a parent's must-haves by EXACT
 *     membership, so a family who asked for a playground is not satisfied by soft play. That is the
 *     one that settles it: the product already refuses to substitute them.
 *
 * The extractor was the only part of the system that disagreed. Its `play\s+area` pattern matched "our
 * Soft Play area" and published `playground = yes` at high confidence, which is served to parents.
 *
 * Replay over the ten eligible production evidence rows that mention soft play, before and after
 * (2026-10-01, texts md5-verified against `venue_source_evidence`): exactly one venue changes,
 * Belmont Children's Farm loses `playground = yes` from both of its rows, and no non-playground fact
 * moves anywhere. The five other venues keep the claim for reasons this guard deliberately does not
 * touch, each recorded in docs/snapshots/playground-soft-play-2026-10-01/decision.md.
 */

const meta = {
  url: 'https://venue.example/visit',
  sourceType: 'official_website' as const,
  retrievedAt: '2026-10-01T00:00:00.000Z',
};

function playgroundFact(text: string) {
  const out = extractEvidenceFromText(text, meta);
  const facts = Array.isArray(out) ? out : (out?.facts ?? []);
  return facts.find((f: { field: string }) => f.field === 'playground') ?? null;
}

describe('soft play does not publish a playground', () => {
  it('rejects the exact production sentence that published Belmont Farm\'s claim', () => {
    // Verbatim from venue_source_evidence row 26168940, the sentence the live claim cited.
    expect(
      playgroundFact(
        'We require all parents and guardians to review our Rules & Regulations before visiting our Soft Play area.',
      ),
    ).toBeNull();
  });

  it('rejects the other production sentence from the same venue', () => {
    // Row edec204b. Both of Belmont's eligible rows had to lose the fact, or the claim survives.
    expect(
      playgroundFact(
        'Belmont Farm’s purpose built soft play area accommodates children from 6 months to 10 years and is the perfect place to let off steam and test the mind and body.',
      ),
    ).toBeNull();
  });

  it('rejects soft play written without a space, with a hyphen, and as a session', () => {
    expect(playgroundFact('Softplay area for under fives.')).toBeNull();
    expect(playgroundFact('Our soft-play zone is open daily.')).toBeNull();
    expect(playgroundFact('Soft play sessions run every morning for toddlers.')).toBeNull();
    expect(playgroundFact('The indoor soft play centre is heated all year round.')).toBeNull();
  });
});

describe('a real playground is still published', () => {
  it('keeps a bare playground statement', () => {
    const fact = playgroundFact('There is a large playground next to the cafe.');
    expect(fact?.value).toBe('yes');
    expect(fact?.confidence).toBe('high');
  });

  it('keeps a play area that is not a soft play one', () => {
    expect(playgroundFact('A large play area with swings and a slide sits beside the lake.')?.value).toBe(
      'yes',
    );
  });

  it('keeps a playground that shares its sentence with soft play', () => {
    // The whole reason SOFT_PLAY_PHRASE names its nouns explicitly rather than matching loosely: the
    // playground has to survive the removal.
    expect(
      playgroundFact('We have a soft play area and a large outdoor playground.')?.value,
    ).toBe('yes');
    expect(
      playgroundFact('Our soft play area, plus a large play area outside for sunny days.')?.value,
    ).toBe('yes');
  });

  it('still refuses a playground that is closed or absent', () => {
    // The pre-existing negation handling must be untouched by this guard.
    expect(playgroundFact('There is no playground on site.')?.value).toBe('no');
    expect(playgroundFact('The playground is closed for refurbishment.')).toBeNull();
  });
});

describe('the guard is scoped to the playground decision only', () => {
  it('does not disturb other fields in a soft-play sentence', () => {
    const out = extractEvidenceFromText(
      'Our soft play area has baby changing facilities and accessible toilets, and parking is available.',
      meta,
    );
    const facts = Array.isArray(out) ? out : (out?.facts ?? []);
    const fields = facts.map((f: { field: string }) => f.field).sort();
    expect(fields).not.toContain('playground');
    expect(fields).toContain('babyChanging');
    expect(fields).toContain('accessibleToilet');
    expect(fields).toContain('parking');
  });

  it('is a pure predicate over one sentence, usable on its own', () => {
    expect(isSoftPlayOnlyPlayground('Our Soft Play area is upstairs.')).toBe(true);
    expect(isSoftPlayOnlyPlayground('Our playground is upstairs.')).toBe(false);
  });

  it('cannot change a sentence with no soft-play wording at all', () => {
    // Why the blast radius is provably limited to rows mentioning soft play: with nothing to remove,
    // the re-test is the original test, so the guard can never suppress anything.
    expect(isSoftPlayOnlyPlayground('A fenced playground with swings.')).toBe(false);
    expect(isSoftPlayOnlyPlayground('A large play area for toddlers.')).toBe(false);
  });
});

describe('an indoor attraction with "playground" in its name is not a playground', () => {
  /**
   * THIS IS THE DELIBERATE DECISION THE EARLIER PIN ASKED FOR.
   *
   * These two cases used to assert `playground = yes`, under a block that said each was "a separate
   * question, recorded rather than guessed at ... pinned here so that a later change to any of them
   * is a visible decision instead of a silent side effect". The expectations are changed here, on
   * purpose, with the reasoning written down -- not quietly adjusted to let a new guard pass.
   *
   * What changed is the evidence, not the taste. A production sweep of all 30 served
   * `playground = yes` claims found these are the venues a parent filtering for a playground would
   * be sent to wrongly: Babylon Park is an indoor amusement arcade whose sentence is a marketing
   * metaphor about arcade games, and the Flip Out "Ninja Playground" is a named attraction inside a
   * trampoline park, beside Soft Play and Ball Pits in the very same list. `playground` sits next to
   * `soft_play` as a separate field precisely so that indoor attractions do not answer for outdoor
   * play equipment.
   */
  it('does not publish a playground for a metaphorical "arcade playground" (Babylon Park)', () => {
    // Babylon Park was originally flagged as a soft-play question. It is not -- the trigger is this
    // marketing sentence about arcade games, which the replay established.
    expect(
      playgroundFact(
        'From retro classics to cutting-edge hits, test your skills and rack up high scores in an epic arcade playground!',
      ),
    ).toBeNull();
  });

  it('does not publish a playground for a branded "Ninja Playground" (Flip Out, three venues)', () => {
    expect(
      playgroundFact(
        'Children under 1.2m can still enjoy a wide range of attractions including Drift Trikes, Inflatables, Sportz Zone, Ninja Playground, Soft Play, Solo Trampolines, Donut Ring, Slides and PS5 Stations.',
      ),
    ).toBeNull();
  });

  it('does not publish a playground for a gallery exhibit (London Museum Docklands)', () => {
    expect(
      playgroundFact(
        'London Museum Docklands Mudlarks family gallery Get hands-on in our interactive play area for under-8s',
      ),
    ).toBeNull();
  });

  it('keeps a real playground named in the same breath as the indoor one', () => {
    // The reason this is a phrase mask rather than a sentence rejection: a venue may have both.
    expect(
      playgroundFact('There is a Ninja Playground indoors and a childrens playground outside.')?.value,
    ).toBe('yes');
  });
});

describe('what this deliberately does NOT change', () => {

  it('leaves a play area named only to say it is NOT accessible (Woodside)', () => {
    // "with the exception of the upstairs play area" publishes a playground while actually describing
    // a wheelchair-access limitation. A real false positive, and a different cause from soft play.
    expect(
      playgroundFact(
        'The whole park is accessible for wheelchair users with the exception of the upstairs play area.',
      )?.value,
    ).toBe('yes');
  });
});
