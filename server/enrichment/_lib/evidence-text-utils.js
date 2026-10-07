/**
 * Clean extracted evidence snippets for storage and display.
 * Removes HTML/CSS fragments and obvious navigation/header labels.
 */

/** Section labels that leak from nav/header concatenation during HTML extraction. */
const NAV_FRAGMENT_PATTERNS = [
  /^all\s+parking\s+information\s+(?:toilet\s+facilities\s+)?/i,
  /^parking\s+information\s+(?:toilet\s+facilities\s+)?/i,
  /^visitor\s+information\s+/i,
  /^getting\s+here\s+/i,
  /^plan\s+your\s+visit\s+/i,
  /^accessibility\s+information\s+/i,
];

function stripNavFragmentPrefixes(text) {
  let cleaned = text.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of NAV_FRAGMENT_PATTERNS) {
      const next = cleaned.replace(pattern, '');
      if (next !== cleaned) {
        cleaned = next.trim();
        changed = true;
      }
    }
  }
  return cleaned;
}

/**
 * Named HTML entities that reach stored evidence text.
 *
 * `stripHtml` -- the whole-body fallback in html-text-extractor.js -- removed tags without decoding anything, and the
 * region path decoded only `&nbsp; &amp; &lt; &gt;` and numeric forms. So production text carries `Caf&eacute;`,
 * `children&rsquo;s` and `&pound;1.50`. Measured on 7 Oct 2026 across the latest reading of every fetched page: 239 of
 * them, across 74 venues, carry a named entity; 9 spell the café `Caf&eacute;`, which no café pattern can read. Brent
 * Council's Gladstone Park page lists "Facilities Children&rsquo;s playgrounds Outdoor gym Caf&eacute;" and served no
 * café; Victoria Park (Tower Hamlets) says "both our caf&eacute;s" and served none either.
 *
 * Decoding is not interpretation: it turns markup back into the characters the venue published, so every rule
 * downstream reads what a parent would read on the page. The list is the entities observed in the corpus plus their
 * obvious siblings; anything unknown is left exactly as it is.
 */
const NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  eacute: '\u00e9', egrave: '\u00e8', ecirc: '\u00ea', aacute: '\u00e1', agrave: '\u00e0', acirc: '\u00e2',
  iacute: '\u00ed', oacute: '\u00f3', ocirc: '\u00f4', uacute: '\u00fa', ccedil: '\u00e7', auml: '\u00e4',
  ouml: '\u00f6', uuml: '\u00fc', Eacute: '\u00c9',
  rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c', sbquo: '\u201a', bdquo: '\u201e',
  ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', bull: '\u2022', middot: '\u00b7',
  rsaquo: '\u203a', lsaquo: '\u2039', raquo: '\u00bb', laquo: '\u00ab', rarr: '\u2192', larr: '\u2190',
  pound: '\u00a3', euro: '\u20ac', copy: '\u00a9', reg: '\u00ae', trade: '\u2122', deg: '\u00b0',
  frac12: '\u00bd', frac14: '\u00bc', frac34: '\u00be', times: '\u00d7',
};

function decodeOnce(text) {
  return text
    .replace(/&#(\d{1,6});/g, (whole, n) => {
      const code = Number(n);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    })
    .replace(/&#x([0-9a-f]{1,6});/gi, (whole, hex) => {
      const code = parseInt(hex, 16);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    })
    .replace(/&([a-z][a-z0-9]{1,8});/gi, (whole, name) => NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()] ?? whole);
}

/**
 * Decode HTML character references. Twice at most, because some sites double-encode (`&amp;eacute;`): the first pass
 * yields `&eacute;`, the second `é`. A third level does not occur in the corpus and is left alone.
 */
function decodeHtmlEntities(text) {
  if (typeof text !== 'string' || !text.includes('&')) return text;
  const once = decodeOnce(text);
  return once.includes('&') ? decodeOnce(once) : once;
}

function cleanEvidenceSnippet(text) {
  if (!text || typeof text !== 'string') return null;

  let cleaned = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[.#][a-z0-9_-]+\s*\{[^}]*\}/gi, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/@[a-z-]+\s*\{[^}]*\}/gi, ' ')
    .replace(/\b[a-z0-9_-]+\s*\{[^}]*\}/gi, ' ')
    // A bare selector (".baby-changing", "#main") left behind once its block has gone. It must START a token: the
    // unanchored form also deleted decimals and dotted names out of real quotes, so Golders Hill Park's "dimensions
    // are 2.13m by 1.4m with door width 0.85m" was stored as "2 by 1 with door width 0".
    .replace(/(^|\s)\.[a-z][a-z0-9_-]*\b/gi, '$1 ')
    .replace(/(^|\s)#[a-z][a-z0-9_-]*\b/gi, '$1 ')
    .replace(/\b(?:font-family|font-size|margin|padding|color|background|display|width|height)\s*:\s*[^;]+;?/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?(?:px|em|rem|vh|vw|%)\b/gi, ' ')
    .replace(/\brgb\([^)]*\)/gi, ' ')
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  cleaned = stripNavFragmentPrefixes(cleaned);

  if (cleaned.length < 8) return null;
  return cleaned.slice(0, 400);
}

/**
 * Is this sentence a question rather than a statement of fact?
 *
 * FAQ pages concatenate their question headings into the body text, so "Are prams allowed?" arrives
 * looking exactly like prose. Paradox Museum London published `pushchairSuitability = good` because
 * that heading satisfied a welcome pattern on the substring "prams allowed", while the two explicit
 * denials further up the same page ("the space is not accessible for prams/strollers") matched nothing.
 * A question is evidence of neither availability nor absence.
 *
 * One definition, shared by the field-pattern extractor and the pushchair classifier. The extractor
 * had this rule; the pushchair classifier did not, which is how the same page produced opposite
 * readings of the same sentence.
 */
function isInterrogativeSentence(sentence) {
  const value = String(sentence ?? '').trim();
  return (
    /\?$/.test(value) ||
    (/^(?:are|is|do|does|can|where|what|when|how|will|have)\b/i.test(value) && !/[.!]\s*$/.test(value))
  );
}

module.exports = {
  decodeHtmlEntities,
  cleanEvidenceSnippet,
  stripNavFragmentPrefixes,
  isInterrogativeSentence,
  NAV_FRAGMENT_PATTERNS,
};
