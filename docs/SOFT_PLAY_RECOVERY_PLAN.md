# Restoring genuine soft-play coverage

14 October 2026. A plan, with the one measurement it rests on. Nothing is imported or served; no Google request was made. The plan runs beside Tranche A and does not hold it up.

## The gap is bigger than six rows

The catalogue holds six venues filed as "soft play". **None is a toddler soft-play centre**: they are three Flip Out sites, two AirHop trampoline parks and an amusement-arcade complex. So genuine soft-play coverage today is **zero**, and the six rows, which will expire from about 8 November, are not what a parent searching "soft play" is looking for. Tranche A carries none of them (its sources, OS Open Greenspace and Wikidata, hold no soft play and almost no activity venues). The seven stored "activity" venues (an ice rink, two bowling alleys, a water park, a winter fair, a theme park and a park filed wrongly) are likewise not in Tranche A.

## What an open source can name, measured

The Food Standards Agency's Food Hygiene Rating Scheme (FHRS) publishes every food business in England, with its trading name, address, postcode and coordinates, as open data under the Open Government Licence v3.0. A soft-play centre with a café is registered there. On 14 October a GitHub runner searched it, once, politely (about 40 searches, GET only) for establishments inside the app's 40 km scope whose **name** says a play venue, and the result is saved on the throwaway branch `data/open-data-fetch` (`results/softplay/fhrs-london.json`, with its licence). After setting aside nurseries, schools, theatres ("Playhouse"), parent-and-toddler groups and food shops that happen to share a word:

| What the name says | In scope | Of which Greater London | Examples of the kind of name |
|---|---:|---:|---|
| Soft play or play café / centre / zone | **31** | **18** | "… Soft Play", "… Play Cafe", "Gambado", "… Play Centre" |
| Trampoline or jump park | 14 | 8 | Flip Out (five sites), Air Jump, Jump In by Air Hop, The Jump Zone, Jump City |
| Climbing | 2 | 2 | Clip 'n Climb (two sites) |
| Bowling alleys and laser tag | about 12 | about 7 | Hollywood Bowl, Laser Quest |

These are names, not verdicts. A food registration says a business serves food at that address; **it does not say that the venue is open, that it is a soft-play centre in the sense a parent means, or who it suits.** The 31 are candidates.

## The rules (written before any venue is added)

1. **Identity and position come from an open source with a licence we can credit**: FHRS (OGL v3.0) for the name, address and coordinates, or, for a venue FHRS does not have, the venue's own website for the name and address with the position from a postcode lookup (the ONS postcode directory, OGL), marked as an area-level position.
2. **Classification comes from the operator's own words, quoted.** A venue is "soft play" only if its own website uses soft-play wording and is not mainly a trampoline park, a climbing wall or an arcade. A trampoline park stays an activity and is labelled one; Explore already keeps "soft play" and "trampoline parks" apart (`venue-classification`). An arcade, bowling alley or laser-tag centre is an activity, not soft play.
3. **No age, facility or opening status is stated unless the operator's page says it**, and then it is quoted with its source. "Ages 0 to 5" is shown only where the venue wrote it. Everything else stays "not yet checked".
4. **A registration is not evidence of being open.** Every candidate is read once on its own site (robots.txt honoured, one request, the same tooling as `site-check`), and a venue whose site does not answer, or says it has closed, is held, not listed.
5. **A person reviews a sample before anything is served**, as with Tranche A, and nothing here writes a reviewer.

## Steps and dates (all before 1 November)

| When | Step | Needs from you |
|---|---|---|
| Now to 17 Oct | Read the FSA's open-data licence and attribution wording from the FSA (rendered, as the OS licence was) and add FHRS to the registry as a third open source, with its credit, notice, provenance rule and tests. Same checks as OS and Wikidata. | nothing |
| 17 to 21 Oct | For each candidate, find the operator's own website (from the name and postcode), read it once, and record the wording that classifies it and any age or hours it states, quoted. Venues that fail rule 2 or 4 are listed with the reason. | nothing |
| 21 to 23 Oct | Tranche C review pack: expected 12 to 20 soft-play venues and 10 to 15 trampoline and other activity venues, a sample of 20, exceptions with a recommendation each. | your sample review |
| With the final Tranche A approval | Add Tranche C to the Preview and release it with Tranche A if approved, or after it. | final approval |

**Expected outcome:** genuine soft play from nothing to roughly 12 to 20 venues, and the activity group (which Tranche A leaves at zero) back to roughly 15 to 25, depending on how many sites answer and say what the name suggests. That is an estimate from names, not a promise: it will be re-stated after the site reads.

## What does not change

Tranche A is not waiting on this. Tranche B (OpenStreetMap), which also holds indoor-play and activity entries, is not used here: OSM data is not read to find these venues, so none of this depends on the OSMF's answer. If FHRS turns out not to be usable (its licence wording, or too few answering sites), the fallback is operator websites alone, with positions from the postcode directory, which gives fewer venues and approximate positions, and I would report that rather than widen the sources.

## What a parent sees in the meantime

Explore (#203) already says plainly when a category has little or no coverage and why, and it does not list a trampoline park under "soft play". Until Tranche C is released the Soft play chip shows that message instead of six venues that were never soft play.

Not legal advice. Source data © Crown copyright and database right; Contains public sector information licensed under the Open Government Licence v3.0.
