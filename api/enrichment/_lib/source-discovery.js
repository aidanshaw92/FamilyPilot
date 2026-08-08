/**
 * Official source discovery — prefer Google/provider website over guessing.
 */

const { findLinkedPages } = require('./html-text-extractor');

const PAGE_TYPE_PATTERNS = [
  { type: 'accessibility_page', pattern: /accessibility|access-for-all|disabled-access/i },
  { type: 'visitor_info', pattern: /plan.?your.?visit|visitor.?information|your.?visit|facilities/i },
  { type: 'faq_page', pattern: /faq|frequently.?asked/i },
  { type: 'family_page', pattern: /family|children|kids/i },
];

function classifyLinkedUrl(url) {
  for (const { type, pattern } of PAGE_TYPE_PATTERNS) {
    if (pattern.test(url)) return type;
  }
  return 'visitor_info';
}

function normaliseWebsiteUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
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
    pages: [{ url: homepage, sourceType: 'official_website' }],
    googleDescription: googleDescription ?? null,
  };
}

function expandDiscoveryFromHtml(html, homepageUrl, existingPages, maxPages = 5) {
  const pages = [...existingPages];
  const linked = findLinkedPages(html, homepageUrl, maxPages - 1);
  for (const url of linked) {
    if (pages.some((p) => p.url === url)) continue;
    pages.push({ url, sourceType: classifyLinkedUrl(url) });
    if (pages.length >= maxPages) break;
  }
  return pages;
}

module.exports = {
  discoverSourceUrls,
  expandDiscoveryFromHtml,
  normaliseWebsiteUrl,
  classifyLinkedUrl,
};
