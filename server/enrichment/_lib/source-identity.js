/**
 * Whose page is this?
 *
 * The evidence pipeline used to answer that question by assumption: a page fetched while crawling
 * venue X was stored as evidence FOR venue X, unconditionally, and every later stage read that
 * stamp back as if it were a finding. The crawl itself was bounded only by hostname
 * (`html-text-extractor.js`: `if (resolved.hostname !== base.hostname) continue;`), and sixteen
 * domains in the catalogue carry more than one venue. So Tate Britain and Tate Modern both ended up
 * serving facility facts read off the Tate Liverpool page, and the South Kensington V&A served a
 * toilets fact read off the Wedgwood Collection in Stoke-on-Trent.
 *
 * This module answers the question explicitly instead, from data rather than from similarity:
 *
 *   - the venue's own `place_records.website`, and
 *   - the websites of every OTHER venue in the catalogue.
 *
 * Those are real stored identifiers. Matching a candidate URL against them is exact, not a guess
 * about how much two slugs resemble each other, which is why the strongest verdict here -- the
 * hard reject -- rests on nothing else.
 *
 * The governing principle, set by the product owner: UNKNOWN IS PREFERABLE TO CONFIDENTLY WRONG.
 * Where the relationship cannot be established, this module says so and the evidence is withheld.
 * It is never marked false and never deleted: a page we cannot currently place may be perfectly
 * good, and a later shared/operator-evidence model is expected to recover much of it.
 */

/** Every verdict this module can reach. Persisted, so treat the strings as a stored contract. */
const SUBJECT_SCOPES = [
  /** The page is the venue's own site, or sits beneath it. Structural, exact. */
  'venue_own_subtree',
  /**
   * The page is not under the venue's own path, but names this venue and no other catalogue venue
   * in BOTH its URL and its title. Two independent explicit namings, not one similarity score.
   */
  'venue_named_page',
  /** A strict ancestor of the venue's own path: operator-level, applicability not established. */
  'organisation_ancestor',
  /** The page is, or sits beneath, ANOTHER catalogue venue's website. Never usable here. */
  'other_catalogue_venue',
  /** Same site, no established relationship either way. Withheld, not condemned. */
  'sibling_unverified',
];

/** Scopes whose evidence may support a venue-specific claim. Everything else fails closed. */
const ELIGIBLE_SCOPES = new Set(['venue_own_subtree', 'venue_named_page']);

function isEligibleScope(scope) {
  return ELIGIBLE_SCOPES.has(scope);
}

function urlHost(url) {
  if (!url) return null;
  const match = String(url).match(/^https?:\/\/(?:www\.)?([^/]+)/i);
  return match ? match[1].toLowerCase() : null;
}

/** Path segments, lowercased, query and trailing slash removed. `/` becomes `[]`. */
function pathSegments(url) {
  if (!url) return [];
  return String(url)
    .split('?')[0]
    .split('#')[0]
    .replace(/^https?:\/\/[^/]+/i, '')
    .toLowerCase()
    .split('/')
    .filter(Boolean);
}

/**
 * Trailing segments that name a language or a front page rather than a section of the site.
 *
 * Madame Tussauds' stored website is `madametussauds.com/london/en/`, and its visitor pages live at `/london/plan-your-
 * visit/...`. Read literally, `en` made the venue's own section `/london/en`, so every one of its own pages was "the same
 * site, relationship not established" and its true facts were withheld ("There is no parking onsite"). The same shape:
 * Trent Park's `/Welcome.html`, Wimbledon's `/index.html`, the Cable Car's `/en`. Only a TRAILING segment is dropped, and
 * only one of these words, so a real section (`/london`, `/docklands`) is never widened.
 */
const NON_SECTION_SEGMENT = /^(?:en|en[-_](?:gb|uk|us)|uk|gb|home|index(?:\.[a-z]+)?|default(?:\.[a-z]+)?|welcome(?:\.[a-z]+)?)$/;

/** The path that identifies a site entry: its segments, without a trailing language or front-page segment. */
function identitySegments(url) {
  const segments = pathSegments(url);
  while (segments.length > 0 && NON_SECTION_SEGMENT.test(segments[segments.length - 1])) segments.pop();
  return segments;
}

/** Whether `candidate` is at or beneath `base` (both as segment arrays). */
function isAtOrUnder(candidate, base) {
  return base.every((segment, index) => candidate[index] === segment);
}

/**
 * Tokens of a venue name that could identify it in a URL or a title.
 *
 * Deliberately crude and deliberately conservative: short words carry no identifying weight, and a
 * name that reduces to nothing yields no tokens, which means no page can ever be promoted for it.
 * Failing to promote is the safe direction.
 */
function nameTokens(venueName) {
  return primaryName(venueName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word.length >= 4);
}

/**
 * The venue's own name, without an operator or place suffix after a comma, dash or bar.
 *
 * "Walthamstow Wetlands, London Wildlife Trust" required `london`, `wildlife` and `trust` in a page's URL as well as
 * `walthamstow` and `wetlands`, so the reserve's own page (`/nature-reserves/walthamstow-wetlands`) could never be
 * recognised as named. The suffix names the operator, which is exactly what must NOT identify one venue among the
 * operator's several.
 */
function primaryName(venueName) {
  return String(venueName ?? '').split(/,|\s[-–|]\s/)[0];
}

function textNamesVenue(text, tokens) {
  if (tokens.length === 0) return false;
  const haystack = String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Every root that identifies this venue's own pages, as `{ host, segments }`.
 *
 *   1. its stored website, without a trailing language or front-page segment;
 *   2. reviewed extra official roots (`officialRoots`, from official-source-overrides.js), for a venue whose own visitor
 *      pages live on a second host or deeper than its stored website (Crystal Palace Park's pages are on
 *      crystalpalacepark.org.uk; its stored website is the trust's domain);
 *
 * The WHOLE host is never assumed to be one venue's, even where no other catalogue venue uses it and the host name names
 * the venue: a chain's site (askitalian.co.uk, nandos.co.uk) passes both tests and covers every branch. A venue whose
 * dedicated site is wider than its stored website gets a reviewed root instead (official-source-overrides.js).
 */
function ownRoots(entry) {
  const roots = [];
  const host = urlHost(entry?.website);
  if (host) roots.push({ host, segments: identitySegments(entry.website) });
  for (const url of entry?.officialRoots ?? []) {
    const rootHost = urlHost(url);
    if (rootHost) roots.push({ host: rootHost, segments: identitySegments(url) });
  }
  return roots;
}

/**
 * Classify one candidate page against the venue whose crawl is considering it.
 *
 * `catalogue` is the full list of `{ familypilotPlaceId, website, name }`, including this venue.
 * Passing the whole catalogue rather than a pre-filtered "others" list is deliberate: the most
 * specific matching site has to win, and that comparison is only correct when this venue's own
 * entry takes part in it.
 */
function classifySubjectScope({ sourceUrl, pageTitle = null, venue, catalogue = [] }) {
  const ownWebsite = venue?.website ?? null;
  const srcHost = urlHost(sourceUrl);
  const ownHost = urlHost(ownWebsite);

  // No URL, no host, or no website to compare against: nothing can be established.
  if (!sourceUrl || !srcHost || !ownHost) {
    return { scope: 'sibling_unverified', reason: 'no_comparable_url' };
  }

  const srcSegments = pathSegments(sourceUrl);
  const ownSegments = identitySegments(ownWebsite);
  const mine = ownRoots(venue);
  const others = catalogue.filter((row) => row.familypilotPlaceId !== venue.familypilotPlaceId);

  if (!mine.some((root) => root.host === srcHost)) {
    // Another venue may still own this host, and that is worth recording rather than losing.
    const foreign = others.find((row) => ownRoots(row).some((root) => root.host === srcHost && isAtOrUnder(srcSegments, root.segments)));
    if (foreign) {
      return { scope: 'other_catalogue_venue', reason: 'offsite_page_owned_by_another_venue', ownedBy: foreign.familypilotPlaceId };
    }
    return { scope: 'sibling_unverified', reason: 'different_host' };
  }

  /**
   * The most specific catalogue site this page falls under wins.
   *
   * Specificity matters in both directions. Horniman Museum's website is the bare origin, so the
   * Butterfly House page is trivially "under" it -- but the Butterfly House is its own catalogue
   * venue with a longer path, so the page is that venue's, not the museum's. Conversely two
   * catalogue rows can share one website exactly (a duplicate record: `wbstudiotour.co.uk` carries
   * both "Harry Potter Studio" and "Warner Bros. Studio Tour London"), and a tie must resolve in
   * favour of the venue being crawled or a duplicate row would reject the entire site.
   */
  let bestDepth = -1;
  let bestIsOwn = false;
  let bestOther = null;
  const consider = (roots, row, isOwn) => {
    for (const root of roots) {
      if (root.host !== srcHost || !isAtOrUnder(srcSegments, root.segments)) continue;
      if (root.segments.length > bestDepth) {
        bestDepth = root.segments.length;
        bestIsOwn = isOwn;
        bestOther = isOwn ? null : row;
      } else if (root.segments.length === bestDepth && isOwn) {
        bestIsOwn = true;
        bestOther = null;
      }
    }
  };
  for (const row of others) consider(ownRoots(row), row, false);
  consider(mine, null, true);

  if (bestDepth >= 0 && bestIsOwn) {
    return { scope: 'venue_own_subtree', reason: 'under_own_website' };
  }
  if (bestOther) {
    return { scope: 'other_catalogue_venue', reason: 'under_another_catalogue_venue', ownedBy: bestOther.familypilotPlaceId };
  }

  // A strict ancestor of the venue's own path: the operator's page, above this venue.
  if (srcHost === ownHost && srcSegments.length < ownSegments.length && isAtOrUnder(ownSegments, srcSegments)) {
    return { scope: 'organisation_ancestor', reason: 'ancestor_of_own_website' };
  }

  /**
   * Last chance, and the only rule that reads text. It requires TWO independent explicit namings
   * -- the URL path AND the page title -- and that no other catalogue venue is named in either.
   * Royal Museums Greenwich reaches this: `/plan-your-visit/accessibility-cutty-sark`, titled
   * "Accessibility at Cutty Sark", is genuinely the Cutty Sark's accessibility page even though it
   * lives outside `/cutty-sark`. A title on its own can never get here, which is the point: title
   * similarity must not be able to manufacture venue identity by itself.
   */
  const tokens = nameTokens(venue?.name);
  const namedInUrl = textNamesVenue(srcSegments.join(' '), tokens);
  const namedInTitle = textNamesVenue(pageTitle ?? '', tokens);
  if (tokens.length > 0 && namedInUrl && namedInTitle) {
    const namesAnotherVenue = catalogue.some((row) => {
      if (row.familypilotPlaceId === venue.familypilotPlaceId) return false;
      const otherTokens = nameTokens(row.name);
      if (otherTokens.length === 0) return false;
      /**
       * A venue whose name is LESS specific than this one cannot out-identify it. "London Eye"
       * reduces to the single token `london`, because `eye` is under the length threshold, and
       * that token then vetoed London Fields' own council page. A name whose tokens are a subset
       * of this venue's is a weaker description of the same text, not a competing claim to it.
       * Found by an independent count disagreeing with this module on three claims.
       */
      if (otherTokens.every((token) => tokens.includes(token))) return false;
      /**
       * The other venue has to be named at least as strongly as this one -- in BOTH the URL and
       * the title, the same bar the promotion itself had to clear. Accepting either signal alone
       * made this a veto rather than a contest: Burgess Park's OWN council page, titled "Burgess
       * Park | Southwark Council", was blocked because "Southwark Park" is also in the catalogue
       * and its two tokens turned up across the title. Caught by an independent SQL count
       * disagreeing with this module, 153 against 145.
       */
      return textNamesVenue(srcSegments.join(' '), otherTokens)
        && textNamesVenue(pageTitle ?? '', otherTokens);
    });
    if (!namesAnotherVenue) {
      return { scope: 'venue_named_page', reason: 'named_in_url_and_title' };
    }
    return { scope: 'sibling_unverified', reason: 'names_more_than_one_catalogue_venue' };
  }

  return { scope: 'sibling_unverified', reason: 'same_host_no_established_relationship' };
}

module.exports = {
  SUBJECT_SCOPES,
  ELIGIBLE_SCOPES,
  isEligibleScope,
  classifySubjectScope,
  urlHost,
  pathSegments,
  isAtOrUnder,
  nameTokens,
  identitySegments,
  ownRoots,
};
