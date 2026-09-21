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
  MIN_EVIDENCE_EXCERPT_CHARS,
} = require('../../../server/enrichment/_lib/age-policy');
const {
  projectActiveClaimsToPayload,
  metadataRowFromPayload,
  PROJECTED_AGE_POLICY,
} = require('../../../server/enrichment/_lib/claims-store');
const { expiryDate, SOURCE_TYPES, eligibleFact } = require('../../../server/enrichment/_lib/trusted-evidence');
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
/** Long enough to clear the 15-character floor, and what the seeded page says. */
const PAGE_TEXT = 'Under 4s are not admitted to the museum.';
const OTHER_EXCERPT = 'Over 12s are not admitted to the museum.';

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
          evidenceExcerpt: PAGE_TEXT,
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
    // Scheme and host are case-insensitive. Nothing else about the URL is touched.
    expect(agePolicyFieldKey('HTTPS://Venue.EXAMPLE/visit')).toBe(
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
    expect(canonicalSourceUrl('https://venue.example:8443/visit')).toBe('https://venue.example:8443/visit');
  });

  it('keeps http and https apart, because they can serve different content', () => {
    // Folding them would mean the second claim SUPERSEDES the first rather than coexisting with
    // it, leaving one source's policy standing unopposed. Inferring that a site moved to https
    // belongs in a producer that followed the redirect, not in a function looking at a string.
    expect(agePolicyFieldKey('http://venue.example/visit')).not.toBe(
      agePolicyFieldKey('https://venue.example/visit'),
    );
    expect(canonicalSourceUrl('http://venue.example:80/visit')).toBe('http://venue.example/visit');
    expect(canonicalSourceUrl('https://venue.example:443/visit')).toBe('https://venue.example/visit');
  });

  it('keeps a trailing slash, because nothing promises the two URLs are one fetched resource', () => {
    // `findEvidenceRecordBySourceUrl` matches `source_url` exactly, so /visit and /visit/ are two
    // evidence rows today. Two identities that fail open beat one that silently replaces a source.
    expect(agePolicyFieldKey('https://venue.example/visit/')).not.toBe(
      agePolicyFieldKey('https://venue.example/visit'),
    );
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
    ['effect omitted entirely', { scope: 'venue', minMonthsInclusive: 48, evidenceExcerpt: PAGE_TEXT }],
    ['effect explicitly a caveat', { scope: 'venue', effect: 'caveat', minMonthsInclusive: 48, evidenceExcerpt: PAGE_TEXT }],
    ['an unrecognised effect', { scope: 'venue', effect: 'maybe', minMonthsInclusive: 48, evidenceExcerpt: PAGE_TEXT }],
    ['a null effect', { scope: 'venue', effect: null, minMonthsInclusive: 48, evidenceExcerpt: PAGE_TEXT }],
    ['excludes on an activity scope', { scope: 'activity', effect: 'excludes', minMonthsInclusive: 60, evidenceExcerpt: PAGE_TEXT }],
    ['excludes on an accompaniment scope', { scope: 'accompaniment', effect: 'excludes', maxMonthsExclusive: 24, evidenceExcerpt: PAGE_TEXT }],
    ['excludes on an ambiguous scope', { scope: 'ambiguous', effect: 'excludes', minMonthsInclusive: 48, evidenceExcerpt: PAGE_TEXT }],
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

describe('every rule carries its own proof', () => {
  /**
   * The defect this closes: evidence was CLAIM-level, so one genuine quotation made the whole
   * claim high-confidence and a second door nobody had read anywhere inherited its proof.
   */
  it('a door with no excerpt is not surfaced in any form', () => {
    const claim = gatingClaim({
      valueJson: {
        rules: [{ scope: 'venue', effect: 'excludes', minMonthsInclusive: 48, maxMonthsExclusive: null }],
      },
    });
    expect(projectAgePolicy([claim], TODAY)).toBeNull();
  });

  it('a door whose excerpt is too short to mean anything is not surfaced either', () => {
    // "the" occurs on almost every page. A short match proves a string exists, not a policy.
    const claim = gatingClaim({
      valueJson: {
        rules: [
          { scope: 'venue', effect: 'excludes', minMonthsInclusive: 48, maxMonthsExclusive: null, evidenceExcerpt: 'the' },
        ],
      },
    });
    expect(projectAgePolicy([claim], TODAY)).toBeNull();
  });

  it('reuses the evidence pipeline floor rather than inventing one', () => {
    expect(MIN_EVIDENCE_EXCERPT_CHARS).toBe(15);
    // Pinned against the publisher's own floor: a 14-character excerpt is not eligible there.
    const fact = {
      field: 'toilets',
      value: 'yes',
      confidence: 'high',
      evidenceStatus: 'ok',
      sourceType: 'official_website',
      sourceUrl: 'https://venue.example/visit',
      retrievedAt: new Date().toISOString(),
      evidenceText: 'x'.repeat(MIN_EVIDENCE_EXCERPT_CHARS - 1),
    };
    const bundle = { sources: [] };
    expect(eligibleFact(fact, bundle)).toBe(false);
  });

  it('one unsupported door does not ride on a supported one', () => {
    const claim = gatingClaim({
      valueJson: {
        rules: [
          { scope: 'venue', effect: 'excludes', minMonthsInclusive: 48, maxMonthsExclusive: null, statedAs: 'real', evidenceExcerpt: PAGE_TEXT },
          { scope: 'venue', effect: 'excludes', minMonthsInclusive: null, maxMonthsExclusive: 144, statedAs: 'invented' },
        ],
      },
    });
    const policy = projectAgePolicy([claim], TODAY);
    expect(policy.restrictions).toHaveLength(1);
    expect(policy.restrictions[0].statedAs).toBe('real');
    expect(policy.sourcesDisagree, 'one source, one surviving door -- not a disagreement').toBe(false);
  });

  it('two doors with their own excerpts both apply', () => {
    const claim = gatingClaim({
      valueJson: {
        rules: [
          { scope: 'venue', effect: 'excludes', minMonthsInclusive: 48, maxMonthsExclusive: null, evidenceExcerpt: PAGE_TEXT },
          { scope: 'venue', effect: 'excludes', minMonthsInclusive: null, maxMonthsExclusive: 144, evidenceExcerpt: OTHER_EXCERPT },
        ],
      },
    });
    expect(projectAgePolicy([claim], TODAY).restrictions).toHaveLength(2);
  });

  it('an unsupported caveat never reaches a parent as a statement of fact', () => {
    // "Soft play is age 5 and over" is a sentence a parent will act on. Unsupported information
    // has to stay unknown rather than become a confident caveat.
    const claim = gatingClaim({
      valueJson: {
        rules: [{ scope: 'activity', effect: 'caveat', minMonthsInclusive: 60, activity: 'soft play' }],
      },
    });
    expect(projectAgePolicy([claim], TODAY)).toBeNull();
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
        { scope: 'venue', effect: 'excludes', minMonthsInclusive: 48, maxMonthsExclusive: null, statedAs: 'Under 4s not admitted', evidenceExcerpt: PAGE_TEXT },
        { scope: 'venue', effect: 'excludes', minMonthsInclusive: null, maxMonthsExclusive: 144, statedAs: 'Over 12s not admitted', evidenceExcerpt: PAGE_TEXT },
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
          { scope: 'venue', effect: 'excludes', minMonthsInclusive: 48, maxMonthsExclusive: null, evidenceExcerpt: PAGE_TEXT },
          { scope: 'venue', effect: 'excludes', minMonthsInclusive: 48, maxMonthsExclusive: null, evidenceExcerpt: PAGE_TEXT },
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
          { scope: 'venue', effect: 'excludes', minMonthsInclusive: 144, maxMonthsExclusive: null, evidenceExcerpt: PAGE_TEXT },
          { scope: 'venue', effect: 'excludes', minMonthsInclusive: null, maxMonthsExclusive: 48, evidenceExcerpt: PAGE_TEXT },
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
      valueJson: { rules: [{ scope: 'venue', effect: 'excludes', minMonthsInclusive: 96, maxMonthsExclusive: null, evidenceExcerpt: PAGE_TEXT }] },
    });
    const policy = projectAgePolicy([a, b], TODAY);
    expect(policy.restrictions).toHaveLength(0);
    expect(policy.sourcesDisagree).toBe(true);
  });

  it('says so, rather than leaving the parent with nothing', () => {
    const a = gatingClaim();
    const b = gatingClaim({
      sourceUrl: otherSource,
      valueJson: { rules: [{ scope: 'venue', effect: 'excludes', minMonthsInclusive: 96, maxMonthsExclusive: null, evidenceExcerpt: PAGE_TEXT }] },
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
      valueJson: { rules: [{ scope: 'venue', effect: 'excludes', minMonthsInclusive: null, maxMonthsExclusive: 144, evidenceExcerpt: PAGE_TEXT }] },
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
      valueJson: { rules: [{ scope: 'venue', effect: 'excludes', minMonthsInclusive: 96, maxMonthsExclusive: null, evidenceExcerpt: PAGE_TEXT }] },
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
          { scope: 'activity', effect: 'caveat', minMonthsInclusive: 60, activity: 'soft play', statedAs: 'Soft play is 5+', evidenceExcerpt: PAGE_TEXT },
          { scope: 'accompaniment', effect: 'caveat', maxMonthsExclusive: 24, accompaniment: { adultRequired: true }, evidenceExcerpt: PAGE_TEXT },
          { scope: 'ambiguous', effect: 'caveat', minMonthsInclusive: 36, evidenceExcerpt: PAGE_TEXT },
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

  /** Store one evidence row exactly as the fetcher would. */
  async function seedEvidence(overrides: Record<string, unknown> = {}) {
    const { saveEvidenceRecord } = await import('../../../server/enrichment/_lib/evidence-store.js');
    await saveEvidenceRecord({
      familypilotPlaceId: id,
      sourceUrl,
      sourceType: 'visitor_info',
      retrievedAt: `${TODAY}T09:00:00Z`,
      extractedText: PAGE_TEXT,
      fetchStatus: 'ok',
      httpStatus: 200,
      ...overrides,
    });
  }

  /** The writer is plain JS, so its return type is inferred as nullable. */
  type WrittenClaim = {
    fieldKey: string;
    sourceType: string;
    sourceEvidenceId: string | null;
    checkedAt: string;
    validUntil: string;
    approvedBy: string;
    valueJson: { rules: Array<{ statedAs: string | null }> };
  };

  /** Write an age-policy claim through its only writer. */
  async function seedApprovedPolicy(
    rules: unknown[],
    options: Record<string, unknown> = {},
  ): Promise<WrittenClaim> {
    const { createAgePolicyClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
    const written = await createAgePolicyClaim({
      familypilotPlaceId: id,
      sourceUrl,
      rules,
      reviewedBy: EDITOR,
      ...options,
    });
    expect(written, 'the writer must return the claim it stored').toBeTruthy();
    return written as unknown as WrittenClaim;
  }

  const VENUE_DOOR = [
    {
      scope: 'venue',
      effect: 'excludes',
      minMonthsInclusive: 48,
      maxMonthsExclusive: null,
      statedAs: 'Under 4s not admitted',
      evidenceExcerpt: PAGE_TEXT,
    },
  ];

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

    await seedEvidence();
    await seedApprovedPolicy(VENUE_DOOR);

    // A later, unrelated editorial save must not wipe the policy during rebuild.
    await saveMetadata(id, { checkedBy: 'editor@familypilot', minRecommendedAge: 5 }, { syncClaims: true });

    const metadata = await read();
    expect(metadata.venueAgePolicy?.restrictions).toHaveLength(1);
    expect(metadata.venueAgePolicy?.restrictions[0].minMonthsInclusive).toBe(48);
  });

  it('refuses to write an age policy for an automated approver at all', async () => {
    await seedEvidence();
    await expect(seedApprovedPolicy(VENUE_DOOR, { reviewedBy: SOURCE_EVIDENCE_AUTO_APPROVER })).rejects.toThrow(
      /human approver/i,
    );
  });

  it('refuses an actor that is merely unknown, rather than minting it a human identity', async () => {
    /**
     * The defect this closes: the writer called `humanApprover(reviewedBy)`, which prefixes any
     * value it does not already recognise as a robot. A new automated producer calling with its
     * own actor id would have been stored as `human:some_new_worker_v9` and would have gated,
     * without ever being added to SYSTEM_APPROVERS. Stamping is a decision for the boundary where
     * a person actually approves; this writer only accepts an identity stamped there.
     */
    await seedEvidence();
    await expect(seedApprovedPolicy(VENUE_DOOR, { reviewedBy: 'some_new_worker_v9' })).rejects.toThrow(
      /already-stamped human approver/,
    );
    // The bare editor identity is refused for the same reason: it has not been stamped yet.
    await expect(seedApprovedPolicy(VENUE_DOOR, { reviewedBy: 'editor@familypilot' })).rejects.toThrow(
      /already-stamped human approver/,
    );
  });

  it('accepts an identity that a real approval already stamped', async () => {
    await seedEvidence();
    const claim = await seedApprovedPolicy(VENUE_DOOR, { reviewedBy: 'human:editor@familypilot' });
    expect(claim.approvedBy).toBe('human:editor@familypilot');
  });

  it('refuses a padded identity rather than tidying it into one', async () => {
    // `humanApprover()` normalises at the point a person approves. By the time it reaches this
    // writer an identity is either exactly what was stamped or it is not that identity, and
    // refusing is the direction that fails towards not gating.
    await seedEvidence();
    await expect(seedApprovedPolicy(VENUE_DOOR, { reviewedBy: '  human:editor@familypilot  ' })).rejects.toThrow(
      /already-stamped human approver/,
    );
  });

  it('stores only the rules that quote the page', async () => {
    await seedEvidence();
    const claim = await seedApprovedPolicy([
      ...VENUE_DOOR,
      { scope: 'venue', effect: 'excludes', minMonthsInclusive: null, maxMonthsExclusive: 144, statedAs: 'invented', evidenceExcerpt: 'Over 12s are not admitted.' },
      { scope: 'venue', effect: 'excludes', minMonthsInclusive: 60, maxMonthsExclusive: null, statedAs: 'tiny', evidenceExcerpt: 'the' },
    ]);
    expect(claim.valueJson.rules.map((r) => r.statedAs)).toEqual(['Under 4s not admitted']);
  });

  it('refuses a claim in which nothing quotes the page', async () => {
    await seedEvidence();
    await expect(
      seedApprovedPolicy([
        { scope: 'venue', effect: 'excludes', minMonthsInclusive: 48, maxMonthsExclusive: null, evidenceExcerpt: 'Over 12s are not admitted.' },
      ]),
    ).rejects.toThrow(/quotes the page/);
  });

  it('refuses an age-policy claim through the generic claim writer', async () => {
    // There must be no second way in. The generic path takes its provenance from caller-supplied
    // `fieldEvidence`, which is exactly what a hard gate must not rest on.
    const { createApprovedClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
    await seedEvidence();
    await expect(
      createApprovedClaim({
        familypilotPlaceId: id,
        fieldKey: agePolicyFieldKey(sourceUrl),
        value: { rules: VENUE_DOOR },
        fieldEvidence: {
          [agePolicyFieldKey(sourceUrl)]: {
            sourceUrl,
            sourceType: 'official_website',
            confidence: 'high',
            evidence: 'Under 4s are not admitted to the museum.',
            retrievedAt: `${TODAY}T09:00:00Z`,
          },
        },
        reviewedBy: EDITOR,
        draftId: null,
        checkedAt: TODAY,
      }),
    ).rejects.toThrow(/createAgePolicyClaim/);
  });

  it('takes the source type from the stored evidence row, not from the caller', async () => {
    /**
     * The spoof this closes: a real `council_page` evidence row, a claim stamped
     * `official_website`. The foreign key is satisfied and the projector -- which reads the
     * claim's own copy of the provenance and performs no database query -- would treat a
     * second-hand summary as first-party evidence and remove the venue.
     */
    const { saveMetadata } = await import('../../../server/enrichment/_lib/enrichment-store.js');
    const { getConsumerMetadata } = await import(
      '../../../server/enrichment/_lib/consumer-projection.js'
    );

    await seedEvidence({ sourceType: 'council_page' });
    const claim = await seedApprovedPolicy(VENUE_DOOR, { sourceType: 'official_website' });
    expect(claim.sourceType, 'the row decides, not the caller').toBe('council_page');

    await saveMetadata(id, { checkedBy: 'editor@familypilot', minRecommendedAge: 5 }, { syncClaims: true });

    const consumer = (await getConsumerMetadata(id)) as unknown as AgeMetadata;
    expect(consumer.venueAgePolicy?.restrictions, 'a council page may not hold a door').toHaveLength(0);
    expect(consumer.venueAgePolicy?.caveats).toHaveLength(1);
  });

  it('cannot back this venue\'s door with another venue\'s evidence row', async () => {
    const { saveEvidenceRecord } = await import('../../../server/enrichment/_lib/evidence-store.js');
    await saveEvidenceRecord({
      familypilotPlaceId: 'fp-some-other-venue',
      sourceUrl,
      sourceType: 'official_website',
      retrievedAt: `${TODAY}T09:00:00Z`,
      extractedText: PAGE_TEXT,
      fetchStatus: 'ok',
      httpStatus: 200,
    });

    // The row exists and its URL matches; it just belongs to somewhere else.
    await expect(seedApprovedPolicy(VENUE_DOOR)).rejects.toThrow(/No evidence record/);
  });

  it('refuses a wrong-venue row even if the store hands one back', async () => {
    /**
     * The store query is already scoped by venue, and the test above proves it. This proves the
     * second line of defence, asserted against the pure validator so it can be reached at all:
     * if the store ever returned a row for somewhere else -- a mis-scoped query, the Supabase
     * branch this suite cannot exercise, a future refactor -- the writer still refuses. A guard
     * nothing can reach is a guard nothing can prove.
     */
    const { agePolicyProvenanceFrom } = await import('../../../server/enrichment/_lib/claims-store.js');
    const elsewhere = {
      id: 'evidence-elsewhere',
      familypilotPlaceId: 'fp-some-other-venue',
      sourceUrl,
      sourceType: 'official_website',
      retrievedAt: `${TODAY}T09:00:00Z`,
      extractedText: PAGE_TEXT,
      fetchStatus: 'ok',
    };

    expect(() => agePolicyProvenanceFrom(elsewhere, id)).toThrow(/different venue/);
    // ...and the same row IS accepted for the venue it actually belongs to, so the refusal above
    // is about the venue and not about something else being wrong with the record.
    expect(agePolicyProvenanceFrom(elsewhere, 'fp-some-other-venue').sourceType).toBe('official_website');
  });

  it('refuses a door whose excerpt is not in the page that was fetched', async () => {
    await seedEvidence({ extractedText: 'The cafe is open until four.' });
    await expect(seedApprovedPolicy(VENUE_DOOR)).rejects.toThrow(/quotes the page/);
  });

  it('refuses a source the fetcher never actually retrieved', async () => {
    await seedEvidence({ fetchStatus: 'timeout' });
    await expect(seedApprovedPolicy(VENUE_DOOR)).rejects.toThrow(/did not fetch cleanly/);
  });

  it('derives the lifetime and checked date from the row, not from today', async () => {
    await seedEvidence({ retrievedAt: '2026-09-10T09:00:00Z' });
    const claim = await seedApprovedPolicy(VENUE_DOOR);
    expect(claim.checkedAt).toBe('2026-09-10');
    expect(claim.validUntil, 'the 30-day age-policy lifetime, counted from the fetch').toBe('2026-10-10');
    expect(claim.sourceEvidenceId).toBeTruthy();
    expect(claim.fieldKey).toBe(agePolicyFieldKey(sourceUrl));
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

    await seedEvidence();
    await seedApprovedPolicy([
      { scope: 'activity', effect: 'caveat', minMonthsInclusive: 60, activity: 'soft play', statedAs: 'Soft play is 5+', evidenceExcerpt: PAGE_TEXT },
      { scope: 'accompaniment', effect: 'caveat', maxMonthsExclusive: 24, accompaniment: { adultRequired: true }, evidenceExcerpt: PAGE_TEXT },
      { scope: 'ambiguous', effect: 'caveat', minMonthsInclusive: 36, evidenceExcerpt: PAGE_TEXT },
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
