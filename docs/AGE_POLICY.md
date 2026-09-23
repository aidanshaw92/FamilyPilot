# Age policy

How FamilyPilot decides whether a venue's age rules may remove it from a parent's results.

This is the settled model for P0-B2. It is written down here rather than in a pull request because
every future age-rule producer (P0-B3 and anything after it) has to obey it, and because the one
mistake this model exists to prevent — hiding a venue from a family on a rule nobody actually
stated — is invisible when it happens. Nobody reports the day out they never saw.

## The two kinds of age fact

| | What it is | What it may do |
|---|---|---|
| `minRecommendedAge` / `maxRecommendedAge` | The ages a venue *suggests* it suits | Rank and explain. **Never exclude.** Settled in P0-B1. |
| `venueAgePolicy.restrictions` | The venue's **door policy**: "under 4s are not admitted" | Make a venue ineligible |

Confusing the two is the defect this whole area exists to prevent. Advice that quietly becomes a
prohibition empties the catalogue for the families with the youngest children — the families who
have the fewest options to begin with.

## Canonical truth is the claim, not the column

A venue's age policy lives in `venue_claims` as one claim per SOURCE:

```jsonc
// field_key: agePolicy.<sourceKey>
{
  "rules": [{
    "scope": "venue",              // venue | activity | accompaniment | ambiguous
    "effect": "excludes",          // excludes | caveat
    "minMonthsInclusive": 48,      // null = open
    "maxMonthsExclusive": 144,     // null = open
    "activity": "soft play",       // or null
    "accompaniment": { "adultRequired": true, "ratio": "1:4" },  // or null
    "statedAs": "Under 4s are not admitted",
    "evidenceExcerpt": "..."
  }],
  "sourceUrl": "https://…",
  "retrievedAt": "2026-09-21"
}
```

`venue_family_metadata.venue_age_policy` is a **read model** projected from those claims. It is
never written from an editor payload — structurally, not by convention: the projection travels
under a `Symbol` key, which parsed JSON cannot carry, so a typed value has no way to reach the
column. There are two row builders in this codebase, and an earlier revision's string key slipped
past one of them.

### Interval semantics

Half-open `[min, max)`, in **months**, matching the recommendation interval from P0-B1:

- `minMonthsInclusive: 48` admits a child on their fourth birthday, not the day before.
- `maxMonthsExclusive: 144` admits them through the whole of their eleventh year.
- Months, not years, because "under 6 months not admitted" is a real policy and babies are exactly
  the group whole years cannot express.

**A rule carries its own min AND max.** There is no free-floating minimum for another source's
maximum to pair with, so a range no single source stated cannot be composed.

## Scope and effect

A rule is a door only when **both** halves say so:

```
scope === 'venue'  AND  effect === 'excludes'
```

| Scope | May exclude? | What it means |
|---|---|---|
| `venue` | Yes, with `effect: excludes` | The door policy |
| `activity` | No | "Soft play is 5+" — part of a visit, not the venue |
| `accompaniment` | No | "Under 2s must be with an adult" |
| `ambiguous` | No | Scope could not be determined |

A missing, unrecognised or `caveat` effect is **never** promoted, even on a venue scope. Neither is
`effect: excludes` on any other scope. Unknown never excludes, and unclear never excludes either.

## Provenance required for a door

A rule may exclude only if its claim satisfies all of:

- `status = 'active'`;
- `source_evidence_id` is not null — a real evidence row;
- `source_url` is not null, and `field_key = agePolicyFieldKey(source_url)` so identity cannot
  drift from provenance;
- `source_type` is one of the official page types below;
- `confidence = 'high'`;
- `approved_by` is a **human identity** (see below);
- `valid_until >= today` — strictly inside its own lifetime.

Anything short of that projects as a caveat, never a door.

### Provenance is derived, not accepted

`createAgePolicyClaim` is the **only** writer of an age-policy claim, and every field the gate
later reads — venue, source URL, source type, retrieved time, evidence id — is taken from the
stored `venue_source_evidence` row. Nothing the caller passes alongside it is trusted.

A foreign key proves only that *some* evidence row exists. It does not prove the row is for this
venue, this URL, or the source type stamped on the claim — so a caller could attach a genuine
`council_page` row while labelling the claim `official_website`, and the projector, which reads
the claim's own copy of the provenance and deliberately performs no database query, would treat a
second-hand summary as first-party evidence.

Deriving instead of trusting makes that mismatch unrepresentable rather than merely detectable,
and keeps the projector pure. The writer also refuses a row that did not fetch cleanly, and
`createApprovedClaim` rejects `agePolicy.*` keys outright, so there is no second way in.

### Every rule carries its own proof

`evidenceExcerpt` lives on the **rule**, not the claim. A claim-level excerpt would let one
genuine quotation vouch for every rule beside it — including a second door nobody had read
anywhere, which would then exclude families on the first door's evidence.

A rule is stored, and later surfaced, only if its own excerpt is at least
**15 characters** (the floor `trusted-evidence.js` already applies to an automatically published
fact, pinned by test rather than copied) **and** occurs in the text stored for that page. The
writer drops the rest and refuses the claim if nothing survives; the projector, which has no page
to check against, drops any rule whose excerpt is missing or too short.

This applies to caveats as well as doors. "Soft play is age 5 and over" reaches a parent as a
statement of fact, so unsupported information stays unknown rather than becoming a confident
sentence.

`venue_claims.evidence_excerpt` remains as a summary for the claims UI. It is not the proof for
anything.

### Source types

There is one source taxonomy, `server/enrichment/_lib/source-types.js`, mirroring the CHECK on
`venue_source_evidence.source_type`. A door may stand on the venue's own pages:

`official_website` · `accessibility_page` · `visitor_info` · `faq_page` · `family_page`

`council_page` and `google_provider` state **caveats only**. A local authority page often describes
a venue it does not run, and its age wording is usually a summary rather than the door policy; for
the one fact that removes a venue, a second-hand summary is not enough. Where a council genuinely
is the operator, the venue's own page under that council's domain is an `official_website` and
gates normally.

### Human approval

`server/enrichment/_lib/approval-actors.js` answers "was this a person?" **positively**: an
approver is human when its identity is in the `human:` namespace, and nothing else is.

This replaced `approvedBy !== 'ai_auto_approved'`, which was a denylist of one, while the repo runs
a second automatic approver (`source_evidence_auto_v2`) and stamps an unattended default
(`enrichment-admin`) whenever a request names no reviewer. Both passed that test.

Two consequences, stated rather than discovered later:

- A new automated actor added tomorrow cannot gate. Nothing has to remember to list it.
- Until a producer stamps `human:<id>`, no age-policy claim gates at all. That is the fail-open
  direction: venues stay visible.

**`createAgePolicyClaim` never stamps.** `humanApprover()` prefixes any value it does not already
recognise as a robot, so calling it inside the writer would mint `human:some_new_worker_v9` for a
new automated producer and hand it a gating identity nobody listed. Stamping belongs at the
boundary where a **person** actually approves something; the writer takes `isHumanApprover` or
refuses. B3 and B4 must never call `humanApprover` merely because a worker is creating the record.

This is **not** an authentication control. The enrichment API sits behind one shared admin token,
so a caller holding it can assert any reviewer string. The rule stops an automated path inside this
codebase from gating by accident; it does not prove the person.

## Lifetime

Age-policy keys get the **30-day** lifetime, not the generic 90 — they are the only facts that
remove a venue, so they must be re-read often. Mirrored in `trusted-evidence.js` and
`claim-freshness.js`; change both together.

- `fresh` / `refresh_due` → may exclude
- `stale` (grace) → **must not exclude**; unknown, with a caveat
- expired → unknown
- no lifetime recorded → cannot gate, and cannot earn grace

Grace exists so a fact survives a transient fetch failure for display. A door that outlives its
evidence hides venues from every family on a policy nobody has re-read.

## Multiple rules, and disagreement

These are different questions, and conflating them broke an earlier revision.

**Within one source, several doors are several doors.** "Under 4s not admitted" *and* "over 12s not
admitted" are two real restrictions. `restrictions` is a list and a child must satisfy **every**
entry; the family is excluded if **any** child violates **any** door. A single scalar interval
could not represent this at all.

**Between sources, difference is disagreement.** If two gating sources state different sets of
doors, nothing gates: `restrictions` is emptied, `sourcesDisagree` is set, both sides survive as
caveats, and the parent is told the sources disagree. Picking a side would invent a policy neither
stated. Sources stating the identical set simply corroborate.

**Doors that together admit nobody** (say "12s and over only" alongside "under 4s only") are a
transcription error rather than a venue that turns every family away, so they explain instead of
excluding — the same ruling `normaliseAgeRules` already applies to a single inverted rule.

## Claim identity

`agePolicy.<sourceKey>`, where `sourceKey` is 128 bits of SHA-256 over a canonical form of the
source URL — and **only** the URL, never the value or the evidence text, so re-reading a page
supersedes that page's claim while other sources keep theirs.

Canonicalisation is deliberately conservative, because this identity decides what **supersedes**
what. Two sources that should have been one stay two, disagree, and fail open — a venue nobody
excluded. One identity that should have been two silently replaces a source's policy and leaves
the survivor standing as an unopposed door. Only the second hides venues from families.

So it normalises the **case** of the scheme and host (both case-insensitive per RFC 3986), the
default port for whichever scheme it is, and the fragment. It does **not** normalise:

- `http` vs `https` — they can serve different content. Deciding that a site moved to https is a
  job for a producer that followed the redirect, not for a function looking at a string.
- the case of the path or query — `/Policy` may be a different document from `/policy`.
- a trailing slash — nothing in this codebase promises `/x` and `/x/` are the same fetched
  resource (`findEvidenceRecordBySourceUrl` matches `source_url` exactly), so they are two
  evidence rows and must be two claim identities.

The digest must be collision-resistant, not merely short. Active-claim uniqueness is per
`field_key` and `replaceActiveClaim` supersedes that key's row — so a collision would not fail open,
it would silently delete one source's policy and leave the other standing as an unopposed door.

## Caveats reach the parent

`caveats` is not debug data. Activity, accompaniment and ambiguous rules, non-gating venue rules,
and the disagreement flag all survive through `getConsumerMetadata()` to the places APIs, and
`describeAgeCaveats()` renders them into the caveats a parent reads on a recommendation. "Soft play
is age 5 and over" is worth knowing before driving there, and it is not a reason to hide the venue
from a family with a three-year-old who will enjoy the rest of it.

## What this model cannot say (open for B3)

There is no way to record an explicit **positive** statement — "all ages welcome", "no age
restrictions". An empty rule set means *nothing was found*, which is not the same as *a source
said there is no restriction*, and the difference matters once publication is automatic: absence
should stay quiet, while a positive statement could legitimately corroborate.

B2 is deliberately not expanded for this. **B3's zero-write audit scanned for exactly this**, and
the answer is in [AGE_EVIDENCE_AUDIT_B3.md](AGE_EVIDENCE_AUDIT_B3.md): only **2 statements across 2
venues** state a positive position about admission. That is not enough to justify extending the
canonical model, so no `all_ages` fact is recommended for B4. The audit keeps counting it.

That audit also found that **no venue-level age prohibition exists in the catalogue's stored
evidence at all**, so the gate described above is currently correct and idle.

## Where the rules live

| Concern | File |
|---|---|
| Projection, provenance, conflict | `server/enrichment/_lib/age-policy.js` |
| Human-approval rule and actor registry | `server/enrichment/_lib/approval-actors.js` |
| The only age-policy writer | `createAgePolicyClaim` in `server/enrichment/_lib/claims-store.js` |
| Source taxonomy | `server/enrichment/_lib/source-types.js` |
| Lifetime | `server/enrichment/_lib/trusted-evidence.js`, `claim-freshness.js` |
| Matching and parent-facing wording | `familypilot/src/services/matching/age-admission.ts` |
| Read-model shape guard | `familypilot/supabase/migrations/20260921120000_venue_age_policy.sql` |
| Database assertions run in CI | `familypilot/supabase/checks/venue_age_policy_shape_check.sql` |
| Tests | `familypilot/src/__tests__/age-policy.test.ts`, `age-admission.test.ts` |
