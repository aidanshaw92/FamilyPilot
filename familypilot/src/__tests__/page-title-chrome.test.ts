import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  extractEvidenceFromText,
  extractionSourceMeta,
  isPageTitleChrome,
  stripPageTitleChrome,
} = require('../../../server/enrichment/_lib/evidence-extractor.js');

const BECKENHAM_TITLE =
  'Free activities for children and young people &mdash; Beckenham Place Park - Borough of '
  + 'Lewisham | Playgrounds - Cycle Routes - Walking - Nature trails - BMX & Skate Park - Swimming '
  + 'Lake - Parkrun - V';

const facts = (text: string, pageTitle: string | null) =>
  (extractEvidenceFromText(text, extractionSourceMeta({
    url: 'https://example.org/visit', sourceType: 'visitor_info',
    retrievedAt: new Date().toISOString(), pageTitle,
  })) ?? []) as Array<{ field: string; value: string; evidenceText: string }>;

const valuesFor = (text: string, pageTitle: string | null, field: string) =>
  [...new Set(facts(text, pageTitle).filter((f) => f.field === field).map((f) => f.value))].sort();

/**
 * Beckenham Place Park served `familyFacilities.playground = yes` off the site's SEO title, which
 * lists every amenity the park has and is repeated at the top of every page. "Playgrounds" is inside
 * the title, so sitewide navigation was establishing a venue fact.
 */
describe('a page title echoed as chrome is not a statement about the venue', () => {
  it('does not let the SEO title establish a playground', () => {
    // The stored line, verbatim: the title, then the nav, with no sentence terminator anywhere.
    const chromeLine = 'Free activities for children and young people &mdash; Beckenham Place Park '
      + '- Borough of Lewisham | Playgrounds - Cycle Routes - Walking - Nature trails - BMX &amp; '
      + 'Skate Park - Swimming Lake - Parkrun - Venue Hire | South East London UK Back All Events '
      + 'Lake Playgrounds BMX & Skatepark Fitness Nature Volunteering Back All Businesses Facilities '
      + 'Food & Drink Map Park Etiquette Back All A Brief History Park Life Current Projects Hire';
    expect(isPageTitleChrome(chromeLine, BECKENHAM_TITLE)).toBe(true);
    expect(valuesFor(chromeLine, BECKENHAM_TITLE, 'playground')).toEqual([]);
    // Without the title there is nothing to recognise it by, and the old behaviour returns.
    expect(valuesFor(chromeLine, null, 'playground')).toEqual(['yes']);
  });

  it('still reads the same venue stating the playground in its own prose', () => {
    // Beckenham's /visit page says it twice. The claim is TRUE; what was wrong was its support.
    // After the strip it is established from this sentence instead, which is the right outcome --
    // not the claim vanishing.
    const visitTitle = 'Visit &mdash; Beckenham Place Park - Borough of Lewisham | Playgrounds - '
      + 'Cycle Routes - Walking - Nature trails - BMX & Skate Park - Swimming Lake - Parkrun - '
      + 'Venue Hire | South East London UK';
    const page = [
      'Visit &mdash; Beckenham Place Park - Borough of Lewisham | Playgrounds - Cycle Routes - '
        + 'Walking - Nature trails - BMX &amp; Skate Park - Swimming Lake - Parkrun - Venue Hire | '
        + 'South East London UK Back All Events Lake Playgrounds BMX & Skatepark Fitness Nature '
        + 'Volunteering Back All Businesses Facilities Food & Drink Map Park Etiquette Back All Hire',
      'In warmer months, the Homestead Cafe kiosk in the playground has hot drinks, refreshments, '
        + 'pastries and ice cream on sale.',
      'There is a baby changing table in both the Male and Female toilets, and a separate unisex '
        + 'cubicle for visitors with disabilities.',
    ].join('\n');
    expect(valuesFor(page, visitTitle, 'playground')).toEqual(['yes']);
    // and from the prose, not the title
    const playground = facts(page, visitTitle).find((f) => f.field === 'playground');
    expect(playground?.evidenceText).toContain('Homestead Cafe kiosk in the playground');
    expect(playground?.evidenceText).not.toContain('Borough of Lewisham');
    // The facilities stated in prose on the same page are untouched.
    expect(valuesFor(page, visitTitle, 'babyChanging')).toEqual(['yes']);
  });
});

/**
 * The same rule closes 42 other chrome lines across the corpus. None of them backs a served claim
 * today, and several carry facility words that could have established one.
 */
describe('the same chrome cannot establish any other field', () => {
  it('does not let a nav banner promise free parking', () => {
    // Hatfield Park, verbatim, on five pages.
    const title = 'Accessibility - Hatfield Park';
    const line = 'Accessibility - Hatfield Park Skip to content Closed today – the House and '
      + 'Gardens Beat the queue – buy tickets in advance Getting here – free parking for '
      + 'visitors Search for:';
    expect(valuesFor(line, title, 'parking')).toEqual([]);
    expect(valuesFor(line, title, 'freeParking')).toEqual([]);
  });

  it('does not let a page title name a cafe into existence', () => {
    // London Museum Docklands, verbatim, and only 81 characters: there is no length threshold.
    const line = 'Gift shop and cafe | London Museum Docklands | London Museum Skip to main content';
    expect(isPageTitleChrome(line, 'Gift shop and cafe | London Museum Docklands | London Museum')).toBe(true);
    expect(valuesFor(line, 'Gift shop and cafe | London Museum Docklands | London Museum', 'cafe')).toEqual([]);
  });
});

describe('what the rule deliberately does not touch', () => {
  it('keeps a title-prefixed line that is a real statement', () => {
    // A heading can run straight into prose. The sentence terminator is what tells them apart.
    const title = 'Playground - Someplace Park';
    const line = 'Playground - Someplace Park The playground is open daily from 8am.';
    expect(isPageTitleChrome(line, title)).toBe(false);
    expect(valuesFor(line, title, 'playground')).toEqual(['yes']);
  });

  it('strips nothing when the title is only punctuation, rather than everything', () => {
    // Not a corpus case -- no stored title normalises to empty today -- but a fail-safe one. A title
    // of "&mdash;" or "|" normalises away to nothing, and a prefix test against the empty string
    // matches EVERY line, which would blank the whole page. It must fail closed instead.
    const text = 'The playground is open daily.\nToilets are available.';
    expect(isPageTitleChrome('Anything at all with no full stop', '&mdash; | &nbsp;')).toBe(false);
    expect(stripPageTitleChrome(text, '&mdash; | &nbsp;')).toBe(text);
  });

  it('strips nothing when the page has no stored title', () => {
    const text = 'Some Title Skip to content Playgrounds';
    expect(stripPageTitleChrome(text, null)).toBe(text);
    expect(stripPageTitleChrome(text, '')).toBe(text);
  });

  it('leaves every other line of the page exactly as it was', () => {
    const text = ['My Page Skip to content', 'The playground is open daily.', 'Toilets are available.'].join('\n');
    expect(stripPageTitleChrome(text, 'My Page')).toBe('The playground is open daily.\nToilets are available.');
  });
});

/**
 * The stored title and the stored text do not agree on entities, so both sides are normalised.
 */
describe('entity differences between the title and the text', () => {
  it('matches a bare ampersand in the title against &amp; in the text', () => {
    // Beckenham's real mismatch, which is why a plain prefix test failed.
    expect(isPageTitleChrome('BMX &amp; Skate Park - Swimming Lake Back All Events',
      'BMX & Skate Park - Swimming Lake')).toBe(true);
  });

  it('matches a literal en dash in the title against &#8211; in the text', () => {
    // Dulwich Park's real mismatch.
    expect(isPageTitleChrome('Map of the park &#8211; DULWICH PARK FRIENDS Skip to content Recent posts',
      'Map of the park – DULWICH PARK FRIENDS')).toBe(true);
  });

  it('tolerates a title truncated mid-word by the 200-character column cap', () => {
    // Beckenham's stored title ends "- Parkrun - V"; the text continues "- Parkrun - Venue Hire".
    expect(isPageTitleChrome('Parkrun - Venue Hire | South East London UK Back All Events',
      'Parkrun - V')).toBe(true);
  });
});
