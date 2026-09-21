import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const {
  agePolicyFieldKey,
  canonicalSourceUrl,
  normaliseAgeRules,
  claimMayGate,
  projectAgePolicy,
  GATING_SOURCE_TYPES,
} = require('../../../server/enrichment/_lib/age-policy');
const {
  projectActiveClaimsToPayload,
  metadataRowFromPayload,
  PROJECTED_AGE_POLICY,
} = require('../../../server/enrichment/_lib/claims-store');
const { expiryDate, SOURCE_TYPES } = require('../../../server/enrichment/_lib/trusted-evidence');
const { ALL_SOURCE_TYPES } = require('../../../server/enrichment/_lib/source-types');
const {
  humanApprover,
  isHumanApprover,
  SYSTEM_APPROVERS,
  AI_AUTO_APPROVER,
  SOURCE_EVIDENCE_AUTO_APPROVER,
  DEFAULT_UNATTENDED_APPROVER,
} = require('../../../server/enrichment/_lib/approval-actors');

/**
 * P0-B2, data half: which claims may remove a venue, and which may not.
 *
 * A venue restriction is the only fact in this product that hides an option from a parent, so
 * every test below is about refusing to gate. The matcher half lives in age-admission.test.ts.
 */

/** The server modules are plain JS, so their inferred shapes are narrower than reality. */
type AgePolicyRead = {
  restrictions: Array<{ minMonthsInclusive: number | null; maxMonthsExclusive: number | null; sourceUrl: string }>;
  caveats: Array<{ scope: string }>;
  sourcesDisagree: boolean;
};
type AgeMetadata = {
  minRecommendedAge: number | null;
  venueAgePolicy: AgePolicyRead | null;
};

const TODAY = '2026-09-21';
const FUTURE = '2026-10-15';
const PAST = '2026-09-20';
const EDITOR = humanApprover('editor@familypilot');

/** A claim whose provenance is strong enough to gate. Tests weaken one field at a time. */
function gatingClaim(overrides: Record<string, unknown> = {}) {
  const sourceUrl = (overrides.sourceUrl as string) ?? 'https://venue.example/visit';
  return {
    fieldKey: agePolicyFieldKey(sourceUrl),
    status: 'active',
    valueJson: {
      rules: [
        {
          scope: 'venue',
          effect: 'excludes',
          minMonthsInclusive: 48,
          maxMonthsExclusive: null,
          statedAs: 'Under 4s not admitted',
        },
      ],
    },
    sourceUrl,
    sourceEvidenceId: 'evidence-1',
    sourceType: 'official_website',
    confidence: 'high',
    approvedBy: EDITOR,
    checkedAt: TODAY,
    validUntil: FUTURE,
    ...overrides,
  };
}

const restrictionsOf = (claims: unknown[], today = TODAY) =>
  projectAgePolicy(claims, today)?.restrictions ?? [];
const caveatsOf = (claims: unknown[], today = TODAY) => projectAgePolicy(claims, today)?.caveats ?? [];

describe('claim identity is the source, never the value', () => {
  it('is stable across a change of policy', () => {
    expect(agePolicyFieldKey('https://venue.example/visit')).toBe(
      agePolicyFieldKey('https://venue.example/visit'),
    );
  });

  it('normalises only the parts of a URL that are case-INSENSITIVE', () => {
    // Scheme and host are case-insensitive; a trailing slash names the same resource.
    expect(agePolicyFieldKey('HTTPS://Venue.EXAMPLE/visit/')).toBe(
      agePolicyFieldKey('https://venue.example/visit'),
    );
  });

  it('keeps a case-sensitive path and query distinct, because they may be different pages', () => {
    // The defect this replaces lowercased the whole URL, so /Policy and /policy became one claim
    // and the second source silently superseded the first.
    expect(agePolicyFieldKey('https://venue.example/Policy')).not.toBe(
      agePolicyFieldKey('https://venue.example/policy'),
    );
    expect(agePolicyFieldKey('https://venue.example/p?id=A')).not.toBe(
      agePolicyFieldKey('https://venue.example/p?id=a'),
    );
  });

  it('drops the fragment and a default port, which do not name a different resource', () => {
    expect(canonicalSourceUrl('https://venue.example:443/visit#ages')).toBe('https://venue.example/visit');
    expect(canonicalSourceUrl('https://venue.example/visit?tab=ages')).toBe('https://venue.example/visit?tab=ages');
  });

  it('folds http and https into one source, so a site moving to https supersedes its own claim', () => {
    // Forking here would leave the old policy active as a phantom second source, disagreeing
    // with the page that replaced it -- the feature would stop working rather than misfire.
    expect(agePolicyFieldKey('http://venue.example/visit')).toBe(agePolicyFieldKey('https://venue.example/visit'));
    expect(canonicalSourceUrl('http://venue.example:80/visit')).toBe('https://venue.example/visit');
  });

  it('gives different sources different keys, so both can be active at once', () => {
    expect(agePolicyFieldKey('https://a.example/x')).not.toBe(agePolicyFieldKey('https://b.example/x'));
  });

  it('uses a collision-resistant digest, not a 32-bit hash', () => {
    // Active-claim uniqueness is per field_key and replaceActiveClaim SUPERSEDES that key's row,
    // so a collision would not fail open -- it would delete one source's policy and leave the
    // other standing alone as an unopposed gate. 128 bits of SHA-256 is the guard.
    const key = agePolicyFieldKey('https://venue.example/visit') as string;
    expect(key).toMatch(/^agePolicy\.[0-9a-f]{32}$/);
  });

  it('refuses to invent a key with no usable source', () => {
    expect(agePolicyFieldKey('')).toBeNull();
    expect(agePolicyFieldKey(null)).toBeNull();
    expect(agePolicyFieldKey('not a url')).toBeNull();
    expect(agePolicyFieldKey('javascript:alert(1)')).toBeNull();
  });

  it('never gates when a claim key has drifted from the source it names', () => {
    const claim = gatingClaim({ fieldKey: agePolicyFieldKey('https://elsewhere.example/other') });
    expect(claimMayGate(claim, TODAY)).toBe(false);
    expect(restrictionsOf([claim])).toHaveLength(0);
  });
});

describe('rules that cannot be read are dropped, not guessed at', () => {
  it('drops a rule with no bound at all', () => {
    expect(normaliseAgeRules({ rules: [{ scope: 'venue', effect: 'excludes' }] })).toEqual([]);
  });

  it('drops an inverted range rather than admitting nobody', () => {
    expect(
      normaliseAgeRules({ rules: [{ scope: 'venue', effect: 'excludes', minMonthsInclusive: 144, maxMonthsExclusive: 48 }] }),
    ).toEqual([]);
  });

  it('drops non-integer and negative bounds', () => {
    expect(normaliseAgeRules({ rules: [{ scope: 'venue', effect: 'excludes', minMonthsInclusive: 4.5 }] })).toEqual([]);
    expect(normaliseAgeRules({ rules: [{ scope: 'venue', effect: 'excludes', minMonthsInclusive: -12 }] })).toEqual([]);
  });

  it('treats an unrecognised scope as ambiguous, which can only ever be a caveat', () => {
    const [rule] = normaliseAgeRules({ rules: [{ scope: 'whatever', effect: 'excludes', minMonthsInclusive: 48 }] });
    expect(rule.scope).toBe('ambiguous');
    expect(rule.effect).toBe('caveat');
  });
});

describe('a door needs BOTH a venue scope and an excluding effect', () => {
  /**
   * The defect this replaces derived `effect` from `scope` alone, so a venue-scoped rule that
   * said `effect: caveat` -- or said nothing at all -- was silently promoted into a hard gate.
   */
  const notDoors: Array<[string, Record<string, unknown>]> = [
    ['effect omitted entirely', { scope: 'venue', minMonthsInclusive: 48 }],
    ['effect explicitly a caveat', { scope: 'venue', effect: 'caveat', minMonthsInclusive: 48 }],
    ['an unrecognised effect', { scope: 'venue', effect: 'maybe', minMonthsInclusive: 48 }],
    ['a null effect', { scope: 'venue', effect: null, minMonthsInclusive: 48 }],
    ['excludes on an activity scope', { scope: 'activity', effect: 'excludes', minMonthsInclusive: 60 }],
    ['excludes on an accompaniment scope', { scope: 'accompaniment', effect: 'excludes', maxMonthsExclusive: 24 }],
    ['excludes on an ambiguous scope', { scope: 'ambiguous', effect: 'excludes', minMonthsInclusive: 48 }],
  ];

  it.each(notDoors)('%s never becomes a restriction', (_label, rule) => {
    const claim = gatingClaim({ valueJson: { rules: [rule] } });
    expect(normaliseAgeRules(claim.valueJson)[0].effect).toBe('caveat');
    expect(restrictionsOf([claim])).toHaveLength(0);
    // ...but it is still told to the parent, rather than silently discarded.
    expect(caveatsOf([claim])).toHaveLength(1);
  });

  it('a venue rule that says excludes does become a restriction, carrying its source', () => {
    expect(restrictionsOf([gatingClaim()])).toEqual([
      {
        minMonthsInclusive: 48,
        maxMonthsExclusive: null,
        sourceUrl: 'https://venue.example/visit',
        checkedAt: TODAY,
        statedAs: 'Under 4s not admitted',
      },
    ]);
  });
});

describe('human approval is a positive test, not a list of known robots', () => {
  it('every automated approver in this codebase is refused', () => {
    for (const actor of SYSTEM_APPROVERS) {
      expect(isHumanApprover(actor), `${actor} must not read as human`).toBe(false);
      expect(claimMayGate(gatingClaim({ approvedBy: actor }), TODAY)).toBe(false);
      expect(restrictionsOf([gatingClaim({ approvedBy: actor })])).toHaveLength(0);
    }
  });

  it('names the three actors that actually exist, so a rename cannot quietly empty the set', () => {
    // Imported from the modules that use them rather than retyped, so a changed constant fails here.
    expect(SYSTEM_APPROVERS.has(AI_AUTO_APPROVER)).toBe(true);
    expect(SYSTEM_APPROVERS.has(SOURCE_EVIDENCE_AUTO_APPROVER)).toBe(true);
    expect(SYSTEM_APPROVERS.has(DEFAULT_UNATTENDED_APPROVER)).toBe(true);
    expect(SOURCE_EVIDENCE_AUTO_APPROVER).toBe('source_evidence_auto_v2');
    expect(DEFAULT_UNATTENDED_APPROVER).toBe('enrichment-admin');
  });

  it('an unknown future actor is refused without anyone adding it to a list', () => {
    expect(isHumanApprover('some_new_worker_v9')).toBe(false);
    expect(claimMayGate(gatingClaim({ approvedBy: 'some_new_worker_v9' }), TODAY)).toBe(false);
  });

  it('refuses a robot that wears the human namespace', () => {
    expect(isHumanApprover(`human:${SOURCE_EVIDENCE_AUTO_APPROVER}`)).toBe(false);
    expect(humanApprover(SOURCE_EVIDENCE_AUTO_APPROVER)).toBeNull();
  });

  it('refuses an empty or malformed identity', () => {
    expect(isHumanApprover('human:')).toBe(false);
    expect(isHumanApprover('human:   ')).toBe(false);
    expect(isHumanApprover(null)).toBe(false);
    expect(isHumanApprover('')).toBe(false);
  });

  it('accepts a stamped editor identity', () => {
    expect(EDITOR).toBe('human:editor@familypilot');
    expect(isHumanApprover(EDITOR)).toBe(true);
    expect(claimMayGate(gatingClaim(), TODAY)).toBe(true);
  });
});

describe('source types come from the evidence pipeline, not a second taxonomy', () => {
  it('is exactly the set the automatic publisher already trusts', () => {
    expect([...GATING_SOURCE_TYPES].sort()).toEqual([...SOURCE_TYPES].sort());
  });

  it('every gating source type is one an evidence row can actually hold', () => {
    for (const type of GATING_SOURCE_TYPES) {
      expect(ALL_SOURCE_TYPES.has(type), `${type} is not a venue_source_evidence source_type`).toBe(true);
    }
  });

  it.each(['official_website', 'accessibility_page', 'visitor_info', 'faq_page', 'family_page'])(
    'an official page (%s) may gate',
    (sourceType) => {
      expect(claimMayGate(gatingClaim({ sourceType }), TODAY)).toBe(true);
    },
  );

  it.each(['council_page', 'google_provider'])('a second-hand page (%s) states a caveat, never a door', (sourceType) => {
    const claim = gatingClaim({ sourceType });
    expect(claimMayGate(claim, TODAY)).toBe(false);
    expect(restrictionsOf([claim])).toHaveLength(0);
    expect(caveatsOf([claim])).toHaveLength(1);
  });

  it('refuses a source type no evidence row can hold', () => {
    // `official`, `operator` and `human_verified` were invented by an earlier revision and cannot
    // exist in venue_source_evidence at all.
    for (const invented of ['official', 'operator', 'human_verified', 'ai_assisted']) {
      expect(claimMayGate(gatingClaim({ sourceType: invented }), TODAY)).toBe(false);
    }
  });
});

describe('provenance: a source-less claim never becomes a hard gate', () => {
  const weakenings: Array<[string, Record<string, unknown>]> = [
    ['no evidence record', { sourceEvidenceId: null }],
    ['no source URL', { sourceUrl: null }],
    ['the unknown confidence fallback', { confidence: 'unknown' }],
    ['no approver at all', { approvedBy: null }],
    ['a non-active status', { status: 'disputed' }],
  ];

  it.each(weakenings)('%s cannot gate', (_label, overrides) => {
    const claim = gatingClaim(overrides);
    expect(claimMayGate(claim, TODAY)).toBe(false);
    expect(restrictionsOf([claim])).toHaveLength(0);
  });

  it('surfaces a venue rule that fell short as a caveat instead of dropping it', () => {
    const caveats = caveatsOf([gatingClaim({ sourceEvidenceId: null })]);
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
    expect(restrictionsOf([gatingClaim({ validUntil: PAST })])).toHaveLength(0);
  });

  it('a claim with no recorded lifetime cannot gate, so grace cannot be inferred for it', () => {
    // Grace is earned by a transient failure re-reading a specific source. A claim with no
    // lifetime has nothing to re-read against, so it must never keep a venue hidden.
    expect(restrictionsOf([gatingClaim({ validUntil: null })])).toHaveLength(0);
  });

  it('is still gating on its final valid day', () => {
    expect(restrictionsOf([gatingClaim({ validUntil: TODAY })])).toHaveLength(1);
  });
});

describe('several doors from one source are several doors, not a contradiction', () => {
  const twoDoors = gatingClaim({
    valueJson: {
      rules: [
        { scope: 'venue', effect: 'excludes', minMonthsInclusive: 48, maxMonthsExclusive: null, statedAs: 'Under 4s not admitted' },
        { scope: 'venue', effect: 'excludes', minMonthsInclusive: null, maxMonthsExclusive: 144, statedAs: 'Over 12s not admitted' },
      ],
    },
  });

  it('keeps both, because a single scalar interval cannot hold them', () => {
    const restrictions = restrictionsOf([twoDoors]);
    expect(restrictions).toHaveLength(2);
    expect(
      restrictions.map((r: { minMonthsInclusive: number | null; maxMonthsExclusive: number | null }) => [
        r.minMonthsInclusive,
        r.maxMonthsExclusive,
      ]),
    ).toEqual([
      [48, null],
      [null, 144],
    ]);
    expect(projectAgePolicy([twoDoors], TODAY).sourcesDisagree).toBe(false);
  });

  it('does not duplicate an interval a source states twice', () => {
    const repeated = gatingClaim({
      valueJson: {
        rules: [
          { scope: 'venue', effect: 'excludes', minMonthsInclusive: 48, maxMonthsExclusive: null },
          { scope: 'venue', effect: 'excludes', minMonthsInclusive: 48, maxMonthsExclusive: null },
        ],
      },
    });
    expect(restrictionsOf([repeated])).toHaveLength(1);
  });

  it('refuses a combination that between them admits nobody', () => {
    // Each rule is valid alone. Together they close the door on every family, which is a
    // transcription error rather than a policy, so it explains instead of excluding.
    const impossible = gatingClaim({
      valueJson: {
        rules: [
          { scope: 'venue', effect: 'excludes', minMonthsInclusive: 144, maxMonthsExclusive: null },
          { scope: 'venue', effect: 'excludes', minMonthsInclusive: null, maxMonthsExclusive: 48 },
        ],
      },
    });
    expect(restrictionsOf([impossible])).toHaveLength(0);
    expect(caveatsOf([impossible])).toHaveLength(2);
  });
});

describe('conflict: sources that disagree do not exclude anyone', () => {
  const otherSource = 'https://other.example/info';

  it('projects no door when two trusted sources state different ones', () => {
    const a = gatingClaim();
    const b = gatingClaim({
      sourceUrl: otherSource,
      valueJson: { rules: [{ scope: 'venue', effect: 'excludes', minMonthsInclusive: 96, maxMonthsExclusive: null }] },
    });
    const policy = projectAgePolicy([a, b], TODAY);
    expect(policy.restrictions).toHaveLength(0);
    expect(policy.sourcesDisagree).toBe(true);
  });

  it('says so, rather than leaving the parent with nothing', () => {
    const a = gatingClaim();
    const b = gatingClaim({
      sourceUrl: otherSource,
      valueJson: { rules: [{ scope: 'venue', effect: 'excludes', minMonthsInclusive: 96, maxMonthsExclusive: null }] },
    });
    // Both sides survive as caveats. An earlier revision skipped each one individually on the
    // grounds that it "may gate", so the promised disagreement caveat never existed.
    const caveats = projectAgePolicy([a, b], TODAY).caveats;
    expect(caveats).toHaveLength(2);
    expect(caveats.every((c: { scope: string }) => c.scope === 'venue')).toBe(true);
  });

  it('corroborates when two sources state the same door', () => {
    const a = gatingClaim();
    const b = gatingClaim({ sourceUrl: otherSource });
    const policy = projectAgePolicy([a, b], TODAY);
    expect(policy.sourcesDisagree).toBe(false);
    expect(policy.restrictions).toHaveLength(1);
    expect(policy.restrictions[0].minMonthsInclusive).toBe(48);
  });

  it('cannot compose a range from two sources, because a rule carries both bounds', () => {
    // One source states a floor, another a ceiling. Neither stated the range they would form.
    const floor = gatingClaim();
    const ceiling = gatingClaim({
      sourceUrl: otherSource,
      valueJson: { rules: [{ scope: 'venue', effect: 'excludes', minMonthsInclusive: null, maxMonthsExclusive: 144 }] },
    });
    const policy = projectAgePolicy([floor, ceiling], TODAY);
    expect(policy.restrictions).toHaveLength(0);
    expect(policy.sourcesDisagree).toBe(true);
  });

  it('a source that cannot gate does not create a disagreement', () => {
    const trusted = gatingClaim();
    const untrusted = gatingClaim({
      sourceUrl: otherSource,
      sourceType: 'council_page',
      valueJson: { rules: [{ scope: 'venue', effect: 'excludes', minMonthsInclusive: 96, maxMonthsExclusive: null }] },
    });
    const policy = projectAgePolicy([trusted, untrusted], TODAY);
    expect(policy.sourcesDisagree).toBe(false);
    expect(policy.restrictions).toHaveLength(1);
    expect(policy.caveats).toHaveLength(1);
  });

  it('does not depend on the order the claims came back in', () => {
    const a = gatingClaim();
    const b = gatingClaim({ sourceUrl: otherSource });
    expect(projectAgePolicy([a, b], TODAY)).toEqual(projectAgePolicy([b, a], TODAY));
  });
});

describe('caveats reach the read model instead of being dropped', () => {
  it('keeps activity, accompaniment and ambiguous rules with their detail', () => {
    const claim = gatingClaim({
      valueJson: {
        rules: [
          { scope: 'activity', effect: 'caveat', minMonthsInclusive: 60, activity: 'soft play', statedAs: 'Soft play is 5+' },
          { scope: 'accompaniment', effect: 'caveat', maxMonthsExclusive: 24, accompaniment: { adultRequired: true } },
          { scope: 'ambiguous', effect: 'caveat', minMonthsInclusive: 36 },
        ],
      },
    });
    const caveats = caveatsOf([claim]);
    expect(caveats.map((c: { scope: string }) => c.scope)).toEqual(['activity', 'accompaniment', 'ambiguous']);
    expect(caveats[0].activity).toBe('soft play');
    expect(caveats[1].accompaniment).toEqual({ adultRequired: true });
  });

  it('projects nothing at all for a venue with no age rules', () => {
    expect(projectAgePolicy([], TODAY)).toBeNull();
    expect(projectAgePolicy([{ fieldKey: 'minRecommendedAge', status: 'active', valueJson: 3 }], TODAY)).toBeNull();
  });
});

describe('the read model can only be written by the claim projection', () => {
  it('an editor payload cannot express it', () => {
    // Parsed JSON -- exactly what an editor save carries -- can never hold the Symbol key.
    const editorPayload = JSON.parse(
      '{"venueAgePolicy":{"restrictions":[{"minMonthsInclusive":48,"maxMonthsExclusive":null,"sourceUrl":"https://typed.example","checkedAt":null}],"caveats":[],"sourcesDisagree":false}}',
    );
    expect(metadataRowFromPayload('fp-x', editorPayload, null).venue_age_policy).toBeNull();
  });

  it('the projection does write it', () => {
    const payload = projectActiveClaimsToPayload([gatingClaim()]);
    expect(payload[PROJECTED_AGE_POLICY]).toBeTruthy();
    expect(metadataRowFromPayload('fp-x', payload, null).venue_age_policy.restrictions[0]).toMatchObject({
      minMonthsInclusive: 48,
    });
  });

  it('writes caveats for a claim that cannot gate, and no restriction', () => {
    const payload = projectActiveClaimsToPayload([gatingClaim({ sourceType: 'council_page' })]);
    const row = metadataRowFromPayload('fp-x', payload, null);
    expect(row.venue_age_policy.restrictions).toHaveLength(0);
    expect(row.venue_age_policy.caveats).toHaveLength(1);
  });
});

describe('the real editor-save path', () => {
  const id = 'fp-google-age-policy';
  const sourceUrl = 'https://venue.example/visit';
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

  /** Seed a real evidence row and a real approved age-policy claim through the normal writers. */
  async function seedApprovedPolicy(rules: unknown[], reviewedBy: string = EDITOR) {
    const { createApprovedClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
    const { saveEvidenceRecord } = await import('../../../server/enrichment/_lib/evidence-store.js');

    // The evidence row is what `createApprovedClaim` resolves `sourceEvidenceId` from, and without
    // it the claim cannot gate. That is the provenance rule working, not a setup detail.
    await saveEvidenceRecord({
      familypilotPlaceId: id,
      sourceUrl,
      sourceType: 'visitor_info',
      retrievedAt: `${TODAY}T09:00:00Z`,
      extractedText: 'Under 4s are not admitted to the museum.',
      fetchStatus: 'ok',
      httpStatus: 200,
    });

    const fieldKey = agePolicyFieldKey(sourceUrl);
    await createApprovedClaim({
      familypilotPlaceId: id,
      fieldKey,
      value: { rules },
      fieldEvidence: {
        [fieldKey]: {
          sourceUrl,
          sourceType: 'visitor_info',
          confidence: 'high',
          evidence: 'Under 4s are not admitted to the museum.',
          retrievedAt: `${TODAY}T09:00:00Z`,
        },
      },
      reviewedBy,
      draftId: null,
      checkedAt: TODAY,
    });
  }

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
    const read = async () => (await getMetadata(id)) as unknown as AgeMetadata;

    await saveMetadata(
      id,
      {
        checkedBy: 'editor@familypilot',
        minRecommendedAge: 3,
        venueAgePolicy: {
          restrictions: [{ minMonthsInclusive: 48, maxMonthsExclusive: null, sourceUrl: 'https://typed.example', checkedAt: null }],
          caveats: [],
          sourcesDisagree: false,
        },
      },
      { syncClaims: true },
    );

    const metadata = await read();
    expect(metadata.venueAgePolicy ?? null, 'a typed policy must not survive a save').toBeNull();
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
    const read = async () => (await getMetadata(id)) as unknown as AgeMetadata;

    await saveMetadata(
      id,
      {
        checkedBy: 'editor@familypilot',
        venueAgePolicy: {
          restrictions: [{ minMonthsInclusive: 48, maxMonthsExclusive: null, sourceUrl: 'https://typed.example', checkedAt: null }],
          caveats: [],
          sourcesDisagree: false,
        },
      },
      { syncClaims: true },
    );

    expect((await read()).venueAgePolicy ?? null).toBeNull();
  });

  it('does not drop a legitimate projected door when other claims are rebuilt', async () => {
    const { saveMetadata, getMetadata } = await import(
      '../../../server/enrichment/_lib/enrichment-store.js'
    );
    const read = async () => (await getMetadata(id)) as unknown as AgeMetadata;

    await seedApprovedPolicy([
      { scope: 'venue', effect: 'excludes', minMonthsInclusive: 48, maxMonthsExclusive: null, statedAs: 'Under 4s not admitted' },
    ]);

    // A later, unrelated editorial save must not wipe the policy during rebuild.
    await saveMetadata(id, { checkedBy: 'editor@familypilot', minRecommendedAge: 5 }, { syncClaims: true });

    const metadata = await read();
    expect(metadata.venueAgePolicy?.restrictions).toHaveLength(1);
    expect(metadata.venueAgePolicy?.restrictions[0].minMonthsInclusive).toBe(48);
  });

  it('never gates on a claim the auto-approver created, through the real path', async () => {
    const { saveMetadata, getMetadata } = await import(
      '../../../server/enrichment/_lib/enrichment-store.js'
    );
    const read = async () => (await getMetadata(id)) as unknown as AgeMetadata;

    await seedApprovedPolicy(
      [{ scope: 'venue', effect: 'excludes', minMonthsInclusive: 48, maxMonthsExclusive: null }],
      SOURCE_EVIDENCE_AUTO_APPROVER,
    );
    await saveMetadata(id, { checkedBy: 'editor@familypilot', minRecommendedAge: 5 }, { syncClaims: true });

    const metadata = await read();
    expect(metadata.venueAgePolicy?.restrictions).toHaveLength(0);
    expect(metadata.venueAgePolicy?.caveats).toHaveLength(1);
  });

  it('carries caveats all the way to the consumer read model', async () => {
    /**
     * The defect this replaces: `projectActiveClaimsToPayload` set `payload.ageCaveats`, but no
     * row builder persisted it and no type exposed it, so an activity or accompaniment rule
     * reached exactly nobody. Asserted at `getConsumerMetadata`, which is what the places APIs
     * actually serve.
     */
    const { saveMetadata } = await import('../../../server/enrichment/_lib/enrichment-store.js');
    const { getConsumerMetadata } = await import(
      '../../../server/enrichment/_lib/consumer-projection.js'
    );

    await seedApprovedPolicy([
      { scope: 'activity', effect: 'caveat', minMonthsInclusive: 60, activity: 'soft play', statedAs: 'Soft play is 5+' },
      { scope: 'accompaniment', effect: 'caveat', maxMonthsExclusive: 24, accompaniment: { adultRequired: true } },
      { scope: 'ambiguous', effect: 'caveat', minMonthsInclusive: 36 },
    ]);
    await saveMetadata(id, { checkedBy: 'editor@familypilot', minRecommendedAge: 5 }, { syncClaims: true });

    const consumer = (await getConsumerMetadata(id)) as unknown as AgeMetadata;
    expect(consumer.venueAgePolicy?.caveats.map((c) => c.scope)).toEqual([
      'activity',
      'accompaniment',
      'ambiguous',
    ]);
    expect(consumer.venueAgePolicy?.restrictions).toHaveLength(0);
  });
});
