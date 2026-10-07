/**
 * Official source discovery — prefer Google/provider website over guessing.
 * Discovers same-domain pages via anchor text, URL paths, and common path templates.
 */

const {
  findRelevantLinks,
  COMMON_PATH_SEGMENTS,
} = require('./html-text-extractor');
const { classifySubjectScope } = require('./source-identity');

const DISCOVERED_LINK_BOOST = 200;
const COMMON_PATH_BASE_SCORE = 15;
const HOMEPAGE_SCORE = 1000;

const PAGE_TYPE_PATTERNS = [
  { type: 'accessibility_page', pattern: /accessibility|access-for-all|disabled-access|access-map|additional-needs/i },
  { type: 'visitor_info', pattern: /plan.?your.?visit|visitor.?information|your.?visit|facilities|getting.?here|admission|location/i },
  { type: 'faq_page', pattern: /faq|frequently.?asked|learning-session-faq/i },
  { type: 'family_page', pattern: /family|children|kids|parents/i },
  { type: 'visitor_info', pattern: /\/visit\b|getting.?here|visitor.?information|plan.?your.?visit/i },
];

/**
 * The order speculative `/segment` guesses are tried in, best first.
 *
 * Ordered by which FIELDS a page type carries, not by how often such a page turns out to exist. The
 * previous order was the reverse, and it is why coverage stalled: the four slots a crawl actually
 * reached were spent on `/visit`, `/plan-your-visit`, `/visitor-information` and `/your-visit`, four
 * pages that say much the same thing, while `/facilities` -- the page that names toilets and baby
 * changing -- was tried on three URLs in the entire catalogue.
 *
 * Measured yield across 953 stored evidence rows, for the record, because it argues both ways:
 *
 *   /visit                208 rows, 145 usable (70%)   highest hit rate of any guess
 *   /plan-your-visit      184 rows, 115 usable (62%)
 *   /accessibility         50 rows,  40 usable (80%)
 *   /parking               28 rows,  26 usable (93%)
 *   /faq                   25 rows,  21 usable (84%)
 *   /family                18 rows,  18 usable (100%)
 *   /getting-here          14 rows,  13 usable (93%)
 *   /facilities             3 rows,   2 usable          barely tried
 *   /your-visit            69 rows,  12 usable (17%)   worst performer, previously slot 4
 *   /visitor-information   70 rows,   7 usable (10%)   second worst, previously slot 3
 *   /toilets, /baby-changing, /children, /kids    never tried, yield unknown
 *
 * So `/visit` and `/plan-your-visit` are demoted DESPITE the best hit rates: their pages are the ones
 * already crawled, and another copy of the same generic page is not another family fact. They sit
 * mid-list rather than last, because the attempt ceiling still reaches them on most venues. The two
 * genuinely weak guesses, `/your-visit` and `/visitor-information`, are demoted on their own numbers.
 *
 * `/toilets` and `/baby-changing` are last of the topical guesses precisely because their yield is
 * unknown; the controlled cohort measures it before they are trusted any further up.
 */
const PATH_PRIORITY = [
  'accessibility',
  'facilities',
  'family',
  'families',
  'faq',
  'faqs',
  'parking',
  'getting-here',
  // A weaker synonym than `/accessibility`, and on some sites an unrelated page, so it follows the
  // distinct topics rather than sitting next to the segment it duplicates.
  'access',
  'plan-your-visit',
  'visit',
  'children',
  'kids',
  'parents',
  'admission',
  'toilets',
  'baby-changing',
  'your-visit',
  'visitor-information',
  'contact',
  'venue',
  'location',
];

function classifyLinkedUrl(url, anchorText = '') {
  const haystack = `${url} ${anchorText}`;
  for (const { type, pattern } of PAGE_TYPE_PATTERNS) {
    if (pattern.test(haystack)) return type;
  }
  return 'visitor_info';
}

function normaliseWebsiteUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalisePageUrl(url, baseUrl) {
  try {
    const parsed = new URL(url, baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    let normalised = parsed.toString();
    if (normalised.endsWith('/') && parsed.pathname !== '/') {
      normalised = normalised.slice(0, -1);
    }
    return normalised;
  } catch {
    return null;
  }
}

/**
 * Speculative `/visit`, `/accessibility`, `/facilities` … candidates for a venue's site.
 *
 * Rooted at the venue's OWN path, not at the origin. Rooting at the origin discarded the venue
 * entirely: crawling Tate Britain, whose website is `/visit/tate-britain`, it asked tate.org.uk for
 * `/visit` and `/accessibility` -- the organisation's pages, not the gallery's -- and 315 of the
 * 835 stored evidence rows came from exactly that. A venue that owns its whole host has an empty
 * path and is unaffected, which is the overwhelming majority of the catalogue.
 */
function buildCommonPathCandidates(homepageUrl, maxCandidates = 8) {
  const base = new URL(homepageUrl);
  // A website that is a document ("trentcountrypark.com/Welcome.html") is rooted at its folder: the guesses were
  // "Welcome.html/visit", "Welcome.html/accessibility" ..., which no server answers, and spent the venue's crawl
  // budget on errors (Trent Park, 7 Oct 2026: three of its six failed fetches are those).
  const folder = base.pathname.replace(/\/[^/]+\.(?:s?html?|php|aspx?|jsp)$/i, '');
  const root = `${base.origin}${folder.replace(/\/+$/, '')}`;
  const candidates = [];

  for (const segment of PATH_PRIORITY) {
    if (!COMMON_PATH_SEGMENTS.includes(segment)) continue;
    const paths = [`/${segment}`, `/${segment}/`];
    for (const path of paths) {
      const url = normalisePageUrl(`${root}${path}`, homepageUrl);
      if (!url) continue;
      candidates.push({
        url,
        sourceType: classifyLinkedUrl(url),
        score: COMMON_PATH_BASE_SCORE + (PATH_PRIORITY.length - PATH_PRIORITY.indexOf(segment)),
        reason: `common_path:${segment}`,
        anchorText: segment.replace(/-/g, ' '),
        speculative: true,
      });
    }
  }

  const seen = new Set();
  return candidates
    .filter((c) => {
      const key = c.url.replace(/\/$/, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxCandidates);
}

function discoverSourceUrls({ website, googleDescription }) {
  const homepage = normaliseWebsiteUrl(website);
  if (!homepage) {
    return {
      sourceStatus: 'no_official_source',
      homepage: null,
      pages: [],
    };
  }

  return {
    sourceStatus: 'official_website',
    homepage,
    pages: [{ url: homepage, sourceType: 'official_website', score: HOMEPAGE_SCORE, reason: 'homepage' }],
    googleDescription: googleDescription ?? null,
  };
}

/**
 * `venue` and `catalogue` scope the crawl to the venue, which is the fix for the defect that let
 * Tate Britain's crawl walk into the Tate Liverpool page through the site's global nav.
 *
 * A candidate that is, or sits beneath, ANOTHER catalogue venue's website is dropped here and
 * never fetched. That is the one rejection strong enough to make at discovery time, because it
 * compares against real stored `place_records.website` values rather than guessing from slugs.
 * Everything else is still fetched -- withholding happens later, on recorded provenance, so the
 * evidence exists to audit and to recover.
 *
 * Passing no `venue` leaves behaviour exactly as it was, so callers migrate one at a time.
 */
function mergePageCandidates(homepageUrl, existingPages, html, maxPages = 5, context = {}) {
  const homepageKey = normalisePageUrl(homepageUrl, homepageUrl)?.replace(/\/$/, '');
  const discovered = [];
  const commonPaths = [];
  const rejected = [];

  const { venue = null, catalogue = [] } = context;
  const belongsToAnotherVenue = (url) => {
    if (!venue) return null;
    const verdict = classifySubjectScope({ sourceUrl: url, venue, catalogue });
    return verdict.scope === 'other_catalogue_venue' ? verdict : null;
  };

  const linked = html ? findRelevantLinks(html, homepageUrl, maxPages * 6) : [];
  for (const link of linked) {
    const key = normalisePageUrl(link.url, homepageUrl)?.replace(/\/$/, '');
    if (!key || key === homepageKey) continue;
    const foreign = belongsToAnotherVenue(link.url);
    if (foreign) {
      rejected.push({ url: link.url, reason: foreign.reason, ownedBy: foreign.ownedBy });
      continue;
    }
    discovered.push({
      url: link.url,
      sourceType: classifyLinkedUrl(link.url, link.anchorText),
      score: link.score + DISCOVERED_LINK_BOOST,
      reason: link.reason ?? 'anchor_or_path',
      anchorText: link.anchorText ?? null,
      speculative: false,
    });
  }

  /**
   * Generate the whole priority list. It was 20 against a 17-entry list, so the cap never bit; the
   * list is now longer than 20, and a hard 20 would silently drop its tail. Which candidates are
   * actually FETCHED is decided by the crawl budgets in evidence-pipeline.js, where it can be seen.
   */
  for (const candidate of buildCommonPathCandidates(homepageUrl, PATH_PRIORITY.length)) {
    const key = candidate.url.replace(/\/$/, '');
    if (key === homepageKey) continue;
    if (discovered.some((d) => d.url.replace(/\/$/, '') === key)) continue;
    const foreign = belongsToAnotherVenue(candidate.url);
    if (foreign) {
      rejected.push({ url: candidate.url, reason: foreign.reason, ownedBy: foreign.ownedBy });
      continue;
    }
    commonPaths.push(candidate);
  }

  discovered.sort((a, b) => b.score - a.score);
  commonPaths.sort((a, b) => b.score - a.score);

  const homepage = {
    url: homepageUrl,
    sourceType: 'official_website',
    score: HOMEPAGE_SCORE,
    reason: 'homepage',
    speculative: false,
  };

  const orderedCandidates = [...discovered, ...commonPaths];
  const initialOthers = orderedCandidates.slice(0, Math.max(0, maxPages - 1));
  const reserveCandidates = orderedCandidates.slice(Math.max(0, maxPages - 1));

  const selected = [homepage, ...initialOthers];

  const linksDiscovered = [
    ...discovered.map((l) => ({
      url: l.url,
      score: l.score,
      reason: l.reason,
      anchorText: l.anchorText,
      speculative: false,
    })),
    ...commonPaths.map((c) => ({
      url: c.url,
      score: c.score,
      reason: c.reason,
      anchorText: c.anchorText,
      speculative: true,
    })),
  ];

  return {
    pages: selected.map(({ url, sourceType }) => ({ url, sourceType })),
    reserveCandidates: reserveCandidates.map(({ url, sourceType }) => ({ url, sourceType })),
    diagnostics: {
      linksDiscovered,
      linksSelected: selected.map((p) => ({
        url: p.url,
        score: p.score,
        reason: p.reason,
        anchorText: p.anchorText,
        sourceType: p.sourceType,
        speculative: p.speculative ?? false,
      })),
      reserveCount: reserveCandidates.length,
      // Named, not silently dropped: a crawl that refuses a page should be able to say which and why.
      linksRejectedAsOtherVenue: rejected,
    },
  };
}

/** @deprecated use mergePageCandidates */
function expandDiscoveryFromHtml(html, homepageUrl, existingPages, maxPages = 5) {
  return mergePageCandidates(homepageUrl, existingPages, html, maxPages).pages;
}

module.exports = {
  discoverSourceUrls,
  expandDiscoveryFromHtml,
  mergePageCandidates,
  buildCommonPathCandidates,
  normaliseWebsiteUrl,
  normalisePageUrl,
  classifyLinkedUrl,
  PATH_PRIORITY,
  DISCOVERED_LINK_BOOST,
};
