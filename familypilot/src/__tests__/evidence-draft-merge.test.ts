/**
 * Regression tests: evidence → draft merge, truncated fetch, candidate priority.
 */

import { describe, expect, it, vi } from 'vitest';

import { buildEvidenceBundle, extractEvidenceFromText } from '../../../api/enrichment/_lib/evidence-extractor.js';
import {
  mergeEvidenceIntoDraft,
  buildDraftFromEvidence,
  isAuthoritativeFact,
} from '../../../api/enrichment/_lib/evidence-draft-merge.js';
import { normaliseDraftJson } from '../../../api/enrichment/_lib/ai-draft-schema.js';
import { mergePageCandidates } from '../../../api/enrichment/_lib/source-discovery.js';
import { readBoundedHtml } from '../../../api/enrichment/_lib/source-fetcher.js';

const WARNER_BUNDLE = buildEvidenceBundle(
  'fp-google-warner',
  [
    {
      url: 'https://www.wbstudiotour.co.uk/visitor-information/',
      sourceType: 'visitor_info',
      fetchStatus: 'ok',
      facts: [
        {
          field: 'babyChanging',
          value: 'yes',
          confidence: 'high',
          evidenceText: 'Baby changing facilities are available in the visitor centre toilets.',
          sourceUrl: 'https://www.wbstudiotour.co.uk/visitor-information/',
          sourceType: 'visitor_info',
          retrievedAt: '2026-08-08T12:00:00.000Z',
        },
      ],
    },
    {
      url: 'https://www.wbstudiotour.co.uk/additional-needs/',
      sourceType: 'accessibility_page',
      fetchStatus: 'ok',
      facts: [
        {
          field: 'toilets',
          value: 'yes',
          confidence: 'high',
          evidenceText: 'Accessible toilets are available throughout the tour.',
          sourceUrl: 'https://www.wbstudiotour.co.uk/additional-needs/',
          sourceType: 'accessibility_page',
          retrievedAt: '2026-08-08T12:00:00.000Z',
        },
        {
          field: 'accessibleToilet',
          value: 'yes',
          confidence: 'high',
          evidenceText: 'Accessible toilets are available throughout the tour.',
          sourceUrl: 'https://www.wbstudiotour.co.uk/additional-needs/',
          sourceType: 'accessibility_page',
          retrievedAt: '2026-08-08T12:00:00.000Z',
        },
      ],
    },
  ],
  'official_website',
);

describe('Warner Bros evidence-loss regression', () => {
  it('buildDraftFromEvidence pre-fills babyChanging and toilets from extracted facts', () => {
    const draft = buildDraftFromEvidence(WARNER_BUNDLE);
    expect(draft.familyFacilities.babyChanging.value).toBe('yes');
    expect(draft.familyFacilities.babyChanging.sourceUrl).toContain('visitor-information');
    expect(draft.familyFacilities.toilets.value).toBe('yes');
    expect(draft.familyFacilities.toilets.evidence).toContain('Accessible toilets');
    expect((draft.accessibility as Record<string, { value: string }>).accessibleToilet.value).toBe('yes');
  });

  it('mergeEvidenceIntoDraft restores fields when AI returns all unknown (Warner live bug)', () => {
    const aiUnknownDraft = normaliseDraftJson({
      familyFacilities: {
        toilets: { value: 'unknown', confidence: 'unknown' },
        babyChanging: { value: 'unknown', confidence: 'unknown' },
        parking: { value: 'unknown', confidence: 'unknown' },
        cafe: { value: 'unknown', confidence: 'unknown' },
      },
      pushchairSuitability: { value: 'unknown', confidence: 'unknown' },
      terrain: { value: 'unknown', confidence: 'unknown' },
      overallDraftConfidence: 'unknown',
    });

    const merged = mergeEvidenceIntoDraft(aiUnknownDraft, WARNER_BUNDLE);
    expect(merged.familyFacilities.babyChanging.value).toBe('yes');
    expect(merged.familyFacilities.babyChanging.confidence).toBe('high');
    expect(merged.familyFacilities.babyChanging.sourceUrl).toContain('visitor-information');
    expect(merged.familyFacilities.toilets.value).toBe('yes');
    expect(merged.familyFacilities.parking.value).toBe('unknown');
    expect(merged.overallDraftConfidence).not.toBe('unknown');
  });

  it('AI cannot override explicit official evidence with contradictory unsupported value', () => {
    const aiContradicts = normaliseDraftJson({
      familyFacilities: {
        toilets: { value: 'no', confidence: 'medium', reason: 'AI guess' },
        babyChanging: { value: 'no', confidence: 'low', reason: 'AI guess' },
      },
      overallDraftConfidence: 'low',
    });
    const merged = mergeEvidenceIntoDraft(aiContradicts, WARNER_BUNDLE);
    expect(merged.familyFacilities.toilets.value).toBe('yes');
    expect(merged.familyFacilities.babyChanging.value).toBe('yes');
    expect((merged.familyFacilities.toilets as { evidenceBacked?: boolean }).evidenceBacked).toBe(true);
  });

  it('full generateDraft path preserves evidence when mock AI would have unknown fields', async () => {
    const { generateMockDraft, mergeEvidenceIntoDraft: mergeFn } = await import(
      '../../../api/enrichment/_lib/ai-provider.js'
    );
    const aiDraft = normaliseDraftJson({
      familyFacilities: {
        toilets: { value: 'unknown', confidence: 'unknown' },
        babyChanging: { value: 'unknown', confidence: 'unknown' },
        parking: { value: 'unknown', confidence: 'unknown' },
        cafe: { value: 'unknown', confidence: 'unknown' },
      },
      pushchairSuitability: { value: 'unknown', confidence: 'unknown' },
      terrain: { value: 'unknown', confidence: 'unknown' },
      overallDraftConfidence: 'unknown',
    });
    const merged = mergeFn(aiDraft, WARNER_BUNDLE);
    expect(merged.familyFacilities.babyChanging.value).toBe('yes');

    const mockResult = generateMockDraft({
      name: 'Warner Bros. Studio Tour',
      category: 'attraction',
      evidenceBundle: WARNER_BUNDLE,
    });
    expect(mockResult.draftJson.familyFacilities.babyChanging.value).toBe('yes');
    expect(mockResult.draftJson.familyFacilities.toilets.value).toBe('yes');
  });

  it('unsupported fields remain unknown without evidence', () => {
    const merged = mergeEvidenceIntoDraft(buildDraftFromEvidence(WARNER_BUNDLE), WARNER_BUNDLE);
    expect(merged.familyFacilities.parking.value).toBe('unknown');
    expect(merged.pushchairSuitability.value).toBe('unknown');
  });
});

describe('bounded truncated HTML fetch', () => {
  it('readBoundedHtml truncates without downloading entire body', async () => {
    const body = `<html><body>${'x'.repeat(600 * 1024)} toilets available baby changing</body></html>`;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const chunkSize = 64 * 1024;
        for (let i = 0; i < body.length; i += chunkSize) {
          controller.enqueue(encoder.encode(body.slice(i, i + chunkSize)));
        }
        controller.close();
      },
    });

    const response = new Response(stream, {
      headers: { 'content-type': 'text/html', 'content-length': String(body.length) },
    });

    const result = await readBoundedHtml(response, 512 * 1024);
    expect(result.truncated).toBe(true);
    expect(result.bytes).toBeLessThanOrEqual(512 * 1024);
    expect(result.html.length).toBeGreaterThan(0);
  });

  it('extracts evidence from truncated official HTML snippet', () => {
    const snippet =
      '<main><p>Public toilets and baby changing facilities are available in the visitor centre.</p></main>';
    const facts = extractEvidenceFromText(snippet, {
      url: 'https://example.org/',
      sourceType: 'official_website',
      retrievedAt: '2026-08-08T12:00:00.000Z',
    });
    expect(facts.some((f) => f.field === 'toilets' && f.value === 'yes')).toBe(true);
    expect(facts.some((f) => f.field === 'babyChanging' && f.value === 'yes')).toBe(true);
  });
});

describe('candidate quality — discovered links vs common paths', () => {
  it('genuine discovered links outrank speculative common-path guesses', () => {
    const html = `
      <html><body>
        <a href="/visitor-information/">Visitor Information</a>
        <a href="/additional-needs/">Additional needs</a>
      </body></html>
    `;
    const { diagnostics } = mergePageCandidates('https://www.wbstudiotour.co.uk/', [], html, 5);
    const nonHome = diagnostics.linksSelected.filter((l) => l.reason !== 'homepage');
    expect(nonHome.length).toBeGreaterThan(0);
    expect(nonHome[0].speculative).toBe(false);
    expect(nonHome[0].score).toBeGreaterThan(150);
    const speculativeOnly = nonHome.filter((l) => l.speculative);
    for (const spec of speculativeOnly) {
      expect(spec.score).toBeLessThan(nonHome[0].score);
    }
  });

  it('returns reserve candidates for backfill when initial selection includes speculative 404s', () => {
    const html = `<a href="/plan-your-visit/">Plan your visit</a>`;
    const { reserveCandidates, diagnostics } = mergePageCandidates(
      'https://example-zoo.org/',
      [{ url: 'https://example-zoo.org/', sourceType: 'official_website' }],
      html,
      3,
    );
    expect(diagnostics.linksSelected.some((l) => l.speculative === false)).toBe(true);
    expect(reserveCandidates.length).toBeGreaterThan(0);
  });

  it('does not treat venue type as evidence', () => {
    expect(isAuthoritativeFact({ field: 'toilets', value: 'yes', confidence: 'low' })).toBe(false);
    expect(isAuthoritativeFact({ field: 'toilets', value: 'yes', confidence: 'high' })).toBe(true);
  });
});

describe('parking false-positive guard', () => {
  it('does not produce parking=yes from generic parking information text', () => {
    const meta = {
      url: 'https://example.org/visit',
      sourceType: 'visitor_info',
      retrievedAt: '2026-08-08T12:00:00.000Z',
    };
    const falsePositives = [
      'For parking information please see our help page.',
      'Parking charges apply in the nearby car park.',
      'We hope this parking advice helps you plan your visit.',
      'Pay and display parking is available on surrounding streets only.',
    ];
    for (const text of falsePositives) {
      const facts = extractEvidenceFromText(text, meta);
      expect(facts.some((f) => f.field === 'parking')).toBe(false);
    }
  });

  it('produces parking=yes only when availability is explicit', () => {
    const meta = {
      url: 'https://example.org/visit',
      sourceType: 'visitor_info',
      retrievedAt: '2026-08-08T12:00:00.000Z',
    };
    const explicit = [
      'Free parking is available on site for visitors.',
      'Cars and minibuses are welcome to use our large free car park.',
      'On-site parking is provided for ticket holders.',
    ];
    for (const text of explicit) {
      const facts = extractEvidenceFromText(text, meta);
      expect(facts.find((f) => f.field === 'parking')?.value).toBe('yes');
    }
  });

  it('deterministic merge does not invent parking without explicit evidence', () => {
    const meta = {
      url: 'https://example.org/',
      sourceType: 'official_website',
      retrievedAt: '2026-08-08T12:00:00.000Z',
    };
    const bundle = buildEvidenceBundle(
      'fp-test',
      [{
        url: 'https://example.org/',
        sourceType: 'official_website',
        fetchStatus: 'ok',
        facts: extractEvidenceFromText('Baby changing facilities are available.', meta),
      }],
      'official_website',
    );
    const draft = buildDraftFromEvidence(bundle);
    expect(draft.familyFacilities.babyChanging.value).toBe('yes');
    expect(draft.familyFacilities.parking.value).toBe('unknown');
  });
});

describe('utility link and generic keyword rejection', () => {
  it('rejects accessibility toolbar and generic help links', async () => {
    const { findRelevantLinks, isUtilityLink } = await import(
      '../../../api/enrichment/_lib/html-text-extractor.js'
    );

    expect(isUtilityLink('https://example.org/recite-me/', 'Accessibility tools')).toBe(true);
    expect(isUtilityLink('https://example.org/help/', 'Help')).toBe(true);
    expect(isUtilityLink('https://example.org/visitor-help/', 'Help')).toBe(false);

    const html = `
      <html><body>
        <nav>
          <a href="/recite-me/">Recite Me</a>
          <a href="/help/">Help</a>
          <a href="/cookie-policy/">Cookie settings</a>
        </nav>
        <a href="/visitor-information/">Visitor information</a>
        <a href="/additional-needs/">Additional needs</a>
        <a href="/plan-your-visit/">Plan your visit</a>
      </body></html>
    `;
    const links = findRelevantLinks(html, 'https://example.org/', 10);
    const urls = links.map((l) => l.url);
    expect(urls.some((u) => u.includes('recite-me'))).toBe(false);
    expect(urls.some((u) => u.endsWith('/help/') || u.endsWith('/help'))).toBe(false);
    expect(urls.some((u) => u.includes('visitor-information'))).toBe(true);
    expect(urls.some((u) => u.includes('plan-your-visit'))).toBe(true);
  });

  it('does not select unrelated pages because anchor text contains generic "help"', () => {
    const html = `
      <a href="/careers/">We help families find jobs</a>
      <a href="/visitor-information/">Visitor information</a>
    `;
    const { diagnostics } = mergePageCandidates('https://example.org/', [], html, 3);
    const selectedUrls = diagnostics.linksSelected.map((l) => l.url);
    expect(selectedUrls.some((u) => u.includes('careers'))).toBe(false);
    expect(selectedUrls.some((u) => u.includes('visitor-information'))).toBe(true);
  });
});

describe('contradiction and false-positive regressions', () => {
  it('merge preserves toilets=yes and clears AI parking=yes without extracted evidence', () => {
    const bundle = buildEvidenceBundle(
      'fp-test',
      [{
        url: 'https://example.org/access',
        sourceType: 'accessibility_page',
        fetchStatus: 'ok',
        facts: [{
          field: 'toilets',
          value: 'yes',
          confidence: 'high',
          evidenceText: 'Accessible toilets are available throughout the venue.',
          sourceUrl: 'https://example.org/access',
          sourceType: 'accessibility_page',
          retrievedAt: '2026-08-08T12:00:00.000Z',
        }],
      }],
      'official_website',
    );
    const aiDraft = normaliseDraftJson({
      familyFacilities: {
        toilets: { value: 'unknown', confidence: 'unknown' },
        babyChanging: { value: 'unknown', confidence: 'unknown' },
        parking: { value: 'yes', confidence: 'medium', reason: 'AI inferred parking' },
        cafe: { value: 'unknown', confidence: 'unknown' },
      },
      overallDraftConfidence: 'medium',
    });
    const merged = mergeEvidenceIntoDraft(aiDraft, bundle);
    expect(merged.familyFacilities.toilets.value).toBe('yes');
    expect(merged.familyFacilities.parking.value).toBe('unknown');
    expect(merged.familyFacilities.parking.confidence).toBe('unknown');
  });

  it('AI parking=yes without evidence is cleared to unknown', () => {
    const bundle = buildEvidenceBundle('fp-test', [], 'official_website');
    const aiDraft = normaliseDraftJson({
      familyFacilities: {
        parking: { value: 'yes', confidence: 'medium', reason: 'Large attraction likely has parking' },
      },
      overallDraftConfidence: 'low',
    });
    const merged = mergeEvidenceIntoDraft(aiDraft, bundle);
    expect(merged.familyFacilities.parking.value).toBe('unknown');
    expect(merged.familyFacilities.parking.confidence).toBe('unknown');
  });

  it('AI cannot override explicit parking evidence with contradictory unsupported value', () => {
    const bundle = buildEvidenceBundle(
      'fp-test',
      [{
        url: 'https://example.org/visit',
        sourceType: 'visitor_info',
        fetchStatus: 'ok',
        facts: [{
          field: 'parking',
          value: 'yes',
          confidence: 'high',
          evidenceText: 'Free parking is available on site for visitors.',
          sourceUrl: 'https://example.org/visit',
          sourceType: 'visitor_info',
          retrievedAt: '2026-08-08T12:00:00.000Z',
        }],
      }],
      'official_website',
    );
    const aiDraft = normaliseDraftJson({
      familyFacilities: {
        parking: { value: 'no', confidence: 'low', reason: 'AI guess' },
      },
    });
    const merged = mergeEvidenceIntoDraft(aiDraft, bundle);
    expect(merged.familyFacilities.parking.value).toBe('yes');
    expect((merged.familyFacilities.parking as { evidenceBacked?: boolean }).evidenceBacked).toBe(true);
  });
});

const CHILTERN_SOURCE = {
  url: 'https://www.coam.org.uk/your-visit/accessibility/',
  sourceType: 'accessibility_page',
  retrievedAt: '2026-08-08T12:00:00.000Z',
};

const CHILTERN_TEXT =
  'Buggies are welcome on site… ramps into most buildings… some buildings will not accommodate a pram… paths are gravel and can get muddy.';

describe('pushchair suitability evidence', () => {
  it('classifies Chiltern Open Air Museum official wording as good with high confidence', () => {
    const facts = extractEvidenceFromText(CHILTERN_TEXT, CHILTERN_SOURCE);
    const pushchair = facts.find((f) => f.field === 'pushchairSuitability');
    expect(pushchair?.value).toBe('good');
    expect(pushchair?.confidence).toBe('high');
    expect(pushchair?.evidenceText).toContain('Buggies are welcome');
    expect(pushchair?.sourceUrl).toBe(CHILTERN_SOURCE.url);
  });

  it('merges Chiltern pushchair evidence into draft with official source attached', () => {
    const facts = extractEvidenceFromText(CHILTERN_TEXT, CHILTERN_SOURCE);
    const bundle = buildEvidenceBundle('fp-google-chiltern', [{
      ...CHILTERN_SOURCE,
      fetchStatus: 'ok',
      facts,
    }], 'official_website');

    const draft = buildDraftFromEvidence(bundle);
    expect(draft.pushchairSuitability.value).toBe('good');
    expect(draft.pushchairSuitability.confidence).toBe('high');
    expect(draft.pushchairSuitability.sourceUrl).toBe(CHILTERN_SOURCE.url);
    expect(draft.pushchairSuitability.evidence).toContain('gravel');
    expect((draft.pushchairSuitability as { evidenceBacked?: boolean }).evidenceBacked).toBe(true);
  });

  it('classifies excellent when welcome with smooth step-free routes and no caveats', () => {
    const text =
      'Pushchairs are welcome throughout the site. All routes are step-free with smooth paved paths.';
    const facts = extractEvidenceFromText(text, CHILTERN_SOURCE);
    expect(facts.find((f) => f.field === 'pushchairSuitability')?.value).toBe('excellent');
  });

  it('classifies mixed when significant access limitations are stated', () => {
    const text =
      'Buggies are welcome but many areas have limited access due to steep steps and very uneven paths.';
    const facts = extractEvidenceFromText(text, CHILTERN_SOURCE);
    expect(facts.find((f) => f.field === 'pushchairSuitability')?.value).toBe('mixed');
  });

  it('classifies difficult when pushchairs are explicitly discouraged', () => {
    const text = 'Pushchairs are not suitable for this trail. We strongly advise against bringing buggies.';
    const facts = extractEvidenceFromText(text, CHILTERN_SOURCE);
    expect(facts.find((f) => f.field === 'pushchairSuitability')?.value).toBe('difficult');
  });

  it('does not infer pushchair suitability from venue type alone', () => {
    const facts = extractEvidenceFromText(
      'Chiltern Open Air Museum is an open air heritage museum with historic buildings and woodland walks.',
      CHILTERN_SOURCE,
    );
    expect(facts.find((f) => f.field === 'pushchairSuitability')).toBeUndefined();
  });

  it('returns unknown when no mobility wording is present', () => {
    const facts = extractEvidenceFromText('Paths can be gravel and muddy after rain.', CHILTERN_SOURCE);
    expect(facts.find((f) => f.field === 'pushchairSuitability')).toBeUndefined();
  });

  it('strips CSS/HTML fragments from evidence snippets', () => {
    const text =
      '.visitor-info { font-size: 14px; color: rgb(0,0,0); } Buggies are welcome on site with gravel paths that can get muddy.';
    const facts = extractEvidenceFromText(text, CHILTERN_SOURCE);
    const pushchair = facts.find((f) => f.field === 'pushchairSuitability');
    expect(pushchair?.evidenceText).not.toMatch(/font-size|rgb\(|\.visitor-info/);
    expect(pushchair?.evidenceText).toContain('Buggies are welcome');
  });

  it('isAuthoritativeFact accepts pushchair suitability values', () => {
    expect(isAuthoritativeFact({
      field: 'pushchairSuitability',
      value: 'good',
      confidence: 'high',
    })).toBe(true);
    expect(isAuthoritativeFact({
      field: 'pushchairSuitability',
      value: 'unknown',
      confidence: 'high',
    })).toBe(false);
  });

  it('AI pushchair guess without evidence is cleared when no extracted fact exists', () => {
    const aiDraft = normaliseDraftJson({
      pushchairSuitability: { value: 'excellent', confidence: 'low', reason: 'AI guess' },
    });
    const merged = mergeEvidenceIntoDraft(aiDraft, buildEvidenceBundle('fp-test', [], 'no_official_source'));
    expect(merged.pushchairSuitability.value).toBe('unknown');
  });
});
