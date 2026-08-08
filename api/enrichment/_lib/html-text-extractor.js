/**
 * Extract compact readable text from HTML for evidence research.
 */

const KEYWORDS = [
  'toilet', 'baby', 'changing', 'parking', 'accessible', 'wheelchair', 'pushchair',
  'buggy', 'cafe', 'restaurant', 'picnic', 'sensory', 'quiet', 'send', 'carer',
  'changing places', 'family', 'children', 'visit', 'facilities', 'access',
  'step-free', 'lift', 'terrain', 'path', 'playground', 'microwave', 'shade',
];

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]).slice(0, 200) : null;
}

function scoreParagraph(text) {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of KEYWORDS) {
    if (lower.includes(kw)) score += 2;
  }
  return score;
}

function extractRelevantParagraphs(text, maxChars = 8000) {
  const chunks = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30);

  const scored = chunks
    .map((chunk) => ({ chunk, score: scoreParagraph(chunk) }))
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
  const plain = stripHtml(html);
  const relevant = extractRelevantParagraphs(plain, maxChars);
  return { title, text: relevant };
}

function findLinkedPages(html, baseUrl, maxLinks = 4) {
  const base = new URL(baseUrl);
  const patterns = [
    /accessibility/i, /access/i, /visit/i, /plan.?your.?visit/i, /facilities/i,
    /faq/i, /family/i, /children/i, /accessibility/i, /getting.?here/i, /parking/i,
  ];
  const links = new Set();
  const hrefRegex = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], baseUrl);
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
      if (resolved.hostname !== base.hostname) continue;
      const pathText = `${resolved.pathname} ${match[1]}`;
      if (patterns.some((p) => p.test(pathText))) {
        links.add(resolved.toString());
      }
    } catch {
      // skip bad URLs
    }
    if (links.size >= maxLinks) break;
  }
  return [...links].slice(0, maxLinks);
}

module.exports = {
  extractPageContent,
  findLinkedPages,
  stripHtml,
  KEYWORDS,
};
