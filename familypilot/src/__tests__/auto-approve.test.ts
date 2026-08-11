import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const CLAIMS_PATH = path.join(process.cwd(), '.data', 'venue-claims.json');
const DRAFTS_PATH = path.join(process.cwd(), '.data', 'enrichment-drafts.json');
const STORE_PATH = path.join(process.cwd(), '.data', 'enrichment-store.json');

let savedAutoApprove: string | undefined;
let savedSupabaseUrl: string | undefined;
let savedSupabaseKey: string | undefined;

const PLACE_ID = 'fp-google-auto-approve';

const APPROVABLE_DRAFT = {
  recommendedAge: { min: 2, max: 10, notes: 'All ages welcome', confidence: 'medium' },
  familyFacilities: {
    toilets: {
      value: 'yes',
      confidence: 'high',
      sourceUrl: 'https://example.org/visit',
      evidence: 'Toilets available in the visitor centre.',
      evidenceBacked: true,
    },
    babyChanging: { value: 'unknown', confidence: 'low', reason: null },
    parking: {
      value: 'yes',
      confidence: 'high',
      sourceUrl: 'https://example.org/parking',
      evidence: 'Free on-site parking for visitors.',
      evidenceBacked: true,
    },
    cafe: { value: 'unknown', confidence: 'unknown', reason: null },
  },
  pushchairSuitability: {
    value: 'good',
    confidence: 'medium',
    evidence: 'Wide paths suitable for pushchairs.',
    sourceUrl: 'https://example.org/visit',
  },
  terrain: { value: 'mostly_flat', confidence: 'medium', evidence: 'Mostly flat paths.' },
  environment: { value: 'outdoor', confidence: 'medium', evidence: 'Outdoor gardens.' },
  energyLevel: { value: 'unknown', confidence: 'unknown' },
  accessibility: {},
  sendInfo: {},
  whyFamiliesLike: ['Nice day out'],
  goodToKnow: ['Bring a picnic'],
  suggestedVisitDuration: 120,
  rainyDaySuitability: 'unknown',
  overallDraftConfidence: 'medium',
};

function ensureDataDir() {
  const dir = path.dirname(CLAIMS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function seedFileStores() {
  ensureDataDir();
  fs.writeFileSync(CLAIMS_PATH, JSON.stringify({ claims: [] }, null, 2));
  fs.writeFileSync(
    DRAFTS_PATH,
    JSON.stringify(
      {
        drafts: [
          {
            id: 'draft-auto-1',
            familypilot_place_id: PLACE_ID,
            external_id: 'google:auto',
            draft_json: APPROVABLE_DRAFT,
            model: 'gpt-test',
            generated_at: new Date().toISOString(),
            source_context: { evidenceBundle: { facts: [], sourceStatus: 'official_website' } },
            confidence_json: {},
            evidence_status: 'evidence_backed',
            status: 'pending_review',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    STORE_PATH,
    JSON.stringify(
      {
        places: {
          [PLACE_ID]: {
            familypilot_place_id: PLACE_ID,
            external_id: 'google:auto',
            provider: 'google',
            name: 'Auto Approve Park',
            category: 'park',
            lat: 51.64,
            lng: -0.36,
          },
        },
        metadata: {
          [PLACE_ID]: { enrichment_status: 'ai_draft' },
        },
      },
      null,
      2,
    ),
  );
}

function isolateTests() {
  savedAutoApprove = process.env.ENRICHMENT_AUTO_APPROVE;
  savedSupabaseUrl = process.env.SUPABASE_URL;
  savedSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.ENRICHMENT_AUTO_APPROVE = 'true';
  vi.resetModules();
}

function restoreTests() {
  if (savedAutoApprove !== undefined) process.env.ENRICHMENT_AUTO_APPROVE = savedAutoApprove;
  else delete process.env.ENRICHMENT_AUTO_APPROVE;
  if (savedSupabaseUrl !== undefined) process.env.SUPABASE_URL = savedSupabaseUrl;
  else delete process.env.SUPABASE_URL;
  if (savedSupabaseKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedSupabaseKey;
  else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.resetModules();
}

describe('AI auto-approve enrichment', () => {
  beforeEach(() => {
    isolateTests();
    seedFileStores();
  });

  afterEach(() => {
    restoreTests();
  });

  it('buildAutoApprovePayload includes only evidence-backed or confident fields', async () => {
    const { buildAutoApprovePayload } = await import('../../../api/enrichment/_lib/auto-approve.js');

    const review = buildAutoApprovePayload(APPROVABLE_DRAFT, { facts: [] });
    expect(review.eligible).toBe(true);
    expect(review.payload.minRecommendedAge).toBe(2);
    expect(review.payload.maxRecommendedAge).toBe(10);
    expect(review.payload.familyFacilities?.toilets).toBe('yes');
    expect(review.payload.familyFacilities?.parking).toBe('yes');
    expect(review.payload.familyFacilities?.cafe).toBeUndefined();
    expect(review.payload.familyFacilities?.babyChanging).toBeUndefined();
    expect(review.payload.energyLevel).toBeUndefined();
    expect(review.fieldCount).toBeGreaterThanOrEqual(2);
  });

  it('rejects auto-approve when ages are missing', async () => {
    const { buildAutoApprovePayload } = await import('../../../api/enrichment/_lib/auto-approve.js');

    const review = buildAutoApprovePayload(
      {
        ...APPROVABLE_DRAFT,
        recommendedAge: { min: null, max: null, confidence: 'unknown' },
      },
      { facts: [] },
    );
    expect(review.eligible).toBe(false);
    expect(review.reason).toBe('missing_confident_ages');
  });

  it('rejects auto-approve when evidence conflicts are unresolved', async () => {
    const { buildAutoApprovePayload } = await import('../../../api/enrichment/_lib/auto-approve.js');

    const review = buildAutoApprovePayload(APPROVABLE_DRAFT, {
      facts: [
        {
          field: 'parking',
          evidenceStatus: 'conflict',
          conflicts: [{ value: 'yes' }, { value: 'no' }],
        },
      ],
    });
    expect(review.eligible).toBe(false);
    expect(review.reason).toBe('unresolved_evidence_conflicts');
  });

  it('tryAutoApproveDraft creates trusted claims and enriched metadata', async () => {
    const { tryAutoApproveDraft } = await import('../../../api/enrichment/_lib/auto-approve.js');
    const { getActiveClaims } = await import('../../../api/enrichment/_lib/claims-store.js');

    const outcome = await tryAutoApproveDraft(PLACE_ID);
    expect(outcome.approved).toBe(true);
    expect(outcome.approvedFields).toContain('minRecommendedAge');

    const claims = await getActiveClaims(PLACE_ID);
    expect(claims.some((c) => c.fieldKey === 'familyFacilities.parking')).toBe(true);
    expect(claims.some((c) => c.approvedBy === 'ai_auto_approved')).toBe(true);
    expect(claims.every((c) => c.valueJson !== 'unknown')).toBe(true);
  });

  it('skips when ENRICHMENT_AUTO_APPROVE is disabled', async () => {
    process.env.ENRICHMENT_AUTO_APPROVE = 'false';
    vi.resetModules();

    const { tryAutoApproveDraft } = await import('../../../api/enrichment/_lib/auto-approve.js');
    const outcome = await tryAutoApproveDraft(PLACE_ID);
    expect(outcome.approved).toBe(false);
    expect(outcome.reason).toBe('auto_approve_disabled');
  });
});
