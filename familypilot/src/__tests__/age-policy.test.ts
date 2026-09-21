import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const {
  agePolicyFieldKey,
  normaliseAgeRules,
  claimMayGate,
  venueRestrictionFromClaims,
  ageCaveatsFromClaims,
} = require('../../../server/enrichment/_lib/age-policy');
const {
  projectActiveClaimsToPayload,
  metadataRowFromPayload,
  PROJECTED_AGE_RESTRICTION,
} = require('../../../server/enrichment/_lib/claims-store');
const { expiryDate } = require('../../../server/enrichment/_lib/trusted-evidence');

/**
 * P0-B2, data half: which claims may remove a venue, and which may not.
 *
 * A venue restriction is the only fact in this product that hides an option from a parent, so
 * every test below is about refusing to gate. The matcher half lives in age-admission.test.ts.
 */

/** The server modules are plain JS, so their inferred shapes are narrower than reality. */
type AgeMetadata = {
  minRecommendedAge: number | null;
  venueAgeRestriction: { minMonthsInclusive: number | null } | null;
};

const TODAY = '2026-09-21';
const FUTURE = '2026-10-15';
const PAST = '2026-09-20';

/** A claim whose provenance is strong enough to gate. Tests weaken one field at a time. */
function gatingClaim(overrides: Record<string, unknown> = {}) {
  return {
    fieldKey: agePolicyFieldKey('https://venue.example/visit'),
    status: 'active',
    valueJson: {
      rules: [{ scope: 'venue', minMonthsInclusive: 48, maxMonthsExclusive: null, statedAs: 'Under 4s not admitted' }],
    },
    sourceUrl: 'https://venue.example/visit',
    sourceEvidenceId: 'evidence-1',
    sourceType: 'official_website',
    confidence: 'high',
    approvedBy: 'editor@familypilot',
    checkedAt: TODAY,
    validUntil: FUTURE,
    ...overrides,
  };
}

describe('claim identity is the source, never the value', () => {
  it('is stable across a change of policy', () => {
    const before = agePolicyFieldKey('https://venue.example/visit');
    const after = agePolicyFieldKey('https://venue.example/visit');
    expect(after).toBe(before);
  });

  it('normalises scheme, case and trailing slash so one page is one claim', () => {
    expect(agePolicyFieldKey('https://Venue.example/visit/')).toBe(agePolicyFieldKey('http://venue.example/visit'));
  });

  it('gives different sources different keys, so both can be active at once', () => {
    expect(agePolicyFieldKey('https://a.example/x')).not.toBe(agePolicyFieldKey('https://b.example/x'));
  });

  it('refuses to invent a key with no source', () => {
    expect(agePolicyFieldKey('')).toBeNull();
    expect(agePolicyFieldKey(null)).toBeNull();
  });
});

describe('rules that cannot be read are dropped, not guessed at', () => {
  it('drops a rule with no bound at all', () => {
    expect(normaliseAgeRules({ rules: [{ scope: 'venue' }] })).toEqual([]);
  });

  it('drops an inverted range rather than admitting nobody', () => {
    expect(normaliseAgeRules({ rules: [{ scope: 'venue', minMonthsInclusive: 144, maxMonthsExclusive: 48 }] })).toEqual([]);
  });

  it('drops non-integer and negative bounds', () => {
    expect(normaliseAgeRules({ rules: [{ scope: 'venue', minMonthsInclusive: 4.5 }] })).toEqual([]);
    expect(normaliseAgeRules({ rules: [{ scope: 'venue', minMonthsInclusive: -12 }] })).toEqual([]);
  });

  it('treats an unrecognised scope as ambiguous, which can only ever be a caveat', () => {
    const [rule] = normaliseAgeRules({ rules: [{ scope: 'whatever', minMonthsInclusive: 48 }] });
    expect(rule.scope).toBe('ambiguous');
    expect(rule.effect).toBe('caveat');
  });
});

describe('only a venue-scope rule may exclude', () => {
  it.each(['activity', 'accompaniment', 'ambiguous'])('%s scope never becomes a restriction', (scope) => {
    const claim = gatingClaim({
      valueJson: { rules: [{ scope, minMonthsInclusive: 60, activity: 'soft play' }] },
    });
    expect(venueRestrictionFromClaims([claim], TODAY)).toBeNull();
    // ...but it is still told to the parent, rather than silently discarded.
    expect(ageCaveatsFromClaims([claim], TODAY)).toHaveLength(1);
  });

  it('projects a venue rule, carrying its source', () => {
    expect(venueRestrictionFromClaims([gatingClaim()], TODAY)).toEqual({
      minMonthsInclusive: 48,
      maxMonthsExclusive: null,
      sourceUrl: 'https://venue.example/visit',
      checkedAt: TODAY,
    });
  });
});

describe('provenance: a source-less claim never becomes a hard gate', () => {
  const weakenings: Array<[string, Record<string, unknown>]> = [
    ['no evidence record', { sourceEvidenceId: null }],
    ['no source URL', { sourceUrl: null }],
    ['the ai_assisted fallback source type', { sourceType: 'ai_assisted' }],
    ['the unknown confidence fallback', { confidence: 'unknown' }],
    ['an automatic approval', { approvedBy: 'ai_auto_approved' }],
    ['no approver at all', { approvedBy: null }],
    ['a non-active status', { status: 'disputed' }],
  ];

  it.each(weakenings)('%s cannot gate', (_label, overrides) => {
    const claim = gatingClaim(overrides);
    expect(claimMayGate(claim, TODAY)).toBe(false);
    expect(venueRestrictionFromClaims([claim], TODAY)).toBeNull();
  });

  it('but a fully-sourced, human-approved claim can', () => {
    expect(claimMayGate(gatingClaim(), TODAY)).toBe(true);
  });

  it('surfaces a venue rule that fell short as a caveat instead of dropping it', () => {
    const caveats = ageCaveatsFromClaims([gatingClaim({ sourceEvidenceId: null })], TODAY);
    expect(caveats).toHaveLength(1);
    expect(caveats[0].scope).toBe('venue');
  });
});

describe('lifetime: a restriction that outlived its evidence stops excluding', () => {
  it('gives age policy the short 30-day lifetime, not the generic 90', () => {
    expect(expiryDate(agePolicyFieldKey('https://venue.example/visit'), '2026-09-01')).toBe('2026-10-01');
    expect(expiryDate('minRecommendedAge', '2026-09-01')).toBe('2026-11-30');
  });

  it('an expired restriction projects to unknown', () => {
    expect(venueRestrictionFromClaims([gatingClaim({ validUntil: PAST })], TODAY)).toBeNull();
  });

  it('a claim with no recorded lifetime cannot gate, so grace cannot be inferred for it', () => {
    // Grace is earned by a transient failure re-reading a specific source. A claim with no
    // lifetime has nothing to re-read against, so it must never keep a venue hidden.
    expect(venueRestrictionFromClaims([gatingClaim({ validUntil: null })], TODAY)).toBeNull();
  });

  it('is still gating on its final valid day', () => {
    expect(venueRestrictionFromClaims([gatingClaim({ validUntil: TODAY })], TODAY)).not.toBeNull();
  });
});

describe('conflict: sources that disagree do not exclude anyone', () => {
  it('projects nothing when two trusted sources state different doors', () => {
    const a = gatingClaim();
    const b = gatingClaim({
      fieldKey: agePolicyFieldKey('https://other.example/info'),
      sourceUrl: 'https://other.example/info',
      valueJson: { rules: [{ scope: 'venue', minMonthsInclusive: 96, maxMonthsExclusive: null }] },
    });
    expect(venueRestrictionFromClaims([a, b], TODAY)).toBeNull();
  });

  it('corroborates when two sources agree', () => {
    const a = gatingClaim();
    const b = gatingClaim({
      fieldKey: agePolicyFieldKey('https://other.example/info'),
      sourceUrl: 'https://other.example/info',
    });
    expect(venueRestrictionFromClaims([a, b], TODAY)?.minMonthsInclusive).toBe(48);
  });

  it('cannot compose a range from two sources, because a rule carries both bounds', () => {
    // One source states a floor, another a ceiling. Neither stated the range they would form.
    const floor = gatingClaim({
      valueJson: { rules: [{ scope: 'venue', minMonthsInclusive: 48, maxMonthsExclusive: null }] },
    });
    const ceiling = gatingClaim({
      fieldKey: agePolicyFieldKey('https://other.example/info'),
      sourceUrl: 'https://other.example/info',
      valueJson: { rules: [{ scope: 'venue', minMonthsInclusive: null, maxMonthsExclusive: 144 }] },
    });
    expect(venueRestrictionFromClaims([floor, ceiling], TODAY)).toBeNull();
  });
});

describe('the read model can only be written by the claim projection', () => {
  it('an editor payload cannot express the restriction', () => {
    // Parsed JSON — exactly what an editor save carries — can never hold the Symbol key.
    const editorPayload = JSON.parse(
      '{"venueAgeRestriction":{"minMonthsInclusive":48,"maxMonthsExclusive":null,"sourceUrl":"https://typed.example"}}',
    );
    expect(metadataRowFromPayload('fp-x', editorPayload, null).venue_age_restriction).toBeNull();
  });

  it('the projection does write it', () => {
    const payload = projectActiveClaimsToPayload([gatingClaim()]);
    expect(payload[PROJECTED_AGE_RESTRICTION]).toBeTruthy();
    expect(metadataRowFromPayload('fp-x', payload, null).venue_age_restriction).toMatchObject({
      minMonthsInclusive: 48,
    });
  });

  it('projects nothing for a claim that cannot gate, even with the claim present', () => {
    const payload = projectActiveClaimsToPayload([gatingClaim({ sourceType: 'ai_assisted' })]);
    expect(metadataRowFromPayload('fp-x', payload, null).venue_age_restriction).toBeNull();
  });
});

describe('the real editor-save path', () => {
  const id = 'fp-google-age-policy';
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    env = { ...process.env };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
    fs.mkdirSync('.data', { recursive: true });
    for (const [file, data] of Object.entries({
      'venue-claims.json': { claims: [] },
      'venue-source-evidence.json': { records: [] },
      'enrichment-store.json': { places: {}, metadata: { [id]: { enrichment_status: 'enriched' } } },
    })) {
      fs.writeFileSync(path.join('.data', file), JSON.stringify(data));
    }
  });
  afterEach(() => {
    process.env = env;
    vi.useRealTimers();
  });

  it('cannot persist a venue-excluding value through a normal save', async () => {
    /**
     * The defect this replaces: `saveMetadata` falls back to the RAW editor payload whenever a
     * venue has no active claims, so a typed value reached the column with no claim behind it.
     * Exercised through the real save path rather than the projection helper, because the
     * projection helper was never where it went wrong.
     */
    const { saveMetadata, getMetadata } = await import(
      '../../../server/enrichment/_lib/enrichment-store.js'
    );
    // The server modules are plain JS; getMetadata is typed as possibly-null to TS.
    const read = async () => (await getMetadata(id)) as AgeMetadata;

    await saveMetadata(
      id,
      {
        checkedBy: 'editor@familypilot',
        minRecommendedAge: 3,
        venueAgeRestriction: { minMonthsInclusive: 48, maxMonthsExclusive: null, sourceUrl: 'https://typed.example' },
      },
      { syncClaims: true },
    );

    const metadata = await read();
    expect(metadata.venueAgeRestriction ?? null, 'a typed restriction must not survive a save').toBeNull();
    // The recommendation beside it is unaffected: this is about hard gates, not about age facts.
    expect(metadata.minRecommendedAge).toBe(3);
  });

  it('cannot persist one when the venue has NO claims at all', async () => {
    /**
     * The sharper version of the test above, and the one that actually found the hole.
     *
     * With any other claimable field present, `saveMetadata` rebuilds from claims and the typed
     * value is replaced on the way through -- so the first test passed even while the path was
     * broken. With nothing claimable in the payload, `rebuildMetadataPayloadFromClaims` returns
     * null and the RAW editor payload reaches the row builder. That is the unguarded path, and
     * there are two row builders: `saveMetadata` uses `metadataToRow` in enrichment-store, not
     * the `metadataRowFromPayload` in claims-store that the projection tests exercise.
     */
    const { saveMetadata, getMetadata } = await import(
      '../../../server/enrichment/_lib/enrichment-store.js'
    );
    // The server modules are plain JS; getMetadata is typed as possibly-null to TS.
    const read = async () => (await getMetadata(id)) as AgeMetadata;

    await saveMetadata(
      id,
      {
        checkedBy: 'editor@familypilot',
        venueAgeRestriction: { minMonthsInclusive: 48, maxMonthsExclusive: null, sourceUrl: 'https://typed.example' },
      },
      { syncClaims: true },
    );

    expect((await read()).venueAgeRestriction ?? null).toBeNull();
  });

  it('does not drop a legitimate projected restriction when other claims are rebuilt', async () => {
    const { saveMetadata, getMetadata } = await import(
      '../../../server/enrichment/_lib/enrichment-store.js'
    );
    // The server modules are plain JS; getMetadata is typed as possibly-null to TS.
    const read = async () => (await getMetadata(id)) as AgeMetadata;
    const { createApprovedClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
    const { saveEvidenceRecord } = await import('../../../server/enrichment/_lib/evidence-store.js');

    // The evidence row is what `createApprovedClaim` resolves `sourceEvidenceId` from, and without
    // it the claim cannot gate. That is the provenance rule working, not a setup detail: a
    // restriction with no evidence record behind it must never remove a venue.
    await saveEvidenceRecord({
      familypilotPlaceId: id,
      sourceUrl: 'https://venue.example/visit',
      sourceType: 'official_website',
      retrievedAt: `${TODAY}T09:00:00Z`,
      extractedText: 'Under 4s are not admitted to the museum.',
      fetchStatus: 'ok',
      httpStatus: 200,
    });

    await createApprovedClaim({
      familypilotPlaceId: id,
      fieldKey: agePolicyFieldKey('https://venue.example/visit'),
      value: gatingClaim().valueJson,
      fieldEvidence: {
        [agePolicyFieldKey('https://venue.example/visit')]: {
          sourceUrl: 'https://venue.example/visit',
          sourceType: 'official_website',
          confidence: 'high',
          evidence: 'Under 4s are not admitted to the museum.',
          retrievedAt: `${TODAY}T09:00:00Z`,
        },
      },
      reviewedBy: 'editor@familypilot',
      draftId: null,
      checkedAt: TODAY,
    });

    // A later, unrelated editorial save must not wipe the restriction during rebuild.
    await saveMetadata(id, { checkedBy: 'editor@familypilot', minRecommendedAge: 5 }, { syncClaims: true });

    const metadata = await read();
    expect(metadata.venueAgeRestriction).toBeTruthy();
    expect(metadata.venueAgeRestriction?.minMonthsInclusive).toBe(48);
  });
});
