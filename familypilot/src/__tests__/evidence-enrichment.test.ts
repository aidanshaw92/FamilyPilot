import { describe, expect, it, vi } from 'vitest';

import {
  extractEvidenceFromText,
  buildEvidenceBundle,
} from '../../../api/enrichment/_lib/evidence-extractor.js';
import {
  discoverSourceUrls,
  mergePageCandidates,
  buildCommonPathCandidates,
} from '../../../api/enrichment/_lib/source-discovery.js';
import {
  findRelevantLinks,
  extractPageContent,
  isCloudflareChallenge,
} from '../../../api/enrichment/_lib/html-text-extractor.js';
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

  it('discovers visit page from anchor text even when URL path is opaque', () => {
    const html = `
      <html><body>
        <a href="/about-us/visit-us/">Plan your visit</a>
        <a href="/events/">Events</a>
        <a href="/learning/learning-session-faqs/">Learning Session FAQs</a>
      </body></html>
    `;
    const links = findRelevantLinks(html, 'https://headstonemanor.org/', 8);
    expect(links.some((l) => l.url.includes('visit'))).toBe(true);
    expect(links.some((l) => l.url.includes('faq'))).toBe(true);
  });

  it('selects up to 5 pages including common paths when homepage HTML is absent (cached scenario)', () => {
    const discovery = discoverSourceUrls({ website: 'https://headstonemanor.org/', googleDescription: null });
    const { pages, diagnostics } = mergePageCandidates(
      'https://headstonemanor.org/',
      discovery.pages,
      null,
      5,
    );
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.some((p) => /\/visit\b/i.test(p.url))).toBe(true);
    expect(diagnostics.linksSelected.length).toBeGreaterThan(1);
  });

  it('includes common path templates for Headstone Manor domain', () => {
    const candidates = buildCommonPathCandidates('https://headstonemanor.org/', 10);
    expect(candidates.some((c) => c.url.includes('/visit'))).toBe(true);
    expect(candidates.some((c) => c.url.includes('/accessibility'))).toBe(true);
    expect(candidates.some((c) => c.url.includes('/faq'))).toBe(true);
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

  it('extracts Headstone Manor FAQ-style toilet and parking statements', () => {
    const faqText = `
      Are there toilets?
      Museum public toilets are to be found in a block by the Visitor Centre.
      Where do we park?
      Cars and minibuses are welcome to use our large free car park.
      Baby changing facilities and accessible toilets are available to visitors.
    `;
    const facts = extractEvidenceFromText(faqText, {
      url: 'https://headstonemanor.org/learning/learning-session-faqs/',
      sourceType: 'faq_page',
      retrievedAt: '2026-08-07T12:00:00.000Z',
    });
    expect(facts.find((f) => f.field === 'toilets')?.value).toBe('yes');
    expect(facts.find((f) => f.field === 'parking')?.value).toBe('yes');
    expect(facts.find((f) => f.field === 'babyChanging')?.value).toBe('yes');
  });

  it('does not infer facilities from venue type alone', () => {
    const facts = extractEvidenceFromText('Headstone Manor and Museum is a local history museum in Harrow.', {
      url: 'https://headstonemanor.org/',
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

describe('HTML extraction and bot protection', () => {
  it('detects Cloudflare challenge pages', () => {
    const html = '<html><title>Just a moment</title><body>Enable JavaScript and cookies to continue</body></html>';
    expect(isCloudflareChallenge(html)).toBe(true);
  });

  it('preserves facility text from footer regions', () => {
    const html = `
      <html><body>
        <main><p>Welcome to our museum.</p></main>
        <footer>
          <p>Public toilets are located by the Visitor Centre.</p>
          <p>Free parking available in Pinner View car park.</p>
        </footer>
      </body></html>
    `;
    const { text } = extractPageContent(html);
    expect(text.toLowerCase()).toContain('toilet');
    expect(text.toLowerCase()).toContain('parking');
    const facts = extractEvidenceFromText(text, {
      url: 'https://headstonemanor.org/',
      sourceType: 'official_website',
      retrievedAt: '2026-08-07T12:00:00.000Z',
    });
    expect(facts.some((f) => f.field === 'toilets')).toBe(true);
    expect(facts.some((f) => f.field === 'parking')).toBe(true);
  });
});

describe('Headstone Manor single-page failure regression', () => {
  it('before fix: homepage-only with no links would stay at 1 page — after fix: common paths expand selection', () => {
    const discovery = discoverSourceUrls({ website: 'https://headstonemanor.org/', googleDescription: null });

    // Simulates old behaviour: empty/challenge homepage HTML, no parseable links
    const challengeHtml = '<html><title>Just a moment</title></html>';
    const { pages: oldWouldBe } = mergePageCandidates(
      discovery.homepage,
      [{ url: discovery.homepage, sourceType: 'official_website' }],
      challengeHtml,
      5,
    );

    // Even with challenge HTML, common paths should add /visit/, /faq/, etc.
    expect(oldWouldBe.length).toBeGreaterThan(1);
    expect(oldWouldBe.map((p) => p.url)).toContain('https://headstonemanor.org/');
    expect(oldWouldBe.some((p) => /\/visit/i.test(p.url))).toBe(true);
  });

  it('diagnostics report discovered vs selected links and per-page evidence', () => {
    const visitFacts = extractEvidenceFromText(
      'Museum public toilets are to be found in a block by the Visitor Centre. Free parking in Pinner View.',
      { url: 'https://headstonemanor.org/visit/', sourceType: 'visitor_info', retrievedAt: '2026-08-07T12:00:00.000Z' },
    );
    const bundle = buildEvidenceBundle(
      'fp-google-headstone',
      [
        {
          url: 'https://headstonemanor.org/',
          sourceType: 'official_website',
          fetchStatus: 'blocked',
          error: 'cloudflare_challenge',
          facts: [],
        },
        {
          url: 'https://headstonemanor.org/visit/',
          sourceType: 'visitor_info',
          fetchStatus: 'ok',
          facts: visitFacts,
        },
      ],
      'official_website',
    );

    expect(bundle.pagesChecked).toBe(2);
    expect(bundle.facts.some((f) => f.field === 'toilets')).toBe(true);
    expect(bundle.facts.some((f) => f.field === 'parking')).toBe(true);
    expect(bundle.sources[0].fetchStatus).toBe('blocked');
    expect(bundle.sources[1].facts?.length).toBeGreaterThan(0);
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

describe('focused recommendation QA regressions', () => {
  const sourceMeta = {
    url: 'https://example.org/visit',
    sourceType: 'official_website',
    retrievedAt: '2026-08-09T12:00:00.000Z',
  };

  it('Flip Out — parking negation yields parking=no not yes', async () => {
    const { hasParkingNegation } = await import('../../../api/enrichment/_lib/evidence-extractor.js');
    const faqSentence =
      'We do not have on-site parking, however, there is a small retail park opposite - charges apply.';
    expect(hasParkingNegation(faqSentence)).toBe(true);

    const facts = extractEvidenceFromText(faqSentence, {
      ...sourceMeta,
      url: 'https://www.flipout.co.uk/locations/brent-cross/frequently-asked-questions',
      sourceType: 'faq_page',
    });
    expect(facts.find((f) => f.field === 'parking')?.value).toBe('no');
  });

  it('Verulamium Park — closed public toilets must not yield toilets=yes', async () => {
    const { hasToiletNegation } = await import('../../../api/enrichment/_lib/evidence-extractor.js');
    const sentence =
      'The café is near the now closed public toilets at the far end of the park.';
    expect(hasToiletNegation(sentence)).toBe(true);

    const facts = extractEvidenceFromText(sentence, {
      ...sourceMeta,
      url: 'https://www.stalbans.gov.uk/parks/verulamium-park',
      sourceType: 'official_website',
    });
    expect(facts.find((f) => f.field === 'toilets')?.value).toBe('no');
  });

  it('Golders Hill Park — address and public transport must not yield parking=yes', async () => {
    const { hasExplicitParkingAvailability } = await import('../../../api/enrichment/_lib/evidence-extractor.js');
    const sentence =
      'Golders Hill Park is located on North End Way. Public transport links are excellent with buses serving the area.';
    expect(hasExplicitParkingAvailability(sentence)).toBe(false);

    const facts = extractEvidenceFromText(sentence, {
      ...sourceMeta,
      url: 'https://www.cityoflondon.gov.uk/things-to-do/green-spaces/hampstead-heath/golders-hill-park',
      sourceType: 'official_website',
    });
    expect(facts.find((f) => f.field === 'parking')).toBeUndefined();
  });

  it('Golders Hill Park — parking located nearby must not yield parking=yes', async () => {
    const sentence = 'Parking is located at the Spaniards Inn nearby.';
    const facts = extractEvidenceFromText(sentence, {
      ...sourceMeta,
      url: 'https://www.cityoflondon.gov.uk/things-to-do/green-spaces/hampstead-heath/golders-hill-park',
      sourceType: 'official_website',
    });
    expect(facts.find((f) => f.field === 'parking')).toBeUndefined();
  });

  it('Warner Bros — generic changing facilities must not yield babyChanging=yes', async () => {
    const { isExplicitBabyChangingStatement } = await import('../../../api/enrichment/_lib/evidence-extractor.js');
    const sentence =
      'We offer a cloakroom, changing facilities and accessibility support throughout the tour.';
    expect(isExplicitBabyChangingStatement(sentence)).toBe(false);

    const facts = extractEvidenceFromText(sentence, {
      ...sourceMeta,
      url: 'https://www.wbstudiotour.co.uk/plan-your-visit/accessibility',
      sourceType: 'accessibility_page',
    });
    expect(facts.find((f) => f.field === 'babyChanging')).toBeUndefined();
  });

  it('Warner Bros — explicit baby changing still yields babyChanging=yes', async () => {
    const sentence = 'Baby changing facilities are available in the family restrooms near the entrance.';
    const facts = extractEvidenceFromText(sentence, {
      ...sourceMeta,
      url: 'https://www.wbstudiotour.co.uk/plan-your-visit/accessibility',
      sourceType: 'accessibility_page',
    });
    expect(facts.find((f) => f.field === 'babyChanging')?.value).toBe('yes');
  });

  it('RAF — indoors and outdoors wording yields environment=mixed', async () => {
    const { extractEnvironmentEvidence } = await import('../../../api/enrichment/_lib/environment-evidence.js');
    const fact = extractEnvironmentEvidence(
      'Whatever the weather, see their faces light up as they explore stories indoors and play outdoors at RAF Museum London this summer.',
      sourceMeta,
    );
    expect(fact?.value).toBe('mixed');
    expect(fact?.confidence).toBe('high');
  });

  it('Flip Out — indoor from official page title yields environment=indoor', async () => {
    const { extractEnvironmentEvidence } = await import('../../../api/enrichment/_lib/environment-evidence.js');
    const fact = extractEnvironmentEvidence('Explore attractions and book a session.', {
      ...sourceMeta,
      url: 'https://www.flipout.co.uk/locations/brent-cross',
      pageTitle: "North London's Ultimate Indoor Trampoline & Adventure Park!",
    });
    expect(fact?.value).toBe('indoor');
  });

  it('RAF — wheelchairs and pushchairs with wide aisles yields pushchair=good', async () => {
    const { extractPushchairEvidence } = await import('../../../api/enrichment/_lib/pushchair-evidence.js');
    const text =
      'Wide aisles, enabling access for wheelchairs and pushchairs. Lifts to upper levels. We have step free access around our site.';
    const fact = extractPushchairEvidence(text, {
      ...sourceMeta,
      url: 'https://www.rafmuseum.org.uk/london/plan-your-day/access-and-accessibility/',
      sourceType: 'accessibility_page',
    });
    expect(fact?.value).toBe('good');
    expect(fact?.confidence).toBe('high');
  });

  it('snippet cleanup removes navigation/header labels from evidence excerpts', async () => {
    const { cleanEvidenceSnippet, stripNavFragmentPrefixes } = await import(
      '../../../api/enrichment/_lib/evidence-text-utils.js'
    );
    const noisy =
      'All parking information Toilet Facilities All our hangars have accessible toilets.';
    expect(stripNavFragmentPrefixes(noisy)).toBe('All our hangars have accessible toilets.');
    expect(cleanEvidenceSnippet(noisy)).toBe('All our hangars have accessible toilets.');
  });

  it('draftJsonToReviewForm prefills environment, energyLevel, accessibility, and visit duration', async () => {
    const { draftJsonToReviewForm } = await import('@/src/utils/ai-draft-review');
    const form = draftJsonToReviewForm({
      recommendedAge: { min: null, max: null, notes: null, confidence: 'unknown' },
      familyFacilities: {
        toilets: { value: 'yes', confidence: 'high', reason: null },
        babyChanging: { value: 'unknown', confidence: 'unknown', reason: null },
        parking: { value: 'no', confidence: 'high', reason: null },
        cafe: { value: 'unknown', confidence: 'unknown', reason: null },
      },
      pushchairSuitability: { value: 'good', confidence: 'high', reason: null },
      terrain: { value: 'unknown', confidence: 'unknown', reason: null },
      environment: {
        value: 'mixed',
        confidence: 'high',
        reason: null,
        evidence: 'explore indoors and play outdoors',
      },
      energyLevel: { value: 'unknown', confidence: 'unknown', reason: null },
      accessibility: {
        wheelchairAccessible: { value: 'yes', confidence: 'high', reason: null },
      },
      sendInfo: {},
      whyFamiliesLike: [],
      goodToKnow: [],
      suggestedVisitDuration: 90,
      rainyDaySuitability: 'unknown',
      overallDraftConfidence: 'medium',
    });
    expect(form.environment).toBe('mixed');
    expect(form.energyLevel).toBe('unknown');
    expect(form.visitDurationMinutes).toBe(90);
    expect(form.accessibility?.wheelchairAccessible).toBe('yes');
    expect(form.familyFacilities?.parking).toBe('no');
  });

  it('environment evidence merges into draft JSON', async () => {
    const { mergeEvidenceIntoDraft } = await import('../../../api/enrichment/_lib/evidence-draft-merge.js');
    const bundle = buildEvidenceBundle(
      'fp-test',
      [
        {
          url: 'https://www.rafmuseum.org.uk/london/',
          sourceType: 'official_website',
          retrievedAt: '2026-08-09T12:00:00.000Z',
          fetchStatus: 'ok',
          facts: extractEvidenceFromText(
            'Whatever the weather, explore stories indoors and play outdoors at the museum.',
            sourceMeta,
          ),
        },
      ],
      'official_website',
    );
    const { normaliseDraftJson } = await import('../../../api/enrichment/_lib/ai-draft-schema.js');
    const draft = mergeEvidenceIntoDraft(
      normaliseDraftJson({
        recommendedAge: { min: null, max: null, notes: null, confidence: 'unknown' },
        familyFacilities: {},
        pushchairSuitability: {},
        terrain: {},
        environment: { value: 'unknown', confidence: 'unknown', reason: null },
        energyLevel: { value: 'unknown', confidence: 'unknown', reason: null },
        overallDraftConfidence: 'unknown',
      }),
      bundle,
    );
    expect(draft.environment.value).toBe('mixed');
    expect(draft.environment.evidenceBacked).toBe(true);
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


describe('live venue evidence quality regressions', () => {
  const meta = {
    url: 'https://example.org/visit',
    sourceType: 'visitor_info',
    retrievedAt: '2026-08-09T12:00:00.000Z',
  };

  it('keeps limited parking unknown rather than treating it as unavailable', () => {
    const facts = extractEvidenceFromText('There is limited parking near to the zoo.', meta);
    expect(facts.find((fact) => fact.field === 'parking')).toBeUndefined();
  });

  it('centres evidence on the matched wording inside long flattened pages', () => {
    const text =
      'unrelated navigation '.repeat(80) +
      'visitor centre which includes a cafe, public toilets, classrooms and a fishing office';
    const facts = extractEvidenceFromText(text, meta);
    const toilets = facts.find((fact) => fact.field === 'toilets');
    expect(toilets?.value).toBe('yes');
    expect(toilets?.evidenceText).toContain('public toilets');
    expect(toilets?.evidenceText.length).toBeLessThan(450);
    expect(toilets?.evidenceText).not.toContain('unrelated navigation unrelated navigation unrelated navigation unrelated navigation');
  });

  it('centres baby-changing evidence instead of returning trailing page CSS', () => {
    const text =
      '.block { color: red; } '.repeat(80) +
      'Baby changing facilities are located within the accessible toilet on the Village Green. ' +
      '.footer { display: grid; } '.repeat(80);
    const facts = extractEvidenceFromText(text, meta);
    const babyChanging = facts.find((fact) => fact.field === 'babyChanging');
    expect(babyChanging?.value).toBe('yes');
    expect(babyChanging?.evidenceText).toContain('Baby changing facilities');
    expect(babyChanging?.evidenceText).not.toContain('display: grid');
  });
});
