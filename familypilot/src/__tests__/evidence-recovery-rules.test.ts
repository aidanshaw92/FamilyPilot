import { describe, expect, it } from 'vitest';

/**
 * The rules added for venue evidence recovery, one by one, with the negatives each must refuse. The real-corpus
 * behaviour is pinned in evidence-recovery-replay.test.ts; these are the edges a corpus of 88 venues may not contain.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const {
  extractEvidenceFromText,
  isEvidenceBearingSource,
  negationScope,
  matchFacilityList,
  isStreetParkingRestriction,
  isNavigationChrome,
} = require('../../../server/enrichment/_lib/evidence-extractor');
const { decodeHtmlEntities, cleanEvidenceSnippet } = require('../../../server/enrichment/_lib/evidence-text-utils');
const { isBotChallengeText, isCloudflareChallenge, scoreLink } = require('../../../server/enrichment/_lib/html-text-extractor');
const { classifyPushchairSuitability } = require('../../../server/enrichment/_lib/pushchair-evidence');
const { officialWebsiteFor, isNonVisitorWebsite } = require('../../../server/enrichment/_lib/official-source-overrides');
const { buildCommonPathCandidates } = require('../../../server/enrichment/_lib/source-discovery');
/* eslint-enable @typescript-eslint/no-require-imports */

const meta = { url: 'https://venue.example/visit', sourceType: 'visitor_info', retrievedAt: new Date().toISOString(), pageTitle: 'Plan your visit' };
const facts = (text: string) => extractEvidenceFromText(text, meta).map((f: { field: string; value: string }) => `${f.field}=${f.value}`);
const has = (text: string, fieldValue: string) => facts(text).includes(fieldValue);
const field = (text: string, name: string) => facts(text).filter((f: string) => f.startsWith(`${name}=`));

describe('character references are decoded before anything reads the text', () => {
  it('decodes the named, numeric and double-encoded forms found in stored pages', () => {
    expect(decodeHtmlEntities('Caf&eacute; children&rsquo;s &pound;1.50 &amp;eacute; &#8217; &#x27;')).toBe('Café children’s £1.50 é ’ \'');
    expect(decodeHtmlEntities('R&D &unknown; costs £5')).toBe('R&D &unknown; costs £5');
  });

  it('reads a café the page spelled with an entity', () => {
    expect(has('Facilities Children&rsquo;s playgrounds Outdoor gym Caf&eacute; Walled garden', 'cafe=yes')).toBe(true);
  });

  it('keeps decimals and dotted names in a quote', () => {
    expect(cleanEvidenceSnippet('Dimensions are 2.13m by 1.4m with door width 0.85m.')).toBe('Dimensions are 2.13m by 1.4m with door width 0.85m.');
    expect(cleanEvidenceSnippet('.baby-changing hidden Baby changing is on level 0.')).toBe('hidden Baby changing is on level 0.');
  });
});

describe('a negation governs the statement it is in, not the whole flattened page', () => {
  it('a punctuated sentence is judged whole, as before', () => {
    // The negation sits 90 characters after the match: inside the sentence, so still withheld.
    expect(has('Our café, located beside the main entrance with lovely views over the lake and gardens, is closed for refurbishment.', 'cafe=yes')).toBe(false);
    expect(has('Baby changing facilities are currently unavailable.', 'babyChanging=yes')).toBe(false);
    expect(has('We do not currently offer baby changing facilities.', 'babyChanging=yes')).toBe(false);
  });

  it('a run-on chunk is judged near the match', () => {
    const chunk = 'Café After playing check out our café for a bite to eat and refreshments Please note soft play has to come '
      + 'before the farm due to cross contamination, this means if you go down to the farm unfortunately you can not '
      + 'access the soft play after Food is not allowed in the soft play area';
    expect(has(chunk, 'cafe=yes')).toBe(true);
    // ...and a negation next to the match in the same run-on chunk still wins.
    const near = 'Soft Play Our soft play has a baby section and larger section that goes down three stories and our café is '
      + 'temporarily closed for refurbishment until further notice Parents can sit and enjoy the views over the farm '
      + 'while children play and we have cameras in the larger section so you can keep an eye on your little ones';
    expect(has(near, 'cafe=yes')).toBe(false);
  });

  it('scopes to the statement around the match', () => {
    expect(negationScope('Toilets are closed. Our café is open.', 25, 8)).toBe(' Our café is open');
  });

  it('a weekly closing day or a holiday closure is a schedule, not unavailability', () => {
    expect(has('Café Opening Times Tuesday – Sunday, 10am – 4pm Closed: Monday', 'cafe=yes')).toBe(true);
    expect(has('Toilets are located in the courtyard (closed on Christmas Day and Boxing Day).', 'toilets=yes')).toBe(true);
    // A closure that is not a schedule still withholds.
    expect(has('The café is closed until further notice.', 'cafe=yes')).toBe(false);
  });

  it('a refurbishment in progress withholds, a past one does not', () => {
    expect(has('We are currently refurbishing our cafe.', 'cafe=yes')).toBe(false);
    expect(has('The toilets are located in the Homestead Courtyard, which was renovated and reopened in 2019.', 'toilets=yes')).toBe(true);
  });
});

describe('availability on certain days only is not a yes', () => {
  it.each([
    ['Toilets, including disabled facilities The toilets are open Thursday and Sunday, 11am-4pm.', 'toilets=yes'],
    ['The Kiosk Community Café: every Saturday 9am to 2pm', 'cafe=yes'],
    ['Our cafe is open weekends only.', 'cafe=yes'],
  ])('%s', (text, fieldValue) => expect(has(text, fieldValue)).toBe(false));

  it('opening hours across the week are not a restriction', () => {
    expect(has('Our cafe is open Monday – Saturday: 9am – 5pm.', 'cafe=yes')).toBe(true);
  });
});

describe('a facility list is read only when it is a list of THIS venue’s facilities', () => {
  it('reads a council facilities list', () => {
    expect(matchFacilityList('Facilities include: play area café outdoor gym nature reserve', 'cafe')?.value).toBe('yes');
    expect(matchFacilityList('Amenities 2 children’s play areas Lido and lido café Toilets and accessible toilets', 'toilets')?.value).toBe('yes');
    expect(matchFacilityList('Facilities Rough surfaced car park for approximately 50 vehicles', 'parking')?.value).toBe('yes');
  });

  it('refuses site navigation', () => {
    expect(matchFacilityList('Facilities Venue hire Group visits Explore the local area Get in touch Menu Access Café', 'cafe')).toBeNull();
  });

  it('refuses the word "facilities" in prose', () => {
    expect(matchFacilityList('There is an accessible toilet and baby changing facilities in the cafe.', 'cafe')).toBeNull();
  });

  it('refuses a nearby, closed or day-only item, and a coach car park', () => {
    expect(matchFacilityList('Facilities: playground, tennis courts, nearby cafe', 'cafe')).toBeNull();
    expect(matchFacilityList('Facilities: playground, toilets (currently closed for refurbishment)', 'toilets')).toBeNull();
    expect(matchFacilityList('Facilities: playground, Kiosk Café every Saturday 9am to 2pm', 'cafe')).toBeNull();
    expect(matchFacilityList('Facilities: coach car park, playground', 'parking')).toBeNull();
  });

  it('never infers baby changing or buggy access from a list heading', () => {
    expect(matchFacilityList('Facilities: toilets, playground', 'babyChanging')).toBeNull();
    expect(matchFacilityList('Facilities: toilets, playground', 'pushchairSuitability')).toBeNull();
  });
});

describe('parking: the venue’s own car park, never somebody else’s', () => {
  it.each([
    'You can park in the top car park and walk down to reception.',
    'We have a large car park with dedicated disabled parking.',
    'There is a small car park at the top of the common.',
    "There is a 'park and pay' car park within Beckenham Place Park.",
    'Children’s playground Onsite car park Pavilion',
    'A small surfaced car park, open from 6am to 9pm, is accessed from Dollis Hill Lane.',
  ])('yes: %s', (text) => expect(field(text, 'parking')).toEqual(['parking=yes']));

  it.each([
    'There is a car park nearby on the high street.',
    'The nearest car park is Britannia Parking on Upper Marsh.',
    'A secure underground car park within suitable walking distance from our attractions.',
    'Public car parking is available at Sloane Square Car Park, Cheltenham Terrace.',
    'Short Term coach parking is available on Seagrave Road.',
    'Eight parking spaces are provided for Blue Badge holders only.',
    'There is a car park within a short walk of the gates.',
  ])('not yes: %s', (text) => expect(field(text, 'parking')).not.toContain('parking=yes'));

  it('a venue saying it has no car park is a no', () => {
    expect(field('The museum does not have a car park.', 'parking')).toEqual(['parking=no']);
    expect(field("Highgate Wood doesn't have a car park.", 'parking')).toEqual(['parking=no']);
    expect(field('There are no parking facilities at the gallery.', 'parking')).toEqual(['parking=no']);
    expect(field('There is no dedicated parking at Babylon Park.', 'parking')).toEqual(['parking=no']);
  });

  it('a road’s parking rules are not a no about the venue', () => {
    expect(isStreetParkingRestriction('Double yellow lines mean no parking at any time.')).toBe(true);
    expect(field('Double yellow lines mean no parking at any time.', 'parking')).toEqual([]);
    expect(field('(No parking Mon-Sat 7am to 7pm) Royal Hospital Road.', 'parking')).toEqual([]);
    // A venue-level denial is untouched.
    expect(field('There is no parking at the farm.', 'parking')).toEqual(['parking=no']);
  });

  it('general parking beside disabled bays still counts', () => {
    expect(field('You can park in the top car park, where there is further parking spaces and disabled parking.', 'parking')).toEqual(['parking=yes']);
  });

  it('free of charge is free parking', () => {
    expect(field('Parking is provided free of charge in our car park directly outside.', 'freeParking')).toEqual(['freeParking=yes']);
  });
});

describe('toilets placed on the venue', () => {
  it.each([
    'There are toilets on the ground, second and third floors.',
    'There are toilets to the rear of the Gardens Cafe.',
    "All Victoria Park's public toilets have an accessible cubicle.",
  ])('yes: %s', (text) => expect(field(text, 'toilets')).toEqual(['toilets=yes']));

  it('a tube line and its station toilets are still refused', () => {
    expect(field('The Victoria line toilets at the station are closed.', 'toilets')).toEqual([]);
    expect(field('There are toilets at the railway station, a short walk away.', 'toilets')).toEqual([]);
  });
});

describe('buggy access: explicit access wording, limitations and options', () => {
  it('explicit access wording publishes good', () => {
    expect(classifyPushchairSuitability('Yes, the venue is wheelchair accessible and buggy-friendly.')).toEqual({ value: 'good', confidence: 'high' });
    expect(classifyPushchairSuitability('All entrances are accessible with a buggy.')).toEqual({ value: 'good', confidence: 'high' });
    expect(classifyPushchairSuitability('Plenty of room for buggies.')).toEqual({ value: 'good', confidence: 'high' });
  });

  it('permission alone stays below publication, as before', () => {
    expect(classifyPushchairSuitability('Yes, prams are allowed.')).toEqual({ value: 'good', confidence: 'medium' });
  });

  it('a limitation still wins over explicit access', () => {
    expect(classifyPushchairSuitability('The park is buggy-friendly but buggies are not permitted in the PlayBarn.')?.value).toBe('mixed');
    expect(classifyPushchairSuitability('Buggies are welcome, but must be fully folded before boarding.')?.value).toBe('mixed');
    expect(classifyPushchairSuitability('Buggies are welcome. We may ask that some buggies are left in a buggy park.')?.value).toBe('mixed');
    expect(classifyPushchairSuitability('The space is not accessible for prams/strollers.')?.value).toBe('difficult');
  });

  it('an optional buggy bay is not a limitation', () => {
    expect(classifyPushchairSuitability('You are more than welcome to bring a buggy as we are fully accessible with lifts throughout. '
      + 'We also have a free buggy bay if you wish to leave your Buggy during peak seasons.')?.value).toBe('excellent');
    // A request to leave it still is.
    expect(classifyPushchairSuitability('Buggies are welcome. Please leave your buggy in the cloakroom.')?.value).toBe('mixed');
  });
});

describe('pages that were counted as read but carried nothing', () => {
  it('recognises the Imperva interstitial stored as ok', () => {
    expect(isBotChallengeText('To regain access, please make sure that cookies and JavaScript are enabled before reloading the page.', 'Pardon Our Interruption')).toBe(true);
    expect(isCloudflareChallenge('<html><head><title>Pardon Our Interruption</title></head>...')).toBe(true);
    expect(isBotChallengeText('Our café is open every day.', 'Visit us')).toBe(false);
  });

  it('neither a challenge page nor a title-only shell is evidence-bearing', () => {
    expect(isEvidenceBearingSource({ extractedText: 'To regain access, please make sure that cookies and JavaScript are enabled before reloading the page.', pageTitle: 'Pardon Our Interruption', facts: [] })).toBe(false);
    expect(isEvidenceBearingSource({ extractedText: 'Burgh House -->', pageTitle: 'Burgh House', facts: [] })).toBe(false);
    expect(isEvidenceBearingSource({ extractedText: 'Our opening hours vary by season, please check before travelling.' })).toBe(true);
  });
});

describe('parking stated for disabled visitors is restricted parking (7 Oct 2026 production re-read)', () => {
  // Tate Modern: the same page carries both. Before v4 the first read as general parking and the true "no" was withdrawn
  // as a conflict with it.
  const tateHeading = 'Facilities at Tate Modern Assistance dogs Autism Communication cards Access events Website Contact Us '
    + 'Accessible car parking There are twelve parking spaces for disabled visitors, accessed via Park Street.';
  it('"parking spaces for disabled visitors" under an "Accessible car parking" heading is not general parking', () => {
    expect(field(tateHeading, 'parking')).toEqual([]);
    expect(field('BY CAR There are no parking facilities at Tate Modern or in the surrounding streets.', 'parking')).toEqual(['parking=no']);
    expect(field(`${tateHeading} BY CAR There are no parking facilities at Tate Modern or in the surrounding streets.`, 'parking')).toEqual(['parking=no']);
  });
  it('a reserved subset of a general car park keeps the general parking (Beckenham Place Park)', () => {
    expect(field('Yes, there is a park and pay car park within Beckenham Place Park with 108 parking places including 6 places reserved for blue badge holders and electric charging stations.', 'parking')).toEqual(['parking=yes']);
  });
  it('general parking that merely adds disabled bays still counts; disabled-only still does not', () => {
    expect(field('We have a large car park with dedicated disabled parking.', 'parking')).toEqual(['parking=yes']);
    expect(field('Golders Hill Park car park eight bays in the park for Blue Badge holders only.', 'parking')).toEqual([]);
    expect(field('Disabled parking is available within the main Visitor car park.', 'parking')).toEqual([]);
  });
});

describe('navigation chrome is not a statement', () => {
  it('a flattened footer naming "play areas" is not a playground (Waterlow Park)', () => {
    const footer = 'Thursday on Lauderdale lawn Uncategorised Funny Bones on stage 30 August Uncategorised Sunday 23 August '
      + '– Monoversals take to the stage in the Park Back To Top Home News & Events The Park Activities – volunteering, '
      + 'play areas, sports The Friends Sitemap Friends of Waterlow Park The Voice of Park Users Site by diditon.com';
    expect(isNavigationChrome(footer)).toBe(true);
    const facts = extractEvidenceFromText(footer, meta);
    expect(facts.find((f: { field: string }) => f.field === 'playground')).toBeUndefined();
  });

  it('one stray "Newsletter" after a council amenities list does not unread the list (London Fields)', () => {
    const amenities = 'Amenities 2 children’s play areas Cricket pitch Lido and lido café Outdoor gym Pétanque area '
      + 'Table tennis table 2 tennis courts Toilets and accessible toilets Wildflower meadow Book courts and pitches '
      + 'Newsletter Sign up for the parks newsletter';
    expect(isNavigationChrome(amenities)).toBe(false);
    const facts = extractEvidenceFromText(amenities, meta);
    expect(facts.find((f: { field: string }) => f.field === 'toilets')?.value).toBe('yes');
    expect(facts.find((f: { field: string }) => f.field === 'cafe')?.value).toBe('yes');
  });
});

describe('discovery', () => {
  it('a Historic England register entry is not a visitor website', () => {
    expect(isNonVisitorWebsite('https://historicengland.org.uk/listing/the-list/list-entry/1000800')).toBe(true);
    expect(officialWebsiteFor('fp-unknown', 'https://historicengland.org.uk/listing/the-list/list-entry/1000800')).toBeNull();
    expect(officialWebsiteFor('fp-unknown', 'https://www.hackneycityfarm.co.uk/')).toBe('https://www.hackneycityfarm.co.uk/');
  });

  it('a reviewed override names the operator’s own page for that venue', () => {
    expect(officialWebsiteFor('fp-google-ChIJ20fKH3wcdkgRu2dDMx_lAUk', 'https://historicengland.org.uk/listing/the-list/list-entry/1000800'))
      .toBe('https://hackney.gov.uk/clissold-park/');
    expect(officialWebsiteFor('fp-google-ChIJi104LjcFdkgRnzOHTtw-7kM', null)).toBe('https://www.wandsworth.gov.uk/tootingcommon');
  });

  it('a website that is a document is guessed from its folder, not from inside the file', () => {
    // Trent Park's website is "trentcountrypark.com/Welcome.html"; the crawl asked for "Welcome.html/visit".
    const urls = buildCommonPathCandidates('http://trentcountrypark.com/Welcome.html').map((c: { url: string }) => c.url);
    expect(urls.some((u: string) => u.includes('Welcome.html/'))).toBe(false);
    expect(urls).toContain('http://trentcountrypark.com/accessibility');
    // A venue's own path is still the root (Tate Britain is "/visit/tate-britain", not tate.org.uk).
    const tate = buildCommonPathCandidates('https://www.tate.org.uk/visit/tate-britain').map((c: { url: string }) => c.url);
    expect(tate.every((u: string) => u.startsWith('https://www.tate.org.uk/visit/tate-britain/'))).toBe(true);
  });

  it('a link to the venue’s own café page now ranks', () => {
    expect(scoreLink('/visit/cafe/ https://wmgallery.org.uk/visit/cafe/', 'Café').score).toBeGreaterThan(0);
    expect(scoreLink('/plan-your-visit/food-drink/ https://horniman.ac.uk/plan-your-visit/food-drink/', 'Food and drink').score).toBeGreaterThan(0);
    // "cafe" in a long prose anchor is not a café page link.
    expect(scoreLink('/news/summer https://example.org/news/summer', 'Meet friends and family at our cafe this summer for a special treat').score).toBe(0);
  });
});

/**
 * Age-adjacent wording on a venue's own pages must never become a recommended-age FACT through the extractor that the
 * worker actually runs. There is no producer of venue-recommended ages (docs/AGE_SUITABILITY_YIELD.md): the extractor
 * emits facility, accessibility and pushchair facts only, so no sentence about ages, tickets, heights or children's
 * facilities can create one. This pins that, with real sentences from the stored pages.
 */
describe('the extractor never produces an age fact', () => {
  const SENTENCES = [
    'Please note, children under the age of 2 go free but the recommended age of the attraction is children aged 6 and over.',
    'This playground is suitable for children 4 to 7, 8 to 14 years old.',
    'Soft play sessions are open to children aged 6 months to 10 years.',
    'Child (4 – 17 years): £10.50. Children under 4 years: Free.',
    'Strictly for ages 5 & under. Guests under the age of 5 require a paying adult to accompany them.',
    'Children under 1.2m can still enjoy a wide range of attractions including Drift Trikes and Inflatables.',
    'We have a children’s playground, a soft play area for little ones, and a parent and baby room.',
    'Activities are generally appropriate for children aged 5+, younger visitors are also very welcome.',
    'Great for toddlers and young children. A perfect family friendly day out for all ages.',
  ];

  it('emits no field about ages for any of them', () => {
    for (const text of SENTENCES) {
      const fields = extractEvidenceFromText(text, meta).map((f: { field: string }) => f.field);
      expect(fields.filter((f: string) => /age|recommended|suitab/i.test(f)), text).toEqual([]);
    }
  });

  it('and none of the venue-level age statements leaks into facilities either', () => {
    const fields = extractEvidenceFromText(SENTENCES.join(' '), meta).map((f: { field: string; value: string }) => f.field);
    expect(fields.some((f: string) => /^(minRecommendedAge|maxRecommendedAge|ageSuitability|recommendedAge)/.test(f))).toBe(false);
  });
});
