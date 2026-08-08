/**
 * Official source discovery — prefer Google/provider website over guessing.
 * Discovers same-domain pages via anchor text, URL paths, and common path templates.
 */

const {
  findRelevantLinks,
  COMMON_PATH_SEGMENTS,
} = require('./html-text-extractor');

const PAGE_TYPE_PATTERNS = [
  { type: 'accessibility_page', pattern: /accessibility|access-for-all|disabled-access|access-map/i },
  { type: 'visitor_info', pattern: /plan.?your.?visit|visitor.?information|your.?visit|facilities|getting.?here|admission|location/i },
  { type: 'faq_page', pattern: /faq|frequently.?asked|help/i },
  { type: 'family_page', pattern: /family|children|kids|parents/i },
  { type: 'visitor_info', pattern: /\/visit\b|parking|contact|information/i },
];

const PATH_PRIORITY = [
  'visit',
  'plan-your-visit',
  'visitor-information',
  'your-visit',
  'accessibility',
  'access',
  'facilities',
  'faq',
  'faqs',
  'getting-here',
  'parking',
  'family',
  'parents',
  'information',
  'help',
  'admission',
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

function buildCommonPathCandidates(homepageUrl, maxCandidates = 8) {
  const base = new URL(homepageUrl);
  const origin = base.origin;
  const candidates = [];

  for (const segment of PATH_PRIORITY) {
    if (!COMMON_PATH_SEGMENTS.includes(segment)) continue;
    const paths = [`/${segment}`, `/${segment}/`];
    for (const path of paths) {
      const url = normalisePageUrl(`${origin}${path}`, homepageUrl);
      if (!url) continue;
      candidates.push({
        url,
        sourceType: classifyLinkedUrl(url),
        score: 50 + (PATH_PRIORITY.length - PATH_PRIORITY.indexOf(segment)),
        reason: `common_path:${segment}`,
        anchorText: segment.replace(/-/g, ' '),
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
    pages: [{ url: homepage, sourceType: 'official_website', score: 100, reason: 'homepage' }],
    googleDescription: googleDescription ?? null,
  };
}

function mergePageCandidates(homepageUrl, existingPages, html, maxPages = 5) {
  const homepageKey = normalisePageUrl(homepageUrl, homepageUrl)?.replace(/\/$/, '');
  const byUrl = new Map();

  for (const page of existingPages) {
    const key = normalisePageUrl(page.url, homepageUrl)?.replace(/\/$/, '');
    if (!key) continue;
    byUrl.set(key, {
      url: page.url,
      sourceType: page.sourceType ?? 'official_website',
      score: page.score ?? (key === homepageKey ? 100 : 40),
      reason: page.reason ?? 'initial',
      anchorText: page.anchorText ?? null,
    });
  }

  const linked = html ? findRelevantLinks(html, homepageUrl, maxPages * 3) : [];
  for (const link of linked) {
    const key = normalisePageUrl(link.url, homepageUrl)?.replace(/\/$/, '');
    if (!key || key === homepageKey) continue;
    const existing = byUrl.get(key);
    if (!existing || link.score > existing.score) {
      byUrl.set(key, {
        url: link.url,
        sourceType: classifyLinkedUrl(link.url, link.anchorText),
        score: link.score,
        reason: link.reason ?? 'anchor_or_path',
        anchorText: link.anchorText ?? null,
      });
    }
  }

  if (byUrl.size < maxPages) {
    for (const candidate of buildCommonPathCandidates(homepageUrl, maxPages * 2)) {
      const key = candidate.url.replace(/\/$/, '');
      if (byUrl.has(key)) continue;
      byUrl.set(key, candidate);
      if (byUrl.size >= maxPages * 2) break;
    }
  }

  const sorted = [...byUrl.values()].sort((a, b) => b.score - a.score);
  const homepage = sorted.find((p) => p.url.replace(/\/$/, '') === homepageKey) ?? {
    url: homepageUrl,
    sourceType: 'official_website',
    score: 100,
    reason: 'homepage',
  };

  const others = sorted.filter((p) => p.url.replace(/\/$/, '') !== homepageKey);
  const selected = [homepage, ...others].slice(0, maxPages);

  const linksDiscovered = [
    ...linked.map((l) => ({ url: l.url, score: l.score, reason: l.reason, anchorText: l.anchorText })),
    ...buildCommonPathCandidates(homepageUrl, 12).map((c) => ({
      url: c.url,
      score: c.score,
      reason: c.reason,
      anchorText: c.anchorText,
    })),
  ];

  const uniqueDiscovered = [];
  const seen = new Set();
  for (const item of linksDiscovered) {
    const key = item.url.replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueDiscovered.push(item);
  }

  return {
    pages: selected.map(({ url, sourceType }) => ({ url, sourceType })),
    diagnostics: {
      linksDiscovered: uniqueDiscovered,
      linksSelected: selected.map((p) => ({
        url: p.url,
        score: p.score,
        reason: p.reason,
        anchorText: p.anchorText,
        sourceType: p.sourceType,
      })),
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
};
