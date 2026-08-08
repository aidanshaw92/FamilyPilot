/**
 * Clean extracted evidence snippets for display.
 * Mirrors api/enrichment/_lib/evidence-text-utils.js.
 */
export function cleanEvidenceSnippet(text: string | null | undefined): string | null {
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

  if (cleaned.length < 8) return null;
  return cleaned.slice(0, 400);
}
