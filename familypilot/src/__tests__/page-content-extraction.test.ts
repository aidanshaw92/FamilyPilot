import { describe, expect, it } from 'vitest';

import {
  extractPageContent,
  extractRelevantParagraphs,
  removeNonContentElements,
  stripCodeResidue,
  looksLikeCodeOrMarkup,
} from '../../../server/enrichment/_lib/html-text-extractor.js';
import { extractEvidenceFromText } from '../../../server/enrichment/_lib/evidence-extractor.js';

/**
 * Every residue string below was taken from FamilyPilot's own `venue_source_evidence` on 2026-10-01.
 * Of 688 fetched rows, 54 carried CSS, 80 carried JSON-LD or escaped JSON and 103 carried inline
 * JavaScript: 197 rows, 28.6%, contaminated, and 78 sat at the full 8000-character cap with real prose
 * crowded out behind the junk.
 */

const meta = {
  url: 'https://venue.example/visit',
  sourceType: 'official_website',
  retrievedAt: '2026-10-01T09:00:00.000Z',
};

describe('removeNonContentElements', () => {
  it('removes a stylesheet nested inside main, which stripTags used to keep', () => {
    // The root cause. extractRegion strips tags but keeps element TEXT, so a <style> inside <main>
    // contributed its whole stylesheet. Belmont Children's Farm's stored text begins with Squarespace
    // CSS and runs to the cap.
    const html =
      '<main><style>.fe-65b4 { --grid-gutter: calc(var(--sqs-gutter, 6vw) - 0.0px); display: grid }</style>' +
      '<p>Baby changing is available in the courtyard toilets.</p></main>';
    const out = removeNonContentElements(html);
    expect(out).not.toMatch(/grid-gutter|sqs-gutter|display: grid/);
    expect(out).toMatch(/Baby changing is available/);
  });

  it('removes a JSON-LD script block nested inside main', () => {
    const html =
      '<main><script type="application/ld+json">{"@context":"https://schema.org","@type":"Restaurant"}</script>' +
      '<p>Accessible toilets are next to the cafe.</p></main>';
    const out = removeNonContentElements(html);
    expect(out).not.toMatch(/@context|schema\.org/);
    expect(out).toMatch(/Accessible toilets/);
  });

  it('consumes an unclosed style to end of input, as a truncated page delivers it', () => {
    // fetch_status = fetched_truncated is a real state, and a cut-off page ends mid-stylesheet. Per
    // the HTML parsing spec everything after an unclosed <style> is that element's text anyway.
    const html = '<main><p>Toilets are near the cafe.</p><style>.z{color:red;';
    const out = removeNonContentElements(html);
    expect(out).toMatch(/Toilets are near the cafe/);
    expect(out).not.toMatch(/color:red/);
  });

  it('does NOT let an unclosed svg swallow the rest of the document', () => {
    // svg is not a raw-text element, so the to-end-of-input rule must not apply to it: an unclosed
    // <svg> would otherwise discard every paragraph after an inline icon.
    const html = '<main><svg viewBox="0 0"><path d="M0"/><p>Baby changing is in the main toilets.</p></main>';
    expect(removeNonContentElements(html)).toMatch(/Baby changing is in the main toilets/);
  });
});

describe('extractPageContent', () => {
  const belmontShaped =
    '<html><head><title>Indoor &amp; Outdoor Visitors Farm</title></head><body>' +
    '<nav>Home Visit Contact</nav><main>' +
    '<style>.sqs{--stroke-style:solid;color:#fff}</style>' +
    '<script type="application/ld+json">{"@context":"https://schema.org"}</script>' +
    '<p>Baby changing facilities are available in the ladies public toilet within the courtyard.</p>' +
    '</main><aside><p>Accessible toilets are next to the farm shop.</p></aside>' +
    '<footer><p>Free parking is available for all visitors at the farm entrance.</p></footer></body></html>';

  it('keeps the prose and drops the markup', () => {
    const { text } = extractPageContent(belmontShaped);
    expect(text).not.toMatch(/stroke-style|@context|color:#fff/);
    expect(text).toMatch(/Baby changing facilities are available/);
  });

  it('keeps aside and footer content, which carry parking and toilet facts', () => {
    const { text } = extractPageContent(belmontShaped);
    expect(text).toMatch(/Accessible toilets are next to the farm shop/);
    expect(text).toMatch(/Free parking is available for all visitors/);
  });

  it('stops emitting every region twice', () => {
    // main, article, footer and a whole-body fallback were concatenated, so anything inside main was
    // paid for twice out of the 8000-character budget. The fallback now covers only what the named
    // regions did not, so the union of text is the same and the repetition is gone.
    const { text } = extractPageContent(belmontShaped);
    expect(text.match(/Baby changing facilities are available/g)).toHaveLength(1);
  });

  it('reads the title from the original html, not the cleaned copy', () => {
    // <title> sits in <head> beside the elements being removed, and Flip Out Brent Cross's
    // environment=indoor comes from its title alone, so losing the title loses a real fact.
    //
    // The style here is deliberately UNCLOSED and sits before the title, which is the only shape that
    // exercises this: with a closed <style> the title survives either way, so the first version of
    // this test passed against a mutant that read the title from the cleaned copy.
    const html =
      '<html><head><style>.a{color:red;<title>Ultimate Indoor Trampoline Park</title></head>' +
      '<body><main><p>Open daily all year.</p></main></body></html>';
    expect(extractPageContent(html).title).toBe('Ultimate Indoor Trampoline Park');
  });

  it('removes repetition a site prints more than once', () => {
    // Separate from the region partition: pages repeat their own breadcrumbs and card titles. Across
    // the stored corpus this still removes 3,449 duplicate chunks from 490 of 670 rows.
    const html =
      '<html><head><title>Park</title></head><body><main>' +
      '<p>Accessible toilets are by the main gate.</p>' +
      '<p>Accessible toilets are by the main gate.</p>' +
      '<p>Accessible toilets are by the main gate.</p>' +
      '</main></body></html>';
    expect(extractPageContent(html).text.match(/Accessible toilets are by the main gate/g)).toHaveLength(1);
  });

  it('still yields the venue fact end to end', () => {
    const { text } = extractPageContent(belmontShaped);
    const facts = extractEvidenceFromText(text, meta);
    expect(facts.find((f: { field: string }) => f.field === 'babyChanging')?.value).toBe('yes');
  });
});

describe('stripCodeResidue: residue out, prose kept', () => {
  it('removes an inline SVG stylesheet glued to a nav list (Horniman)', () => {
    expect(stripCodeResidue('.cls-1{fill:#fff;} Asset 1 Toggle navigation Search Plan Your Visit')).toBe(
      'Asset 1 Toggle navigation Search Plan Your Visit',
    );
  });

  it('keeps the Access statement a stylesheet was glued to (Sydenham Hill Wood)', () => {
    // Rejecting this whole chunk is what flipped a wheelchair claim: the chunk carrying the venue's
    // own Access statement vanished, and a sentence about the nearby railway station won instead.
    const chunk =
      'Know before you go .st0{fill-rule:evenodd;clip-rule:evenodd;fill:#777} Size 11 hectares Access There are four entrances';
    expect(stripCodeResidue(chunk)).toBe('Know before you go Size 11 hectares Access There are four entrances');
  });

  it('removes a leaked raw tag but keeps the heading (Chiltern Open Air Museum)', () => {
    const chunk = 'Plan your visit Chiltern Open Air Museum <section data-test="page-section" class="page-section">';
    expect(stripCodeResidue(chunk)).toBe('Plan your visit Chiltern Open Air Museum');
  });

  it('removes a JS call expression that PRECEDES the prose (UNCODE theme)', () => {
    // The assumption that scripts trail content is false for this theme, and cutting from the marker
    // to the end of the chunk discarded the sentence that followed it.
    const chunk =
      'UNCODE.initRow(document.getElementById("row-unique-4")); From an annual dog show to family-friendly Open Days';
    expect(stripCodeResidue(chunk)).toBe('From an annual dog show to family-friendly Open Days');
  });

  it('removes truncated trailing JS and keeps the prose before it (Gladstone Park)', () => {
    const chunk = "Report a problem in this park window ('DOMContentLoaded', (e) => { const map = L ('map', { scrol";
    expect(stripCodeResidue(chunk)).toBe('Report a problem in this park');
  });

  it('removes bare selector residue left after braces are gone (Swanley Park)', () => {
    const cleaned = stripCodeResidue('Parking Charges at Swanley Park :where( > ) [data-kb-block="kb-adv-1921"] mark');
    expect(cleaned).toMatch(/Parking Charges at Swanley Park/);
    expect(cleaned).not.toMatch(/:where|data-kb-block/);
  });
});

describe('stripCodeResidue: real prose is never treated as code', () => {
  // An earlier version rejected chunks by punctuation density and threw all of these away. Travel
  // directions and numbered lists are full of brackets; a punctuation count cannot prove code.
  const mustSurviveIntact = [
    'From Waterloo Station (5-minute walk): Exit the station via Exit 6 (York Road) or follow signs for Leake Street.',
    'Visit our passholder pre-book page to book your visit(s) here.',
    '2) Accessibility Regulations 2018 (the accessibility regulations).',
    'Open Mon.-Fri. (10am to 5pm) and closed on Christmas Day.',
    'Parking charges: £1.50 per hour and free parking for Blue Badge holders.',
    'Open 9:00-17:00 (last entry 16:30). Baby changing: in the main toilets.',
    'Facilities include: play area, cafe, outdoor gym and a nature reserve.',
    'Baby changing is available, e.g. (see the map) near the main toilets.',
  ];

  for (const sentence of mustSurviveIntact) {
    it(`leaves untouched: ${sentence.slice(0, 52)}…`, () => {
      expect(stripCodeResidue(sentence)).toBe(sentence);
      expect(looksLikeCodeOrMarkup(sentence)).toBe(false);
    });
  }
});

describe('extractRelevantParagraphs', () => {
  it('drops a JSON-LD payload rather than reading its string values as prose', () => {
    // Nando's publishes environment=outdoor from "name":"Outdoor seating" inside schema.org data: a
    // restaurant with a patio, classified as an outdoor venue.
    const text =
      'Opening times are 11am to 10pm every day. ' +
      '{"@context":"https://schema.org","@type":"Restaurant","amenityFeature":[{"@type":"LocationFeatureSpecification","name":"Outdoor seating","value":true}]}';
    const out = extractRelevantParagraphs(text);
    expect(out).not.toMatch(/LocationFeatureSpecification|Outdoor seating/);
  });

  it('does not let a JSON-LD amenity produce an environment fact', () => {
    const text =
      'Accessible toilets are available on the ground floor. ' +
      '{"@type":"LocationFeatureSpecification","name":"Outdoor seating","value":true}';
    const facts = extractEvidenceFromText(extractRelevantParagraphs(text), meta);
    expect(facts.find((f: { field: string }) => f.field === 'environment')).toBeUndefined();
    expect(facts.find((f: { field: string }) => f.field === 'accessibleToilet')?.value).toBe('yes');
  });

  it('drops escaped-HTML JSON payloads', () => {
    const text = 'We aim to accommodate a range of access needs.\\u003c/p\\u003e\\r\\n\\u003cp\\u003eSo, all you need';
    expect(extractRelevantParagraphs(text)).not.toMatch(/\\u003c/);
  });

  it('keeps the prose when escaped unicode is glued to it, rather than dropping the chunk', () => {
    // Without the escaped-unicode strip the whole chunk is rejected and this sentence is lost. The
    // chunk is real site copy with a hydration payload welded on.
    const chunk =
      'We also aim to accommodate a range of access needs, giving you peace of mind.' +
      '\\u003c/p\\u003e\\u003cp\\u003eSo, all you need is to book.';
    const cleaned = stripCodeResidue(chunk);
    expect(cleaned).toMatch(/accommodate a range of access needs/);
    expect(cleaned).not.toMatch(/\\u003c/);
    expect(looksLikeCodeOrMarkup(cleaned)).toBe(false);
  });

  it('strips an UNBALANCED JSON fragment, which is how the payload actually arrives', () => {
    // Nando's stored excerpt is a mid-object slice with no opening brace, so the balanced-object rule
    // cannot touch it; only the quoted-key rule can. This is the exact text behind its live
    // environment=outdoor claim.
    const fragment =
      ':"LocationFeatureSpecification","name":"Outdoor seating","value":true},{"@type":"LocationFeatureSpecification"';
    const cleaned = stripCodeResidue(fragment);
    expect(cleaned).not.toMatch(/Outdoor seating/);
    const facts = extractEvidenceFromText(extractRelevantParagraphs(fragment), meta);
    expect(facts.find((f: { field: string }) => f.field === 'environment')).toBeUndefined();
  });

  it('keeps a plain page unchanged apart from whitespace', () => {
    const text =
      'Baby changing facilities are available in the main toilets. Free parking is available on site. Our cafe is open daily.';
    const out = extractRelevantParagraphs(text);
    for (const fragment of ['Baby changing facilities', 'Free parking is available on site', 'cafe is open daily']) {
      expect(out).toMatch(new RegExp(fragment));
    }
  });
});
