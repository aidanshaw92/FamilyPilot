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
