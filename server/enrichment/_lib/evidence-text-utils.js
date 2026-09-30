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

function cleanEvidenceSnippet(text) {
  if (!text || typeof text !== 'string') return null;

  let cleaned = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[.#][a-z0-9_-]+\s*\{[^}]*\}/gi, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/@[a-z-]+\s*\{[^}]*\}/gi, ' ')
    .replace(/\b[a-z0-9_-]+\s*\{[^}]*\}/gi, ' ')
    .replace(/\.[a-z0-9_-]+\b/gi, ' ')
    .replace(/#[a-z0-9_-]+\b/gi, ' ')
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
  cleanEvidenceSnippet,
  stripNavFragmentPrefixes,
  isInterrogativeSentence,
  NAV_FRAGMENT_PATTERNS,
};
