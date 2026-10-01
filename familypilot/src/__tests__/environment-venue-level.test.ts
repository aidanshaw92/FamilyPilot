import { describe, expect, it } from 'vitest';

const {
  classifyEnvironment,
  buildAnalysisText,
  venueLevelSetting,
} = require('../../../server/enrichment/_lib/environment-evidence.js');

/**
 * `environment` describes what kind of place a venue IS, not what features it happens to have.
 *
 * Category A: the product already settled this, in four independent places.
 *   - `VenueEnvironment` is indoor | outdoor | mixed | unknown, so "has both" already has its value.
 *   - `match-explanations` renders `outdoor` as "Mostly outdoor" and `mixed` as "Mix of indoor and
 *     outdoor areas".
 *   - `trusted-family-score` scores `outdoor` at 45 in rain against `mixed` at 82 and `indoor` at 97,
 *     with the reason line "Outdoor venue -- today's forecast is rain".
 *   - `day-request-matcher` already treats `mixed` as satisfying an indoor request and an outdoor one.
 *
 * That 45-against-82 split is what decides it. If `outdoor` meant "has outdoor space", a museum with a
 * courtyard would be scored 45 in the wet -- and that is exactly what was happening: of 15 active
 * served `outdoor` claims measured on 2026-10-01, five were indoor venues, every one of them from a
 * facilities list or a passing mention. A parent looking for a rainy-day option was being steered away
 * from indoor restaurants and an indoor museum by the word "seating".
 *
 * Every string below marked "production" is verbatim from a live `venue_claims.evidence_excerpt`.
 */

const classify = (text: string, pageTitle: string | null = null) => {
  const result = classifyEnvironment(buildAnalysisText(text, pageTitle));
  return result ? result.value : null;
};

describe('a feature is not a setting', () => {
  it('does not make an indoor restaurant outdoor (ASK Italian, production)', () => {
    expect(
      classify(
        'Facilities ACCESSIBILITY BABY CHANGING OUTDOOR SEATING Contact Address 23-24 Gloucester Arcade South Kensington SW7 4SF',
      ),
    ).toBeNull();
  });

  it('does not make an indoor restaurant outdoor (Nando\'s, production)', () => {
    expect(
      classify(
        'restaurant Baby changing Wheelchair access Outdoor space Wi-fi Delivery Collection Opening times Monday 11am - 10pm',
      ),
    ).toBeNull();
  });

  it('does not make an indoor museum outdoor (The Wallace Collection, production)', () => {
    expect(
      classify(
        'Food may not be brought into the house but visitors may be directed to the outdoor seating area on the front entrance forecourt',
      ),
    ).toBeNull();
  });

  it('does not let a separate attraction speak for the venue (Queen\'s House, production)', () => {
    // "Open-air skating" is an ice rink the page says museum entry does not include. `open-air` is in
    // the feature prefix for exactly this.
    expect(
      classify(
        "W Queen's House Ice Rink Stunning views Open-air skating Guaranteed entry time Skate hire included Museum entry not included",
      ),
    ).toBeNull();
  });

  it('allows modifiers between the prefix and the feature noun (production)', () => {
    // Two real cases an earlier version of the pattern missed, because a word sits in between.
    expect(
      classify(
        'October half term, Archie’s brings its outdoor kids’ camp to the grounds of Chiswick House & Gardens',
      ),
    ).toBeNull();
    expect(
      classify(
        'by pitch cricket practice nets a single outdoor basketball court 7 tennis courts near Addington Square',
      ),
    ).toBeNull();
  });

  it('treats a park facilities list as a list, not a setting (production)', () => {
    // These three parks genuinely ARE outdoor, and their claims were right -- but by accident, from
    // evidence that does not say so. A fact that is right by accident is not a trustworthy fact, so
    // the honest answer is no fact until wording that states the setting is found.
    expect(classify('Facilities Children’s playgrounds Outdoor gym Café Walled garden Rose terraces Duck pond')).toBeNull();
    expect(classify('areas Cricket pitch Lido and lido café Outdoor gym Pétanque area Table tennis table 2 tennis courts')).toBeNull();
    expect(classify('Facilities include: play area café outdoor gym nature reserve tennis courts cricket pitch')).toBeNull();
  });

  it('does not make a farm indoor because it has an indoor soft play centre', () => {
    expect(classify('For rainy days there is the heated indoor soft play centre and cafe.')).toBeNull();
  });
});

describe('a setting is still a setting', () => {
  it('reads a venue-level statement', () => {
    expect(classify('This is an outdoor attraction, so please dress for the weather.')).toBe('outdoor');
    expect(classify('Babylon Park is fully indoors and has air conditioning.')).toBe('indoor');
  });

  it('reads "open-air" when it describes the venue rather than an activity', () => {
    // `museum` is not a feature noun, so the prefix does not swallow it.
    expect(classify('An open-air museum set in forty acres of parkland.')).toBe('outdoor');
  });

  it('reads the adverb form', () => {
    expect(classify('Everything here happens outdoors.')).toBe('outdoor');
    expect(classify('Sydenham Hill Wood is an ancient woodland; the whole site is outdoors.')).toBe('outdoor');
  });

  it('cannot reach across punctuation into the next clause', () => {
    // If the feature run were unbounded, "outdoor. The gym" would mask the venue-level statement.
    expect(classify('Seating is outdoor. The gym is separate.')).toBe('outdoor');
  });

  it('cannot swallow a venue-level word by reaching along the clause to a distant feature noun', () => {
    // The modifier run is capped at two words for this reason. A mutant that widened it to "anything
    // up to the next feature noun in this clause" broke no test, and would read "the site is outdoors
    // and there is a cafe" as a cafe mention -- masking the only venue-level statement on the page.
    // The singular form is the one that matters: "outdoors" never matches the feature prefix (which
    // requires whitespace straight after "outdoor"), so an earlier version of this test proved nothing.
    expect(classify('The whole venue is outdoor and there is a cafe near the entrance.')).toBe('outdoor');
    expect(classify('The whole venue is indoor and there is seating by the windows.')).toBe('indoor');
  });
});

describe('a venue evidenced as both is mixed', () => {
  it('reads one sentence carrying both', () => {
    expect(classify('Our indoor galleries and outdoor courtyard are both open today.')).toBe('mixed');
  });

  it('reads two separate sentences, in either order', () => {
    // The defect this replaces: resolution was per sentence and scanned the indoor tier first, so a
    // page documenting both in separate sentences came out `indoor`, and reversing them changed
    // nothing. Production shows the effect -- 15 outdoor and 6 indoor claims against only 2 mixed,
    // for a catalogue of London parks, museums and farms.
    expect(classify('The museum is entirely indoors. Visitors may also sit outdoors in the summer.')).toBe('mixed');
    expect(classify('Visitors may also sit outdoors in the summer. The museum is entirely indoors.')).toBe('mixed');
  });

  it('names both halves in the excerpt, so a reviewer sees the whole verdict', () => {
    const result = classifyEnvironment(
      buildAnalysisText('The museum is entirely indoors. Visitors may also sit outdoors in the summer.', null),
    );
    expect(result?.value).toBe('mixed');
    expect(result?.evidenceText).toMatch(/indoors/);
    expect(result?.evidenceText).toMatch(/outdoors/);
  });

  it('does not invent mixed from a feature on one side', () => {
    // An indoor venue with outdoor seating is indoor-with-a-feature, not a mix. The outdoor half has
    // to be venue-level too.
    expect(classify('The galleries are entirely indoors. There is outdoor seating on the forecourt.')).toBe(
      'indoor',
    );
  });
});

describe('venueLevelSetting is the seam the rules are built on', () => {
  it('reports neither side for a pure feature mention', () => {
    expect(venueLevelSetting('There is outdoor seating on the terrace.')).toEqual({
      indoor: false,
      outdoor: false,
    });
  });

  it('reports the side a venue-level word belongs to', () => {
    expect(venueLevelSetting('The site is entirely outdoors.')).toEqual({ indoor: false, outdoor: true });
    expect(venueLevelSetting('The galleries are indoors.')).toEqual({ indoor: true, outdoor: false });
  });

  it('reports both when both are venue-level in one sentence', () => {
    expect(venueLevelSetting('Indoors and outdoors, there is plenty to do.')).toEqual({
      indoor: true,
      outdoor: true,
    });
  });
});

describe('the feature-phrase mask may not reach across the name of the venue', () => {
  /**
   * A regression, found by replaying the live pipeline against production rather than by a fixture.
   *
   * Belmont Children's Farm publishes "Indoor & Outdoor Visitors Farm Soft Play Cafe" on its home
   * page. `soft play` is a feature noun two words past "Outdoor", so the two-modifier run matched
   * "Outdoor Visitors Farm Soft Play", masked the venue's own "Outdoor", and the farm was classified
   * `indoor` -- from a sentence that says "Indoor & Outdoor" in as many words. The claim reached
   * production before this test existed.
   *
   * The sentences below are the real stored excerpts, including the CSS noise the extractor sees.
   */
  const BELMONT_HOME = 'Indoor & Outdoor Visitors Farm Soft Play Cafe The Farm Please note the farm will be cl';
  const BELMONT_STORED = 'ment-wrapper } Indoor & Outdoor Visitors Farm { --stroke-style';

  it('keeps the venue-level reading when a venue noun sits between the prefix and a feature noun', () => {
    expect(classifyEnvironment(BELMONT_HOME)?.value).toBe('mixed');
    expect(classifyEnvironment(BELMONT_STORED)?.value).toBe('mixed');
    expect(classifyEnvironment('Indoor & Outdoor Visitors Farm')?.value).toBe('mixed');
  });

  it('leaves venueLevelSetting seeing both sides, which is where the bug actually was', () => {
    expect(venueLevelSetting(BELMONT_HOME)).toEqual({ indoor: true, outdoor: true });
  });

  it('still masks a feature phrase whose modifiers are not the venue', () => {
    // The four corpus cases the two-modifier run was widened for must keep working.
    expect(classifyEnvironment('There is a single outdoor basketball court.')).toBeNull();
    expect(classifyEnvironment("Join its outdoor kids' camp this summer.")).toBeNull();
    expect(classifyEnvironment('The cafe has outdoor seating area for visitors.')).toBeNull();
    expect(classifyEnvironment('Open-air skating rink. Museum entry not included.')).toBeNull();
  });

  it('does not mask a prefix that genuinely describes the venue type', () => {
    expect(classifyEnvironment('An open-air museum in the Chilterns.')?.value).toBe('outdoor');
    expect(classifyEnvironment('An entirely outdoor park with woodland trails.')?.value).toBe('outdoor');
  });
});
