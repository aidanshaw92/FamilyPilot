/**
 * Extract compact readable text from HTML for evidence research.
 */

/**
 * Anchor text and path words that mark a REAL internal link as visitor or facility information.
 *
 * These only rank links a venue's own homepage already publishes, so a term here costs nothing when
 * a site does not use it -- unlike a speculative path, which spends a fetch attempt on a guess. That
 * asymmetry is why the family-facility terms below are added here first and to the speculative list
 * only where the corpus already shows them paying: if the homepage tells us where its baby-changing
 * information lives, following that link beats guessing `/baby-changing` every time.
 *
 * `baby` alone is deliberately absent: it matches pushchair-shop and baby-class pages far more often
 * than facility pages. Only the compound forms are trusted. `buggy` likewise appears only in the
 * compounds that are unambiguously facility information, never on its own.
 */
const LINK_KEYWORDS_STRONG = [
  'plan your visit',
  'plan-your-visit',
  'visitor information',
  'visitor-information',
  'your visit',
  'getting here',
  'getting-here',
  'additional needs',
  'accessibility',
  'facilities',
  'faq',
  'faqs',
  'family',
  'families',
  'children',
  'childrens',
  'kids',
  'parents',
  'admission',
  'parking',
  'visit',
  'visitor',
  'plan your day',
  'baby changing',
  'baby-changing',
  'changing places',
  'toilet',
  'toilets',
  'pushchair',
  'pushchairs',
  'buggy park',
  'buggy storage',
];

const LINK_KEYWORDS_WEAK = ['contact', 'location', 'directions', 'opening', 'venue'];

/**
 * Strong keywords that count in ANCHOR TEXT only when that anchor is a label rather than prose.
 *
 * A path segment is site structure: `/families` exists because someone built a families page. The same
 * word inside a sentence is not evidence of anything -- "We help families find jobs" is a careers
 * link, and adding `families` to the strong list promptly selected one. So these terms score at full
 * strength in a URL path, and in anchor text only when the anchor reads like navigation: at most four
 * words. "Toilets and baby changing" qualifies; the careers sentence does not.
 *
 * `family` is included although it predates this list: it carries exactly the same hazard, and the
 * guard can only ever remove a false positive.
 */
const LABEL_ONLY_ANCHOR_KEYWORDS = new Set([
  'family', 'families', 'children', 'childrens', 'kids',
  'baby changing', 'baby-changing', 'changing places',
  'toilet', 'toilets', 'pushchair', 'pushchairs', 'buggy park', 'buggy storage',
]);

/** Navigation labels are short noun phrases; prose is not. */
function isLabelLikeAnchor(anchorText) {
  return anchorText.trim().split(/\s+/).filter(Boolean).length <= 4;
}

/** @deprecated use STRONG + WEAK lists */
const LINK_KEYWORDS = [...LINK_KEYWORDS_STRONG, ...LINK_KEYWORDS_WEAK];

const UTILITY_PATH_PATTERNS = [
  /recite/i,
  /userway/i,
  /audioeye/i,
  /accessibility-toolbar/i,
  /accessibility-tools/i,
  /accessibility-widget/i,
  /skip-to/i,
  /skip_to/i,
  /cookie/i,
  /privacy/i,
  /terms-of/i,
  /\/terms\b/i,
  /login/i,
  /sign-in/i,
  /signin/i,
  /\/account\b/i,
  /\/basket\b/i,
  /\/cart\b/i,
  /\/search\b/i,
  /sitemap/i,
  /\/legal\b/i,
  /gdpr/i,
  /wp-admin/i,
];

const UTILITY_ANCHOR_PATTERNS = [
  /^skip to/i,
  /^accessibility tools/i,
  /^accessibility toolbar/i,
  /^recite me/i,
  /^cookie preferences/i,
  /^cookie settings/i,
  /^privacy policy/i,
  /^terms and conditions/i,
  /^terms of use/i,
  /^login$/i,
  /^sign in$/i,
  /^search$/i,
  /^accessibility statement$/i,
  /^site map$/i,
];

const CONTENT_KEYWORDS = [
  'toilet', 'baby', 'changing', 'parking', 'accessible', 'wheelchair', 'pushchair',
  'buggy', 'cafe', 'restaurant', 'picnic', 'sensory', 'quiet', 'send', 'carer',
  'changing places', 'family', 'children', 'visit', 'facilities', 'access',
  'step-free', 'lift', 'terrain', 'path', 'playground', 'microwave', 'shade', 'pram',
];

/**
 * The allow-list of segments a speculative `/segment` guess may be built from. `PATH_PRIORITY` in
 * source-discovery.js decides their ORDER; this list decides which exist at all. Both are edited
 * together -- a segment present in only one of them is silently never generated.
 */
const COMMON_PATH_SEGMENTS = [
  'visit', 'plan-your-visit', 'visitor-information', 'your-visit', 'accessibility', 'access',
  'facilities', 'faq', 'faqs', 'getting-here', 'parking', 'family', 'families', 'children', 'kids',
  'parents', 'admission', 'toilets', 'baby-changing', 'contact', 'venue', 'location',
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

/**
 * Elements whose TEXT is never page content, however deeply they sit inside an article.
 *
 * `stripTags` removes tags but keeps the text between them, which is right for prose and catastrophic
 * for these: a `<style>` block inside `<main>` contributes its whole stylesheet as "evidence". On
 * 2026-10-01, of 688 fetched evidence rows, 54 carried CSS, 80 carried JSON-LD or escaped JSON and 103
 * carried inline JavaScript -- 197 rows, 28.6%, contaminated. Belmont Children's Farm's stored text
 * begins `.fe-65b40341bcdc4b1fc633a8a6 { --grid-gutter: calc(var(--sqs-mobile-site-gutter, 6vw)...`
 * and runs to the full 8000-character cap, so its real prose never reached the extractor at all. Its
 * published `environment = mixed` cites, verbatim, `ment-wrapper } Indoor & Outdoor Visitors Farm {
 * --stroke-style`.
 *
 * `stripHtml` already dropped script and style for the whole-body fallback. `extractRegion` did not,
 * so the main/article/footer path carried everything straight through. Removed once, up front, so
 * every path downstream sees the same cleaned HTML.
 */
const NON_CONTENT_ELEMENTS = ['script', 'style', 'noscript', 'template', 'svg'];

/**
 * Raw-text elements only. Per the HTML parsing spec, everything after an unclosed `<script>` or
 * `<style>` is that element's text until a closing tag appears, so consuming to end of input matches
 * what a browser does -- and matters here because pages arrive truncated (`fetch_status =
 * fetched_truncated`), which is exactly how an unclosed `<style>` ends up as the tail of the input.
 * The others are normal elements: an unclosed `<svg>` does not swallow the document, so eating to the
 * end for those would silently discard real prose.
 */
const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);

function removeNonContentElements(html) {
  let cleaned = String(html ?? '').replace(/<!--[\s\S]*?-->/g, ' ');
  for (const tag of NON_CONTENT_ELEMENTS) {
    cleaned = cleaned.replace(
      new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'),
      ' ',
    );
    if (RAW_TEXT_ELEMENTS.has(tag)) {
      cleaned = cleaned.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*$`, 'i'), ' ');
    }
  }
  return cleaned;
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

function removeRegions(html, tagNames) {
  let out = String(html ?? '');
  for (const tag of tagNames) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), ' ');
  }
  return out;
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

/**
 * Does this chunk look like code or markup residue rather than a sentence a person wrote?
 *
 * A second line of defence behind `removeNonContentElements`. Element removal handles the proven
 * cases, but escaped JSON reaches the text through other routes -- a framework's hydration payload
 * printed into the body, a feed rendered as literal text -- and once such a chunk is in the pool the
 * field extractors read it as prose. Nando's publishes `environment = outdoor` from
 * `:"LocationFeatureSpecification","name":"Outdoor seating","value":true}`: a restaurant with a patio,
 * classified as an outdoor venue.
 *
 * Every test requires STRUCTURE, never a bare punctuation mark, because real visitor prose is full of
 * colons and the odd bracket: "Parking charges: \u00a31.50 per hour", "Open 9:00-17:00 (last entry
 * 16:30)", "Baby changing: in the main toilets". None of those may be discarded.
 *
 * An earlier version also rejected a chunk whose density of `{}();=<>` passed a threshold. Replayed
 * over the stored corpus it threw away plain English: "From Waterloo Station (5-minute walk): Exit the
 * station via Exit 6 (York Road) or follow signs for Leake Street.", "2) Accessibility Regulations
 * 2018 (the 'accessibility regulations').", "Visit our passholder pre-book page to book your visit(s)
 * here." Travel directions and numbered lists are full of brackets. A punctuation count cannot prove
 * that text is code, so it is gone; the structural rules each prove the thing they test.
 */
/**
 * Excise code and markup spans from a chunk, keeping the prose around them.
 *
 * Rejecting a whole chunk was the first design and it was wrong. Replayed over all 670 stored texts it
 * lost five correct facts and flipped two values, because sites glue residue onto real sentences:
 *
 *   Horniman        ".cls-1{fill:#fff;} Asset 1 Toggle navigation Search Plan Your Visit ..."
 *   Sydenham Hill   "Know before you go .st0{fill-rule:evenodd;clip-rule:evenodd;fill:#777} Size 11
 *                    hectares Access There are four ..."   <- an inline SVG stylesheet, and the chunk
 *                    carrying the venue's own Access statement
 *   Chiltern        "Plan your visit - Chiltern Open Air Museum ... <section data-test="page-section"
 *                    class='page-section ...'"             <- a raw tag the old extractor leaked
 *
 * Dropping those chunks removed the evidence that said `wheelchairAccessible = yes`, and a sentence
 * about the nearby railway station -- "The station is not wheelchair accessible" -- won instead. A
 * guard that turns a correct yes into a confident no is worse than the contamination it removes.
 */
function stripCodeResidue(chunk) {
  let out = String(chunk ?? '');

  // Raw HTML tags, and any unterminated tag running to the end of the chunk.
  out = out.replace(/<[^<>]*>/g, ' ').replace(/<[a-zA-Z/][^<>]*$/, ' ');

  // CSS rule blocks, with or without their selector, repeatedly for nested/consecutive blocks.
  for (let i = 0; i < 4; i += 1) {
    out = out.replace(/[.#]?[a-zA-Z0-9_\-]*[.#:][a-zA-Z0-9_\-]*\s*\{[^{}]*\}/g, ' ');
    out = out.replace(/\{[^{}]*[a-z-]+\s*:\s*[^{}]*\}/gi, ' ');
  }
  out = out.replace(/@(?:media|supports|font-face|keyframes|import)\b[^{]*\{[\s\S]*?\}/gi, ' ');
  // A stray declaration or brace left by an already-truncated block.
  out = out.replace(/--[a-z][a-z0-9-]*\s*:[^;}]*[;}]?/gi, ' ');
  // A declaration left behind by a block that was already truncated. Restricted to real CSS property
  // names: a generic `word: value;` rule ate Mayow Park's "Facilities include: play area cafe outdoor
  // gym nature reserve", and with it a correct playground fact.
  out = out.replace(
    /\b(?:color|background(?:-[a-z]+)?|font(?:-[a-z]+)?|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?|border(?:-[a-z]+)?|width|height|min-width|max-width|min-height|max-height|display|position|top|right|bottom|left|z-index|flex(?:-[a-z]+)?|grid(?:-[a-z]+)?|gap|opacity|overflow(?:-[a-z]+)?|text-[a-z]+|line-height|letter-spacing|fill|stroke(?:-[a-z]+)?|clip-rule|fill-rule|transform|transition|content|cursor|visibility)\s*:\s*[^;{}]{0,60}[;}]?/gi,
    ' ',
  );

  // Bare selector residue, left once a block's braces have gone. Swanley Park's stored text carries
  // `> :where( > ) > > > > , > > > > > > , [data-kb-block="kb-adv-heading1921_84b352-b0"] mark`.
  out = out.replace(/:(?:where|is|not|has|nth-child|nth-of-type)\s*\([^)]*\)/gi, ' ');
  out = out.replace(/\[[a-zA-Z-]+(?:[~^|$*]?=\s*["'][^"']*["'])?\]/g, ' ');
  out = out.replace(/(?:\s[>~+,]\s*){2,}/g, ' ');

  // JSON objects carrying quoted keys.
  for (let i = 0; i < 4; i += 1) {
    out = out.replace(/\{[^{}]*"[^"]+"\s*:[^{}]*\}/g, ' ');
  }
  out = out.replace(/"[a-zA-Z_@][a-zA-Z0-9_-]*"\s*:\s*("[^"]*"|true|false|null|-?\d+(?:\.\d+)?)/g, ' ');
  out = out.replace(/\\u[0-9a-fA-F]{4}/g, ' ');

  // JavaScript, in two passes.
  //
  // First, bounded call expressions, because a script is not always a suffix: a WordPress theme emits
  // `UNCODE.initRow(document.getElementById("row-unique-4")); From an annual dog show to
  // family-friendly Open Days ...` -- the code comes FIRST and real prose follows it. Cutting from the
  // marker to the end of the chunk, which an earlier version did, discarded that prose.
  for (let i = 0; i < 3; i += 1) {
    out = out.replace(
      /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*;?/g,
      ' ',
    );
  }
  out = out.replace(/\b(?:function\s*\([^)]*\)|\([^)]*\)\s*=>)\s*\{[^{}]*\}\s*\)?\s*;?/g, ' ');

  // Then anything still carrying a JS marker is unbalanced or truncated code, which has no reliable
  // end delimiter left, so the remainder of the chunk goes. Gladstone Park's text ends
  // `... in this park window ('DOMContentLoaded', (e) => { const map = L ('map', { scrol`.
  out = out.replace(
    /(?:\bfunction\s*\(|\)\s*=>|=>\s*\{|\bwindow\.|\bdocument\.|addEventListener|DOMContentLoaded|\bwindow\s*\()[\s\S]*$/,
    ' ',
  );

  return out.replace(/\s+/g, ' ').trim();
}

function looksLikeCodeOrMarkup(chunk) {
  return (
    // CSS declaration: a brace followed by `property: value`, or a custom property.
    /\{[^}]{0,200}[a-z-]+\s*:\s*[^;}]+[;}]/i.test(chunk) ||
    /--[a-z][a-z0-9-]*\s*:/i.test(chunk) ||
    // CSS at-rule.
    /@(?:media|supports|font-face|keyframes|import)\b/i.test(chunk) ||
    // JSON: a quoted key followed by a colon and a JSON value opener.
    /"[a-zA-Z_@][a-zA-Z0-9_-]*"\s*:\s*[{["']/.test(chunk) ||
    /"@(?:context|type|graph|id)"/i.test(chunk) ||
    // Escaped-unicode payloads, the signature of JSON embedded in an attribute or body.
    /\\u[0-9a-fA-F]{4}/.test(chunk) ||
    // JavaScript.
    /\bfunction\s*\(|\)\s*=>|=>\s*\{|\bwindow\.|\bdocument\.|addEventListener|DOMContentLoaded/.test(
      chunk,
    )
  );
}

function extractRelevantParagraphs(text, maxChars = 8000) {
  const chunks = text
    .split(/(?:\n|\r|•|·|\u2022|(?<=[.!?])\s+)/)
    .map((s) => s.replace(/^[\s\-–—*]+/, '').trim())
    .filter((s) => s.length > 15)
    // Clean first, then judge. A chunk is only discarded when nothing usable survives the cleaning,
    // so prose that merely sits next to a stylesheet keeps its fact.
    .map((s) => stripCodeResidue(s))
    .filter((s) => s.length > 15 && !looksLikeCodeOrMarkup(s));

  // Deduplicate. extractPageContent concatenates main, article, footer AND a whole-body fallback, so
  // every chunk inside <main> arrives at least twice and the budget pays for each copy. Golders Hill
  // Park's stored text is its breadcrumb repeated to the full 8000 characters. Dropping a source
  // region instead would risk losing a page whose <main> is a thin shell, so every region stays and
  // only the repetition goes.
  const seen = new Set();
  const unique = [];
  for (const chunk of chunks) {
    const key = chunk.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(chunk);
  }

  const scored = unique
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
    // No chunk matched a content keyword. The fallback exists because the field extractors look for
    // their own wording, not CONTENT_KEYWORDS, so a page saying only "We have highchairs" must still
    // reach them. It used to return `text` verbatim, which handed back the raw contaminated input and
    // bypassed the cleaning entirely -- a JSON-LD payload sailed straight through on any page with no
    // keyword hit. It returns the cleaned chunks instead, and nothing at all when none survive, which
    // isEvidenceBearingSource then correctly reads as a page with no evidence on it.
    return unique.join(' ').slice(0, maxChars);
  }
  return picked.join(' ').slice(0, maxChars);
}

function extractPageContent(html, maxChars = 8000) {
  // Cleaned once, up front. The title is read from the ORIGINAL html: <title> lives in <head>
  // alongside the elements being removed, and an unclosed <style> earlier in head would otherwise
  // take the title with it. Flip Out Brent Cross's `environment = indoor` comes from its title alone.
  const title = extractTitle(html);
  const cleaned = removeNonContentElements(html);
  const main = extractRegion(cleaned, 'main');
  const article = extractRegion(cleaned, 'article');
  const footer = extractRegion(cleaned, 'footer');

  // The fallback covers what the named regions did NOT. Previously it was the whole body, so every
  // chunk inside <main> arrived twice and the 8000-character budget paid for both copies; 78 of 688
  // stored rows sit exactly at the cap, with real prose crowded out behind the repetition. Removing
  // the regions already captured makes the four sources a partition instead of an overlap, so the
  // union of text is unchanged and only the duplication goes. Text dedupe cannot do this job: the two
  // copies differ at their edges, because the body version runs the heading into the paragraph and so
  // splits into differently-bounded chunks.
  const bodyFallback = stripHtml(removeRegions(cleaned, ['main', 'article', 'footer']));

  const combined = [main, article, footer, bodyFallback].filter(Boolean).join(' ');
  const relevant = extractRelevantParagraphs(combined, maxChars);
  return { title, text: relevant };
}

function includesKeyword(text, keyword) {
  const lower = text.toLowerCase();
  if (keyword.includes(' ')) {
    return lower.includes(keyword);
  }
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(lower);
}

function isUtilityLink(url, anchorText = '', anchorTagHtml = '') {
  let path = '';
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return true;
  }

  const anchor = anchorText.trim();
  const haystack = `${path} ${anchor} ${anchorTagHtml}`.toLowerCase();

  if (UTILITY_PATH_PATTERNS.some((p) => p.test(haystack))) return true;
  if (UTILITY_ANCHOR_PATTERNS.some((p) => p.test(anchor))) return true;

  if (/^help$/i.test(anchor) && !/\/faq|help-and|visitor-help|visit-help|plan-your/i.test(path)) {
    return true;
  }
  if (/\/help\/?$/i.test(path) && !/\/faq|visitor|visit|plan-your/i.test(path)) {
    return true;
  }

  if (/\baccess\b/i.test(anchor) && !/accessibility|wheelchair|disabled|additional needs|step-free/i.test(haystack)) {
    return true;
  }

  return false;
}

function scoreLink(url, anchorText) {
  const path = url.toLowerCase();
  const anchor = anchorText.trim();
  let score = 0;
  const matched = [];

  for (const kw of LINK_KEYWORDS_STRONG) {
    if (includesKeyword(path, kw)) {
      score += kw.includes(' ') ? 12 : 10;
      matched.push(`path:${kw}`);
    } else if (
      anchor.length <= 60
      && includesKeyword(anchor, kw)
      && (!LABEL_ONLY_ANCHOR_KEYWORDS.has(kw) || isLabelLikeAnchor(anchor))
    ) {
      score += kw.includes(' ') ? 8 : 6;
      matched.push(`anchor:${kw}`);
    }
  }

  for (const kw of LINK_KEYWORDS_WEAK) {
    if (includesKeyword(path, kw)) {
      score += 4;
      matched.push(`path:${kw}`);
    } else if (anchor.length <= 40 && includesKeyword(anchor, kw)) {
      score += 2;
      matched.push(`anchor:${kw}`);
    }
  }

  if (/\/visit\b|plan-your-visit|visitor-information|your-visit/.test(path)) score += 14;
  if (/accessibility|access-for-all|disabled-access|additional-needs/.test(path)) score += 12;
  if (/\/faq|frequently-asked|learning-session-faq/.test(path)) score += 10;
  if (/facilities|getting-here|admission/.test(path)) score += 6;

  if (/^help$/i.test(anchor) || /\/help\/?$/i.test(path)) {
    score = 0;
    matched.length = 0;
  }

  return { score, matched };
}

function findRelevantLinks(html, baseUrl, maxLinks = 12) {
  const base = new URL(baseUrl);
  const anchorRegex = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const candidates = [];
  let match;

  while ((match = anchorRegex.exec(html)) !== null) {
    try {
      const fullTag = match[0];
      const resolved = new URL(match[1], baseUrl);
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
      if (resolved.hostname !== base.hostname) continue;

      const anchorText = stripTags(match[2]).slice(0, 120);
      const url = resolved.toString();
      if (isUtilityLink(url, anchorText, fullTag)) continue;

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
      if (isUtilityLink(url, '')) continue;
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
  extractRelevantParagraphs,
  removeNonContentElements,
  looksLikeCodeOrMarkup,
  stripCodeResidue,
  findRelevantLinks,
  findLinkedPages,
  stripHtml,
  stripTags,
  scoreLink,
  isUtilityLink,
  isCloudflareChallenge,
  CONTENT_KEYWORDS,
  LINK_KEYWORDS,
  LINK_KEYWORDS_STRONG,
  COMMON_PATH_SEGMENTS,
};
