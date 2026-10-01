import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { extractPageContent } = require('../../../server/enrichment/_lib/html-text-extractor.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { extractEvidenceFromText } = require('../../../server/enrichment/_lib/evidence-extractor.js');

const META = { url: 'https://example.org/visit', sourceType: 'official_site' };

const facts = (html: string): string[] => {
  const { text } = extractPageContent(html) as { text: string };
  const found = (extractEvidenceFromText(text, META) ?? []) as Array<{ field: string; value: string }>;
  return [...new Set(found.map((f) => `${f.field}=${f.value}`))].sort();
};

const page = (body: string) =>
  `<html><head><title>Visit</title></head><body>${body}</body></html>`;

/**
 * `extractRelevantParagraphs` splits chunks on newline, bullet or sentence-end. Chrome has no
 * sentence-end in it, so when two regions were joined with a space the tail of one and the head of
 * the next became a single chunk -- scored, kept and published as a unit.
 *
 * Waterlow Park's `playground = yes` is that defect: a footer sitemap reading "… Activities --
 * volunteering, play areas, sports …" scores ZERO on its own and is discarded, but fused to the
 * content before it the pair scores on "facilities" and the footer rides along.
 */
describe('a region boundary is a chunk boundary', () => {
  it('stops a footer sitemap riding on the content chunk before it', () => {
    // Waterlow Park's real shape: a blog post that never mentions a playground, and a footer nav
    // whose link labels do.
    const html = page(`
      <main>
        <h1>Visitors to the Friends stall at the Highgate Fair</h1>
        <p>A sunny afternoon brought out the crowds to the Highgate Fair.</p>
        <p>Facilities Opening times Car park</p>
      </main>
      <footer><nav>
        <a>Back To Top</a><a>Home</a><a>News &amp; Events</a><a>The Park</a>
        <a>Activities &ndash; volunteering, play areas, sports</a><a>The Friends</a><a>Sitemap</a>
      </nav></footer>`);
    expect(facts(html)).not.toContain('playground=yes');
  });

  it('keeps regions apart even when both carry text with no terminator', () => {
    const { text } = extractPageContent(
      page('<main><p>Facilities Opening times Car park</p></main><footer><p>Home News Sitemap</p></footer>'),
    ) as { text: string };
    // The two runs may both survive, but never as one chunk.
    expect(text).not.toMatch(/Car park Home News Sitemap/);
  });

  it('keeps selected chunks apart in the stored text, not only while scoring', () => {
    // The boundary has to survive the LAST step too. `splitSentences` in evidence-extractor.js uses
    // an identical splitter, so two chunks selected separately and then rejoined with a space are
    // read back as one sentence and the separation is undone silently. A mutation that rejoined the
    // selected chunks with a space broke no other test in this file, which is why this one exists.
    const { text } = extractPageContent(
      page(`<main><p>Toilets and baby changing are available.</p>
        <p>Facilities Opening times Car park</p></main>
        <footer><nav><a>Home</a><a>Playgrounds</a><a>Sitemap</a></nav></footer>`),
    ) as { text: string };
    const SENTENCE_SPLIT = /(?:\n|\r|\u2022|\u00b7|(?<=[.!?])\s+)/;
    const sentences = text.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
    expect(sentences.some((s) => /Car park/.test(s) && /Playgrounds/.test(s))).toBe(false);
  });

  it('separates repeated instances of the same region', () => {
    const { text } = extractPageContent(
      page('<article><p>Our play area is open daily</p></article><article><p>Home News Sitemap</p></article>'),
    ) as { text: string };
    expect(text).not.toMatch(/open daily Home News Sitemap/);
  });
});

/**
 * The positive controls, and the reason this fix is a boundary change rather than a
 * "that looks like navigation" rule.
 *
 * Seven of the venues whose served excerpts trip a navigation-shaped signal are publishing from a
 * LEGITIMATE amenity list -- Golders Hill Park, Ashburton Park, Gladstone Park, London Fields,
 * Battersea Park, Stanborough Park, ASK Italian. Those lists have exactly the properties a
 * navigation heuristic would key on: no sentence terminators, Title Case, link-like brevity. A rule
 * that swept them would destroy seven true facts to remove two false ones.
 *
 * Splitting on a region boundary cannot: it only ever moves a boundary, so no text leaves the pool.
 */
describe('legitimate facility lists keep their facts', () => {
  it('reads an amenity list in main', () => {
    // Golders Hill Park's real stored wording.
    const html = page(`<main><h1>Golders Hill Park</h1><ul>
      <li>all weather table tennis tables</li><li>a bandstand</li>
      <li>a children's playground</li><li>a beautiful walled garden</li>
      <li>the stumpery</li><li>toilets</li></ul></main>`);
    expect(facts(html)).toContain('playground=yes');
  });

  it('reads a facilities list that names a car park and a playground', () => {
    // Ashburton Park's real stored wording.
    const html = page(`<main><h2>Facilities</h2><ul>
      <li>Car park (entrance in Tenterden Road)</li><li>Children's playground</li>
      <li>Bowling green and pavilion</li><li>Netball and basketball court</li></ul></main>`);
    expect(facts(html)).toContain('playground=yes');
  });

  it('reads an amenity list even when a footer follows it', () => {
    // London Fields' real shape: the list is the content, the newsletter and footer come after.
    const html = page(`<main><h2>Amenities</h2><ul>
      <li>2 children's play areas</li><li>Lido and lido caf&eacute;</li>
      <li>Toilets and accessible toilets</li><li>Wildflower meadow</li></ul></main>
      <footer><nav><a>Footer links</a><a>News</a><a>Contact</a></nav></footer>`);
    const result = facts(html);
    expect(result).toContain('playground=yes');
    expect(result).toContain('accessibleToilet=yes');
  });

  it('still reads prose that happens to sit next to a footer', () => {
    const html = page(`<main><p>Free parking is available on site for visitors.</p></main>
      <footer><nav><a>Home</a><a>Sitemap</a></nav></footer>`);
    expect(facts(html)).toContain('parking=yes');
  });
});
