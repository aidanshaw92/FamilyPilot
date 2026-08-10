import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const CLAIMS_PATH = path.join(process.cwd(), '.data', 'venue-claims.json');
const EVIDENCE_PATH = path.join(process.cwd(), '.data', 'venue-source-evidence.json');

let savedSupabaseUrl: string | undefined;
let savedSupabaseKey: string | undefined;

function clearStores() {
  for (const filePath of [CLAIMS_PATH, EVIDENCE_PATH]) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (filePath.endsWith('venue-claims.json')) {
      fs.writeFileSync(filePath, JSON.stringify({ claims: [] }, null, 2));
    } else {
      fs.writeFileSync(filePath, JSON.stringify({ records: [] }, null, 2));
    }
  }
}

describe('claim source evidence linking', () => {
  beforeEach(() => {
    savedSupabaseUrl = process.env.SUPABASE_URL;
    savedSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.resetModules();
    clearStores();
  });
  afterEach(() => {
    clearStores();
    if (savedSupabaseUrl !== undefined) process.env.SUPABASE_URL = savedSupabaseUrl;
    else delete process.env.SUPABASE_URL;
    if (savedSupabaseKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedSupabaseKey;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.resetModules();
  });

  it('links approved claims to venue_source_evidence rows by source URL', async () => {
    const { saveEvidenceRecord } = await import('../../../api/enrichment/_lib/evidence-store.js');
    const { createClaimsFromApproval, getActiveClaims } = await import(
      '../../../api/enrichment/_lib/claims-store.js'
    );

    await saveEvidenceRecord({
      familypilotPlaceId: 'fp-google-evidence-link',
      sourceUrl: 'https://example.org/parking',
      sourceType: 'official_website',
      retrievedAt: '2026-08-10T12:00:00.000Z',
      extractedEvidence: [],
      fetchStatus: 'ok',
    });

    const draft = {
      familyFacilities: {
        toilets: { value: 'unknown', confidence: 'low' },
        babyChanging: { value: 'unknown', confidence: 'low' },
        parking: {
          value: 'yes',
          confidence: 'high',
          sourceUrl: 'https://example.org/parking',
          evidence: 'Free parking for visitors.',
          sourceType: 'official_website',
        },
        cafe: { value: 'unknown', confidence: 'low' },
      },
      pushchairSuitability: { value: 'unknown', confidence: 'low' },
      terrain: { value: 'unknown', confidence: 'low' },
      environment: { value: 'unknown', confidence: 'low' },
      energyLevel: { value: 'unknown', confidence: 'low' },
      accessibility: {},
      sendInfo: {},
    };

    await createClaimsFromApproval({
      familypilotPlaceId: 'fp-google-evidence-link',
      draftJson: draft,
      editorPayload: {
        familyFacilities: { parking: 'yes', freeParking: 'yes' },
      },
      reviewedBy: 'editor@test',
      draftId: 'draft-ev-1',
      checkedAt: '2026-08-10',
    });

    const claims = await getActiveClaims('fp-google-evidence-link');
    const parking = claims.find((c) => c.fieldKey === 'familyFacilities.parking');
    expect(parking?.sourceEvidenceId).toBeTruthy();
    expect(parking?.sourceUrl).toBe('https://example.org/parking');
  });
});
