# Tranche C: indoor play, twelve entries for review

**Status: UNREVIEWED. Nothing here is served, imported or signed off.** The registry refuses every entry in this folder as it stands (`reviewedBy` says it is unreviewed); `server/places/data/identities/fhrs.json` is still empty on every branch; a reviewer puts their name on a release by replacing that field, and this work never does.

Approved scope (14 October): the nine currently defensible venues plus the three 0–5 play cafés. Classification and identity each rest on two independent sources, and no fact comes from a food registration.

## What is in `tranche-c.entries.UNREVIEWED.json`

| Shown as | Stored category | Venues |
|---|---|---|
| **Soft play** (the operator describes a soft-play facility) | `soft_play` | Gambado Chelsea · Abuela Play Café (Coulsdon) · Halo Play Café (Uxbridge) · Little Peeps Soft Play (Chessington) · Moo Moo's Play Café (Cobham) |
| **Trampoline park** | `activity` | The Jump Zone Beckton |
| **Trampoline park with soft play** | `activity` | Flip Out Brent Cross |
| **Climbing centre** / **with a soft-play area** | `activity` | Clip 'n Climb at The O2 · Clip 'n Climb Croydon |
| **Play café** (0–5 or 0–6, no soft play stated) | `activity` | Cheeky Chops (Twickenham) · Dreami (Hackney) · Raffy's (Beckenham) |

The visible label and the soft-play distinction live in Explore's classification (draft PR #221), not in the entry: an entry holds only a name, a stored category, where it is and where that was read.

## Each entry rests on

1. **The Food Standards Agency's record** (Open Government Licence v3.0): that a food business of this name exists at this address, and its position. Entry `identity.source` and `location.source` are both `fhrs`; the address is the FSA's own record of the establishment.
2. **The operator's own website**, read once: it names the venue and shows the same postcode. Every quoted line in `EVIDENCE.md` was checked to appear word for word on the page named.
3. **A position check**: each FSA position lies within 125 m of the centre of its own postcode (median under 60 m), which is what a correct position at a unit address looks like. The postcode lookup was used only to check; nothing from it is stored.

## What these entries do not say

No opening hours or current opening status, accessibility, baby changing, price, or age limit beyond what a venue wrote about its own sessions or equipment (shown as "its own page"). A food registration is never evidence of what a venue offers or whom it suits. No social media was read. No Google content is in this folder (checked: zero matches for Google hosts or place ids).

## Excluded and held

| Venue | Why | Next step |
|---|---|---|
| Air Jump Orpington | Temporarily closed | Excluded until it reopens |
| Wacky Kingdom Kingston | Its site names the venue but does not show the FSA's postcode, and it runs two sites | Held: address to be confirmed |
| Flip Out Canary Wharf | The pages tried for it did not answer, so its address is uncorroborated | Held |
| Flip Out Croydon | Its page names the venue but does not show the FSA's postcode | Held |
| The remaining candidates with no website found | An FSA registration alone cannot carry a classification | Not included; counts in `docs/SOFT_PLAY_TRANCHE_C_FINDINGS.md` |

## Three things a reviewer should look at first

1. **Moo Moo's Play Café** has the thinnest evidence: the fetch recovered only the page title, "Soft Play in Cobham", which the operator wrote. No body text was readable.
2. **Flip Out Brent Cross** describes "a huge range of soft play options for all ages", meaning inflatables and free-fall as much as a toddler area. It is shown as a trampoline park first. Decide whether it should lead a "Soft play" search or sit with the related results.
3. **Cheeky Chops** has no website link because its site answers over http only and the registry accepts https only.

## Checks run (14 October)

- Registry rules, run on a copy with the rehearsal marker: 12 of 12 pass; as shipped 0 of 12 are served; with the rehearsal marker none is served in production.
- File rule: all twelve belong in `fhrs.json` and nowhere else.
- Quotes: every one found verbatim on its page.
- No Google host, id or field anywhere in the folder.

## Source files

FSA extract, operator pages and the postcode check are on the throwaway branch `data/open-data-fetch`, `results/softplay/` (`fhrs-london.json`, `operators.json`, `operators2.json`, `operators3.json`, `postcode-check.json`). Attribution when served: "Source: Food Standards Agency. Contains public sector information licensed under the Open Government Licence v3.0." (supported by #219).
