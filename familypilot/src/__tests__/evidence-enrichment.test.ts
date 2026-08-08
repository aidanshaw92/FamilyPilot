import { describe, expect, it, vi } from 'vitest';

import {
  extractEvidenceFromText,
  buildEvidenceBundle,
} from '../../../api/enrichment/_lib/evidence-extractor.js';
import { discoverSourceUrls } from '../../../api/enrichment/_lib/source-discovery.js';
import { isPrivateIp, validateUrlString } from '../../../api/enrichment/_lib/source-fetch-security.js';
import { isCacheFresh } from '../../../api/enrichment/_lib/evidence-store.js';

describe('source fetch security (SSRF)', () => {
  it('blocks localhost and private IP literals', () => {
    expect(() => validateUrlString('http://localhost/page')).toThrow('Blocked hostname');
    expect(() => validateUrlString('http://127.0.0.1/page')).toThrow('Blocked private IP');
    expect(() => validateUrlString('http://192.168.1.1/page')).toThrow('Blocked private IP');
    expect(() => validateUrlString('http://10.0.0.1/page')).toThrow('Blocked private IP');
    expect(() => validateUrlString('http://169.254.169.254/latest/meta-data')).toThrow('Blocked private IP');
  });

  it('blocks non-http(s) protocols', () => {
    expect(() => validateUrlString('file:///etc/passwd')).toThrow('Only http(s) URLs allowed');
  });

  it('identifies private IPv6 addresses', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
  });

  it('allows public hostnames', () => {
    const parsed = validateUrlString('https://www.example.org/visit');
    expect(parsed.hostname).toBe('www.example.org');
  });
});

describe('official source discovery', () => {
  it('returns no_official_source when website missing', () => {
    const result = discoverSourceUrls({ website: null, googleDescription: null });
    expect(result.sourceStatus).toBe('no_official_source');
    expect(result.pages).toHaveLength(0);
  });

  it('prefers provider website over guessing', () => {
    const result = discoverSourceUrls({ website: 'https://headstonemanor.org/', googleDescription: null });
    expect(result.sourceStatus).toBe('official_website');
    expect(result.pages[0].url).toBe('https://headstonemanor.org/');
    expect(result.pages[0].sourceType).toBe('official_website');
  });

  it('normalises bare domains', () => {
    const result = discoverSourceUrls({ website: 'headstonemanor.org', googleDescription: null });
    expect(result.pages[0].url).toBe('https://headstonemanor.org/');
  });
});

describe('evidence extraction', () => {
  it('extracts explicit yes evidence for toilets', () => {
    const text =
      'Visitor information. Toilet facilities are available in the main visitor centre. Opening hours vary.';
    const facts = extractEvidenceFromText(text, {
      url: 'https://example.org/visit',
      sourceType: 'visitor_info',
      retrievedAt: '2026-08-07T12:00:00.000Z',
    });
    const toilets = facts.find((f) => f.field === 'toilets');
    expect(toilets?.value).toBe('yes');
    expect(toilets?.confidence).toBe('high');
    expect(toilets?.sourceUrl).toBe('https://example.org/visit');
    expect(toilets?.evidenceText).toContain('Toilet');
  });

  it('extracts baby changing evidence', () => {
    const text = 'Baby changing facilities are available in the main visitor centre.';
    const facts = extractEvidenceFromText(text, {
      url: 'https://example.org/visit',
      sourceType: 'official_website',
      retrievedAt: '2026-08-07T12:00:00.000Z',
    });
    expect(facts.some((f) => f.field === 'babyChanging' && f.value === 'yes')).toBe(true);
  });

  it('returns empty facts when no relevant evidence', () => {
    const facts = extractEvidenceFromText('A lovely museum in Hertfordshire with gardens.', {
      url: 'https://example.org/',
      sourceType: 'official_website',
      retrievedAt: '2026-08-07T12:00:00.000Z',
    });
    expect(facts).toHaveLength(0);
  });

  it('builds evidence bundle with merged facts', () => {
    const bundle = buildEvidenceBundle(
      'fp-google-test',
      [
        {
          url: 'https://example.org/visit',
          sourceType: 'visitor_info',
          retrievedAt: '2026-08-07T12:00:00.000Z',
          fetchStatus: 'ok',
          facts: [
            {
              field: 'toilets',
              value: 'yes',
              confidence: 'high',
              evidenceText: 'Toilets available.',
              sourceUrl: 'https://example.org/visit',
              sourceType: 'visitor_info',
              retrievedAt: '2026-08-07T12:00:00.000Z',
            },
          ],
        },
      ],
      'official_website',
    );
    expect(bundle.facts).toHaveLength(1);
    expect(bundle.pagesChecked).toBe(1);
  });
});

describe('mock AI provider — no hallucination', () => {
  it('does not invent toilets without evidence', async () => {
    const { generateMockDraft } = await import('../../../api/enrichment/_lib/ai-provider.js');
    const result = generateMockDraft({
      familypilotPlaceId: 'fp-google-test',
      name: 'Headstone Manor and Museum',
      category: 'museum',
      evidenceBundle: buildEvidenceBundle('fp-google-test', [], 'no_official_source'),
    });
    expect(result.draftJson.familyFacilities.toilets.value).toBe('unknown');
    expect(result.draftJson.familyFacilities.babyChanging.value).toBe('unknown');
    expect(result.model).toBe('mock-enrichment-v2');
  });

  it('uses evidence when present', async () => {
    const { generateMockDraft } = await import('../../../api/enrichment/_lib/ai-provider.js');
    const bundle = buildEvidenceBundle(
      'fp-google-test',
      [
        {
          url: 'https://headstonemanor.org/visit',
          sourceType: 'visitor_info',
          retrievedAt: '2026-08-07T12:00:00.000Z',
          fetchStatus: 'ok',
          facts: extractEvidenceFromText(
            'Toilet facilities are available. Baby changing facilities are available in the visitor centre.',
            {
              url: 'https://headstonemanor.org/visit',
              sourceType: 'visitor_info',
              retrievedAt: '2026-08-07T12:00:00.000Z',
            },
          ),
        },
      ],
      'official_website',
    );
    const result = generateMockDraft({
      familypilotPlaceId: 'fp-google-test',
      name: 'Headstone Manor and Museum',
      category: 'museum',
      evidenceBundle: bundle,
    });
    expect(result.draftJson.familyFacilities.toilets.value).toBe('yes');
    expect(result.draftJson.familyFacilities.toilets.sourceUrl).toBe('https://headstonemanor.org/visit');
    expect(result.draftJson.familyFacilities.babyChanging.value).toBe('yes');
  });
});

describe('evidence cache', () => {
  it('treats recent records as fresh', () => {
    const now = new Date().toISOString();
    expect(isCacheFresh(now)).toBe(true);
  });

  it('treats old records as stale', () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    expect(isCacheFresh(old)).toBe(false);
  });
});

describe('Headstone Manor regression (mock evidence)', () => {
  it('reports evidence fields from official-style text', () => {
    const officialText = `
      Plan your visit to Headstone Manor and Museum.
      Toilet facilities are available in the visitor centre.
      Baby changing facilities are available.
      Free parking is available on site.
      Step-free access to the ground floor. Wheelchair accessible routes in the museum.
      Pushchairs are welcome in most areas.
    `;
    const facts = extractEvidenceFromText(officialText, {
      url: 'https://headstonemanor.org/plan-your-visit',
      sourceType: 'visitor_info',
      retrievedAt: '2026-08-07T12:00:00.000Z',
    });

    const fields = ['toilets', 'babyChanging', 'parking', 'wheelchairAccessible', 'pushchairSuitability'];
    const found = fields.filter((f) => facts.some((fact) => fact.field === f));
    const unknown = fields.filter((f) => !facts.some((fact) => fact.field === f));

    expect(found).toContain('toilets');
    expect(found).toContain('babyChanging');
    expect(found).toContain('parking');
    expect(found.length).toBeGreaterThanOrEqual(4);

    // Report-style assertions for regression documentation
    expect({
      officialSourcesFound: 1,
      pagesChecked: 1,
      toilets: facts.find((f) => f.field === 'toilets')?.value ?? 'unknown',
      babyChanging: facts.find((f) => f.field === 'babyChanging')?.value ?? 'unknown',
      accessibility: facts.find((f) => f.field === 'wheelchairAccessible')?.value ?? 'unknown',
      parking: facts.find((f) => f.field === 'parking')?.value ?? 'unknown',
      pushchair: facts.find((f) => f.field === 'pushchairSuitability')?.value ?? 'unknown',
      unknownFieldCount: unknown.length,
    }).toMatchObject({
      officialSourcesFound: 1,
      toilets: 'yes',
      babyChanging: 'yes',
    });
  });
});

describe('draft schema evidence fields', () => {
  it('preserves sourceUrl and evidence on normalised fields', async () => {
    const { normaliseDraftJson } = await import('../../../api/enrichment/_lib/ai-draft-schema.js');
    const draft = normaliseDraftJson({
      familyFacilities: {
        toilets: {
          value: 'yes',
          confidence: 'high',
          reason: 'Official source',
          sourceUrl: 'https://example.org/visit',
          evidence: 'Toilets are available.',
          sourceType: 'visitor_info',
          retrievedAt: '2026-08-07T12:00:00.000Z',
        },
      },
      pushchairSuitability: {},
      terrain: {},
      overallDraftConfidence: 'high',
    });
    expect(draft.familyFacilities.toilets.sourceUrl).toBe('https://example.org/visit');
    expect(draft.familyFacilities.toilets.evidence).toContain('Toilets');
  });
});

describe('approval provenance preserves evidence', () => {
  it('includes fieldEvidence in sourceReference', async () => {
    const { draftJsonToSavePayload } = await import('../../../api/enrichment/_lib/ai-draft-mapper.js');
    const payload = draftJsonToSavePayload(
      {
        recommendedAge: { min: null, max: null, notes: null, confidence: 'unknown' },
        familyFacilities: {
          toilets: {
            value: 'yes',
            confidence: 'high',
            reason: 'Official',
            sourceUrl: 'https://example.org/visit',
            evidence: 'Toilets available.',
            sourceType: 'visitor_info',
            retrievedAt: '2026-08-07T12:00:00.000Z',
          },
          babyChanging: { value: 'unknown', confidence: 'unknown', reason: null, sourceUrl: null, evidence: null },
          parking: { value: 'unknown', confidence: 'unknown', reason: null, sourceUrl: null, evidence: null },
          cafe: { value: 'unknown', confidence: 'unknown', reason: null, sourceUrl: null, evidence: null },
        },
        pushchairSuitability: { value: 'unknown', confidence: 'unknown', reason: null },
        terrain: { value: 'unknown', confidence: 'unknown', reason: null },
        accessibility: {},
        sendInfo: {},
        whyFamiliesLike: [],
        goodToKnow: [],
        suggestedVisitDuration: null,
        rainyDaySuitability: 'unknown',
        overallDraftConfidence: 'medium',
      },
      {
        model: 'mock-enrichment-v2',
        approvedAt: '2026-08-07T12:00:00.000Z',
        reviewedBy: 'editor@test',
        evidenceStatus: 'evidence_backed',
        sourceContext: { sourceStatus: 'official_website', sourcePagesChecked: 2 },
      },
    );
    const ref = JSON.parse(payload.enrichmentProvenance?.sourceReference ?? '{}');
    expect(ref.fieldEvidence['familyFacilities.toilets'].sourceUrl).toBe('https://example.org/visit');
    expect(ref.evidenceStatus).toBe('evidence_backed');
  });
});

describe('client batch concurrency helper', () => {
  it('processes items with limited concurrency', async () => {
    const { enrichmentApi } = await import('@/src/services/enrichment/enrichment-api-client');
    const originalGetQueue = enrichmentApi.getQueue;
    const originalGenerate = enrichmentApi.generateDraft;

    let concurrent = 0;
    let maxConcurrent = 0;

    enrichmentApi.getQueue = vi.fn().mockResolvedValue({
      items: [
        { familypilotId: 'a', name: 'Venue A' },
        { familypilotId: 'b', name: 'Venue B' },
        { familypilotId: 'c', name: 'Venue C' },
      ],
    });

    enrichmentApi.generateDraft = vi.fn().mockImplementation(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 20));
      concurrent -= 1;
      return {
        draft: { id: 'd1', evidenceStatus: 'evidence_backed' },
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        estimatedCostUsd: 0.001,
      };
    });

    const result = await enrichmentApi.generateDraftBatch({ batchSize: 3, concurrency: 2 });

    expect(result.succeeded).toBe(3);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(enrichmentApi.generateDraft).toHaveBeenCalledTimes(3);

    enrichmentApi.getQueue = originalGetQueue;
    enrichmentApi.generateDraft = originalGenerate;
  });
});
