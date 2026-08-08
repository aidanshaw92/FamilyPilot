/**
 * Extract compact readable text from HTML for evidence research.
 */

const LINK_KEYWORDS = [
  'faq', 'faqs', 'visit', 'visitor', 'plan your visit', 'plan-your-visit', 'accessibility',
  'access', 'facilities', 'venue', 'location', 'contact', 'parking', 'family', 'parents',
  'information', 'help', 'admission', 'getting here', 'your visit', 'opening', 'directions',
];

const CONTENT_KEYWORDS = [
  'toilet', 'baby', 'changing', 'parking', 'accessible', 'wheelchair', 'pushchair',
  'buggy', 'cafe', 'restaurant', 'picnic', 'sensory', 'quiet', 'send', 'carer',
  'changing places', 'family', 'children', 'visit', 'facilities', 'access',
  'step-free', 'lift', 'terrain', 'path', 'playground', 'microwave', 'shade', 'pram',
];

const COMMON_PATH_SEGMENTS = [
  'visit', 'plan-your-visit', 'visitor-information', 'your-visit', 'accessibility', 'access',
  'facilities', 'faq', 'faqs', 'getting-here', 'parking', 'family', 'parents',
  'information', 'help', 'admission', 'contact', 'venue', 'location',
];

function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripTags(html) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractRegion(html, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  const parts = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    parts.push(stripTags(match[1]));
  }
  return parts.join(' ');
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]).slice(0, 200) : null;
}

function scoreText(text, keywords = CONTENT_KEYWORDS) {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) score += 2;
  }
  return score;
}

function extractRelevantParagraphs(text, maxChars = 8000) {
  const chunks = text
    .split(/(?:\n|\r|•|·|\u2022|(?<=[.!?])\s+)/)
    .map((s) => s.replace(/^[\s\-–—*]+/, '').trim())
    .filter((s) => s.length > 15);

  const scored = chunks
    .map((chunk) => ({ chunk, score: scoreText(chunk) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked = [];
  let total = 0;
  for (const { chunk } of scored) {
    if (total + chunk.length > maxChars) break;
    picked.push(chunk);
    total += chunk.length + 1;
  }

  if (picked.length === 0) {
    return text.slice(0, maxChars);
  }
  return picked.join(' ').slice(0, maxChars);
}

function extractPageContent(html, maxChars = 8000) {
  const title = extractTitle(html);
  const main = extractRegion(html, 'main');
  const article = extractRegion(html, 'article');
  const footer = extractRegion(html, 'footer');
  const bodyFallback = stripHtml(html);

  const combined = [main, article, footer, bodyFallback].filter(Boolean).join(' ');
  const relevant = extractRelevantParagraphs(combined, maxChars);
  return { title, text: relevant };
}

function scoreLink(url, anchorText) {
  const haystack = `${url} ${anchorText}`.toLowerCase();
  let score = 0;
  let matched = [];

  for (const kw of LINK_KEYWORDS) {
    if (haystack.includes(kw)) {
      score += kw.includes(' ') ? 8 : 5;
      matched.push(kw);
    }
  }

  if (/\/visit\b|plan-your-visit|visitor-information|your-visit/.test(haystack)) score += 12;
  if (/accessibility|access-for-all|disabled-access/.test(haystack)) score += 10;
  if (/faq|frequently-asked|help/.test(haystack)) score += 8;
  if (/facilities|parking|getting-here|admission/.test(haystack)) score += 6;

  return { score, matched };
}

function findRelevantLinks(html, baseUrl, maxLinks = 12) {
  const base = new URL(baseUrl);
  const anchorRegex = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const candidates = [];
  let match;

  while ((match = anchorRegex.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], baseUrl);
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
      if (resolved.hostname !== base.hostname) continue;

      const anchorText = stripTags(match[2]).slice(0, 120);
      const url = resolved.toString();
      const { score, matched } = scoreLink(`${resolved.pathname} ${url}`, anchorText);
      if (score <= 0) continue;

      candidates.push({
        url,
        anchorText,
        score,
        reason: matched.length ? `matched:${matched.slice(0, 3).join(',')}` : 'path',
      });
    } catch {
      // skip bad URLs
    }
  }

  const hrefRegex = /href=["']([^"'#]+)["']/gi;
  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], baseUrl);
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
      if (resolved.hostname !== base.hostname) continue;
      const url = resolved.toString();
      const { score, matched } = scoreLink(`${resolved.pathname} ${url}`, '');
      if (score <= 0) continue;
      if (candidates.some((c) => c.url === url)) continue;
      candidates.push({ url, anchorText: null, score, reason: matched.length ? `path:${matched[0]}` : 'path' });
    } catch {
      // skip
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const unique = [];
  for (const item of candidates) {
    const key = item.url.replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= maxLinks) break;
  }
  return unique;
}

/** @deprecated use findRelevantLinks */
function findLinkedPages(html, baseUrl, maxLinks = 4) {
  return findRelevantLinks(html, baseUrl, maxLinks).map((l) => l.url);
}

function isCloudflareChallenge(html) {
  if (!html) return false;
  const lower = html.toLowerCase();
  return (
    lower.includes('just a moment') ||
    lower.includes('cf-chl') ||
    lower.includes('challenge-platform') ||
    lower.includes('checking your browser') ||
    lower.includes('enable javascript and cookies to continue')
  );
}

module.exports = {
  extractPageContent,
  findRelevantLinks,
  findLinkedPages,
  stripHtml,
  stripTags,
  scoreLink,
  isCloudflareChallenge,
  CONTENT_KEYWORDS,
  LINK_KEYWORDS,
  COMMON_PATH_SEGMENTS,
};
