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
 * Further roots that are the venue's OWN pages, for venues whose visitor pages live on a second host or in a section the
 * stored website does not reach. Used only to decide whose page a stored or fetched page is (source-identity.js
 * `ownRoots`); nothing is fetched or published from this table, and every fact still passes the same extraction and
 * approval rules.
 *
 * To add one: a root that publishes only about THIS venue, checked against the catalogue so that no other venue's
 * website is at or beneath it, with the date and the stored page that showed it.
 */
const OFFICIAL_ROOTS = {
  // Crystal Palace Park. Stored website: the Crystal Palace Park Trust (crystalpalaceparktrust.org). The park's visitor
  // pages are on crystalpalacepark.org.uk (stored 1 Oct 2026: /visit-dinosaur-playground-dnc9, "Nearby facilities ...
  // Main public toilets, Changing Places toilet"). No other catalogue venue uses that host. Reviewed 8 Oct 2026.
  'fp-google-ChIJ94vQ-0IBdkgRxsGErkV2hZo': ['https://www.crystalpalacepark.org.uk/'],
  // Primrose Hill. Stored website: a page in The Regent's Park's "things to see" section. The Royal Parks publish Primrose
  // Hill's own page beneath The Regent's Park's visit section (stored: "Primrose Hill playground ... improvement works are
  // now complete"), which made it The Regent's Park's page. This root is deeper than The Regent's Park's, so the more
  // specific site wins. Reviewed 8 Oct 2026.
  'fp-google-ChIJ2yb0sesadkgRIQOyE6qMxLU': ['https://www.royalparks.org.uk/visit/parks/regents-park-primrose-hill/primrose-hill'],
  // Dulwich Park. Stored website: one page (the map) of dulwichparkfriends.org.uk, the Friends of Dulwich Park's site,
  // which is about this park only; its travel page ("Parking is available inside the College Road entrance") sat outside
  // the map page's path. No other catalogue venue uses the host. Reviewed 8 Oct 2026.
  'fp-google-ChIJbSe-4PoDdkgReFaqbED1N9o': ['https://dulwichparkfriends.org.uk/'],
};

function officialRootsFor(familypilotPlaceId) {
  return OFFICIAL_ROOTS[familypilotPlaceId] ?? [];
}

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

module.exports = { OVERRIDES, OFFICIAL_ROOTS, officialRootsFor, officialWebsiteFor, hasOfficialSourceOverride, isNonVisitorWebsite };
