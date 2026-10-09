# Pilot method, exception review and parent confirmation

Status: pilot, 2026-10-08. Nothing here writes to production. Companion to `docs/PILOT_10_PROFILES.md`.

## How a profile is built

1. **Layer A (existing data).** Name, coordinates, address and opening hours already held from the provider. No new Google call was made. Provider text is never committed; the demo reads it from a local file.
2. **Layer B (official pages).** A bounded reader on a GitHub runner (the authoring container has no outbound web) reads the venue's own site: the homepage plus up to eight pages its own links point to, one request per URL, a pause between requests, no retries, no guessed paths, PDFs listed and not fetched. A refusal (HTTP 403) ends that venue's reading; nothing works around it. A second, smaller reader follows only links found on pages already read, within a request budget, and only to hosts named in the gap list.
3. **Authoring.** Each fact is written with the venue's own sentence, the page it is on and the day it was read. Statuses are **fact** (the sentence states it), **hypothesis** (a reasonable inference with its basis, never shown as a fact) or **unknown** (the pages do not say).
4. **Mechanical verification.** `build-profiles.cjs` stops the build if any quoted sentence is not found on the stored page it cites. Every one of the 171 facts that quote a sentence read today passed. One more fact is carried from an earlier reading and marked as such; it is never counted as verified today. The other 22 facts are unknowns and hypotheses, which quote nothing. Each page's hash is recorded, so a later reading shows exactly which sentences changed.
5. **The gate.** `profile-lib.cjs` decides, by rules and not judgement, whether a fact may be accepted without a person.

## The gate: what is accepted without a person

A fact is **verified** (no person) only if all hold: its sentence is found verbatim on a page of the venue's own site; the page was read within 14 days; it is a plain, positive statement of a fact type on the allow-list (toilets, baby changing, café, picnic, playground, buggy storage, transport, Blue Badge parking, typical duration, supervision rule, opening hours, or an activity that names no age); it carries no conditional, temporary or dated wording; it covers the whole venue; it conflicts with nothing.

Everything else goes to a person, with the reason shown: any price or free-entry claim, any accessibility claim, any activity that names an age, any negative claim (it can exclude a venue), any conditional or dated wording, any claim about part of a venue, any conflict.

Two further rules sit outside the gate. A **held** fact (two official statements disagree, for example Discover's under-1 ticket terms) is never counted, even if every other proposal is approved. A **provider conflict** (for example Google showing London Zoo open until 5pm every day when the zoo closes at 4pm from 24 October) is resolved in favour of the venue's own page, and a person sees it.

## Measured result for the ten venues

194 facts: 84 verified without a person (43%), 85 proposed for a person (44%), 21 unknown (11%), 4 hypotheses (2%). Why the 85 need a person:

| Reason | Items |
|---|---|
| Not on the allow-list (pushchair rules, closures, fees, notices) | 26 |
| Accessibility claim | 20 |
| Conditional, temporary or dated wording | 16 |
| Price or free entry | 12 |
| Negative claim | 11 |
| Names an age | 10 |
| Part of the venue only | 6 |
| Conflict (page title, provider hours, FAQ, stale notice) | 9 |
| Carried from an earlier reading | 1 |

Items can carry more than one reason. The largest bucket is a gate setting, not a finding: several of those 26 (parking fees, pushchair hire, a closure notice) could be accepted without a person once their wording is pinned by tests. That is a tuning decision to make deliberately, not here.

## The exception queue

`scripts/pilot/review-queue.cjs` writes `docs/pilot/review-queue.json`. Each item shows the exact sentence, the URL, the reading date, the proposed meaning and the reasons. The reviewer approves, rejects or marks it unknown. A published review page (see the report) carries the same items with a timer per card and exports the audit trail.

**Audit trail** (append-only, one JSON object per line, written by the review page):

```
{"factId":"…:toilets.babyChanging","venue":"…","field":"…","decision":"approve|reject|unknown","reviewer":"…","decidedAt":"ISO","secondsOnCard":14,"sentenceUrl":"…","readOn":"2026-10-08"}
```

A decision is never edited; a later decision is a new line. A fact approved here still needs a separate, explicitly approved step to become a production claim.

## Review time

Measured: the number of items and the words a person reads, per venue (`review-queue.cjs`). Estimated, not measured: the time. At 3.5 words a second plus 6 seconds per decision the ten venues take about 26 minutes (1.2 to 5.2 minutes a venue, 85 items). A reviewer who opens the source page for every non-obvious item will take two to three times that. The only real figure comes from the review page's own timers, which need a person.

## Layer C: parent confirmation (design only)

The product already holds the foundation: visit observations with reconciliation rules R1 to R5 (`server/feedback/_lib/rules.js`). The pilot needs no new rule. What it adds:

- **Where it attaches.** Only to facts the profile marks unknown or proposed. The existing question priority already asks unknown fields first, so the pilot's 21 unknowns become the question queue (for London Zoo, baby changing; for Gunnersbury, baby changing and playground).
- **Kept distinct.** A parent report is shown as parent-reported, never as operator-confirmed, and never raises a verdict (rule R4).
- **Conflicts.** A report that contradicts an official claim made on or after its check date puts the field in "needs a recheck" and shows unknown until a source check (R3). Two or more independent households agreeing is "corroborated", still not official. One report is a lead (R4).
- **Fields to add** for the pilot's gaps: playground present, shade, pushchair rules in play areas (Discover), and queue or booking reality. Each needs the same closed-answer form, with "did not check" always available.
- **What it must never do.** Overwrite an official claim, create an age range, or turn silence into "no" (R5). Household privacy and Connected Families consent are unchanged.

## Scaling to 50

See `docs/PILOT_10_PROFILES.md`, section "Scaling to 50".
