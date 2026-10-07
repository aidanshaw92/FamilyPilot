/**
 * Official visitor pages for venues whose stored website is not one.
 *
 * Google's `website` for seven London parks is their Historic England register entry
 * (`historicengland.org.uk/listing/the-list/list-entry/...`): a heritage designation that never says whether there are
 * toilets, a café or a buggy-friendly path, and which sits behind a Cloudflare challenge besides -- Roundwood Park's
 * ten stored fetches are all `blocked`. Two more parks have no website at all. Each of these venues was therefore
 * classed "no usable source" when the council that runs it publishes a park page the crawler can read.
 *
 * Each entry below was found by searching for the operating council's own page (7 Oct 2026) and is the page the
 * crawler should START from. It is a discovery hint and nothing more:
 *
 *   - nothing is published from this table or from the search that found it;
 *   - the page is fetched, extracted and approved under exactly the same rules as any other source;
 *   - its subject scope is established against this URL, so a council's other parks stay other venues' pages.
 *
 * To add one: the operator's own page about THIS venue only (not a borough-wide list), with the date and how it was
 * found. Remove an entry when the provider's website becomes a usable visitor page.
 */
const OVERRIDES = {
  // Clissold Park (Hackney). Google website: Historic England list entry 1000800.
  'fp-google-ChIJ20fKH3wcdkgRu2dDMx_lAUk': { website: 'https://hackney.gov.uk/clissold-park/', operator: 'Hackney Council' },
  // Roundwood Park (Brent). Google website: Historic England list entry 1001556 (Cloudflare-blocked).
  'fp-google-ChIJVRvQ7bMRdkgRqYUyCcCgNVc': {
    website: 'https://www.brent.gov.uk/parks-leisure-and-healthy-living/parks-and-open-spaces/park-finder/roundwood-park',
    operator: 'Brent Council',
  },
  // Broomfield Park (Enfield). Google website: Historic England list entry 1000517 (Cloudflare-blocked).
  'fp-google-ChIJATFGbXcZdkgRbdIAQPsgpvs': {
    website: 'https://mylife.enfield.gov.uk/directory/providerdetails/216446', operator: 'Enfield Council',
  },
  // Brockwell Park (Lambeth). Google website: Historic England list entry 1000794.
  'fp-google-ChIJ44SoFr8EdkgRgaKmF44BlW4': { website: 'https://www.lambeth.gov.uk/parks/brockwell-park', operator: 'Lambeth Council' },
  // Belair Park (Southwark). Google website: Historic England list entry 1000791.
  'fp-google-ChIJj3zdKqkDdkgRP-6Y8f75vpY': {
    website: 'https://www.southwark.gov.uk/culture-and-sport/parks-and-open-spaces/find-park/belair-park',
    operator: 'Southwark Council',
  },
  // Walpole Park (Ealing). Google website: Historic England list entry 1000847.
  'fp-google-ChIJMYYNDYwNdkgRSqk4sr9yCwQ': {
    website: 'https://www.ealing.gov.uk/info/201136/parks_in_the_borough/662/ealing_parks/3', operator: 'Ealing Council',
  },
  // Tooting Commons (Wandsworth). No website stored.
  'fp-google-ChIJi104LjcFdkgRnzOHTtw-7kM': { website: 'https://www.wandsworth.gov.uk/tootingcommon', operator: 'Wandsworth Council' },
  // Boston Manor Park (Hounslow). No website stored.
  'fp-google-ChIJySVh9LwNdkgRpAgAj9YX2Eg': {
    website: 'https://www.hounslow.gov.uk/directory-record/11067/boston-manor-park', operator: 'Hounslow Council',
  },
};

/**
 * Websites that are never a venue's visitor page. Reading them spends fetch attempts on pages that cannot carry a
 * family fact, so discovery treats them as no official source and the venue is routed to the verification queue.
 */
const NON_VISITOR_WEBSITES = [/^https?:\/\/(?:www\.)?historicengland\.org\.uk\/listing\//i];

function isNonVisitorWebsite(url) {
  return typeof url === 'string' && NON_VISITOR_WEBSITES.some((re) => re.test(url));
}

/** The website the crawler should start from for this venue: the override, else the stored one unless it is a register entry. */
function officialWebsiteFor(familypilotPlaceId, storedWebsite) {
  const override = OVERRIDES[familypilotPlaceId];
  if (override) return override.website;
  return isNonVisitorWebsite(storedWebsite) ? null : storedWebsite ?? null;
}

function hasOfficialSourceOverride(familypilotPlaceId) {
  return Boolean(OVERRIDES[familypilotPlaceId]);
}

module.exports = { OVERRIDES, officialWebsiteFor, hasOfficialSourceOverride, isNonVisitorWebsite };
