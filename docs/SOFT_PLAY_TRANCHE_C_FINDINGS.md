# Tranche C: what the operators' own websites say (first read, 14 October 2026)

Nothing here is imported, served or reviewed. It is the first measurement of how many soft-play, trampoline and climbing venues can be named **and** checked against the operator's own site, so the plan's estimate can be corrected before the review pack is built. No reviewer is recorded and none will be until you approve a final set.

## How it was read

49 candidates: 9 chain sites whose address I found by search (Gambado, Flip Out ×3, Clip 'n Climb ×2, Air Jump, The Jump Zone, Wacky Kingdom) and 40 independent play cafés and soft-play centres from the Food Standards Agency register (FHRS, identity only; see #219). A GitHub runner read each site's front page and up to six linked pages **once** (GET only, robots.txt honoured, an identifying User-Agent, two seconds between requests, at most eight pages per host, no search engine, no social network, no login). For the 40 independents the address of the site was **guessed from the venue's name** and accepted only if the site named the venue **and** showed the venue's own FHRS postcode; otherwise nothing was recorded. The extracts are on the throwaway branch `data/open-data-fetch` (`results/softplay/operators.json`, `operators2.json`).

## Result

| | Venues |
|---|---:|
| Candidates read | 49 |
| Operator site found | 16 (13 name the venue **and** show its postcode; 3 name it only) |
| **Defensible now** (identity, classification and position all supported) | **8** |
| Held for a small check (a missing postcode or a second page) | 4 |
| Held for your classification decision (play cafés that never say "soft play") | 3 |
| Held because the venue says it is closed | 1 |
| **No website found** by guessing (most likely trade on Instagram or Facebook, which are not read) | 33 |

## The 8 defensible now

The category is the operator's own wording, not the registration's. Ages are quoted only where the venue wrote them; everything else stays "not yet checked".

| FHRS | Venue | Postcode | Proposed | The operator's own words (page) |
|---:|---|---|---|---|
| 346104 | Gambado, Chelsea | SW6 2PY | **soft play** | "London's Best SOFT play centre!"; "U4's Area: A safe soft play zone just for our tiniest visitors, including a baby area." (gambado.com, gambado.com/play: "Soft Play Fun for Ages 0–17") |
| 1691253 | Abuela Play Café, Coulsdon | CR5 2RA | **soft play** | "...catch up with friends while your little ones enjoy the amazing soft play zone!" (abuelaplaycafe.co.uk/about); session "Ages 9 months to 6 years | Max 2 hrs" (/events) |
| 1367047 | Halo Play Café, Uxbridge | UB8 1GB | **soft play** | Pages titled "Soft play & dining"; "What age is the soft play suitable for? The play equipment is suitable for ages 0 to approx." (haloplaycafe.co.uk/play-booking; **the number was cut off by my sentence splitter, so no age is recorded until re-read**) |
| 1532159 | Little Peeps Soft Play, Chessington | KT9 1NU | **soft play** | "Jungle-themed soft play, with play areas specifically designed for our 2-year-olds and under and a larger play area"; "We recommend our soft play for children up to 8 years old." Also bowling and gaming (littlepeepssoftplay.com) |
| 1935590 | The Jump Zone, Beckton | E6 6LA | **activity** (trampoline park) | "Toddler Takeover: Weekday term-time session for under-5s, 9am-12pm."; "Children under 4 must be supervised." (thejumpzone.com) |
| 1434379 | Flip Out, Brent Cross / Staples Corner | NW2 6LW | **activity** (trampoline park) | "North London's Ultimate Indoor Trampoline & Adventure Park!"; also "a huge range of soft play options for all ages, plus trampolines" (flipout.co.uk/locations/brent-cross) |
| 1857771 | Clip 'n Climb at The O2 | SE10 0DX | **activity** (climbing) | "Our standard sessions are suitable for ages 4 to 104 and we have Mini Mountaineer sessions for children aged 2 to 4" (theo2.clipnclimb.co.uk/facilities) |
| 1937580 | Clip 'n Climb, Croydon | CR0 1NB | **activity** (climbing, with a soft-play area) | "Mini Mountaineer sessions ... especially for toddlers aged 2 to 4"; "Soft Play EVERY DAY. Our colourful soft play area..." (croydon.clipnclimb.co.uk/sessions) |

## Held, and why

| Venue | Why held | What would release it |
|---|---|---|
| **Air Jump, Orpington** (963064) | Its own front page says "Our facility is temporarily closed until further notice" | Nothing; the registration alone would have listed a closed venue |
| Wacky Kingdom, Kingston (1560271) | Small check. Operator says "fun soft play centres in Kingston and Redhill, suitable for all children aged 12 years and under" and has a "Baby Zone"; **its postcode is not on the pages read** (the footer was not in the first pass) | One more page read for the address |
| Flip Out, Canary Wharf (1711686) | Small check. Operator says "soft play options for all ages", "Toddler Soft Play", Laser Quest, bumper cars, and "does not have any trampolines"; postcode not on the pages read | The address page; then it is a **soft play** candidate, or an exception (see below) |
| Flip Out, Croydon (1764457) | Small check. Only one page answered | A second page |
| Cheeky Chops Play Café, Richmond (1961932) | "play café ... for children aged 0-5 years"; the site read never says "soft play" | Your decision on play cafés (below) |
| Dreami Play Café, Hackney (1677302) | "a play café where children aged 0–6 can explore, imagine and connect through open-ended play"; FAQ "designed for children aged 0-6 years"; no "soft play" wording | Same |
| Raffys Play Café, Bromley (1756533) | "a role play cafe for under 5's": role play, not soft play | Same |
| Moo Moo's Play Café, Cobham (1836741) | Small check. Title "Soft Play in Cobham"; only the title was captured. Cobham is inside the app's 40 km area | A second page |

## Decisions this needs from you (none urgent; defaults shown)

1. **Play cafés for 0–5s that never say "soft play"** (Cheeky Chops, Dreami, Raffys). Default: list them as **activity**, labelled with the operator's own words ("play café", ages 0–5 as quoted), not under the Soft play chip. They are exactly what a parent with a toddler wants, but your rule is that the operator's wording classifies. If you would rather they sit under Soft play, say so.
2. **Mixed venues** (Flip Out, Clip 'n Climb Croydon): trampoline or climbing first, soft play as one attraction. Default: **activity**, with the soft-play area stated in its description. Flip Out Canary Wharf, which says it has no trampolines, would be **soft play** if its own soft-play page confirms toddler soft play.
3. **What to do about the 33 with no website.**

## The estimate, corrected

The plan said "roughly 12 to 20 genuine soft-play venues and 15 to 25 activity venues". Measured: **8 defensible now, about 12 after the four small checks, up to 15 if the three play cafés are included**: soft play about 4 to 7 and activity about 5 to 8, well short of that. The reason is not the register (it names 183 plausible play venues in scope) but **verification**: most independent play cafés have no website of their own that I can find by name, and I will not list a venue whose existence, position or opening I cannot check against the operator.

What could widen it, each without relaxing the rule that the operator's own words classify:

- **Tranche B (OpenStreetMap) has indoor-play and soft-play entries.** If the OSM Foundation's answer allows the combined data to be served, it is the quickest way to cover most of the 33, and each would still need its own site read or a stated "not yet checked" label. This is the strongest reason to send the licensing question now.
- **A list from you.** Ten play cafés you know, with their sites, would be read the same way in minutes. I would not take them from Instagram or Facebook.
- **A second discovery pass** with more name variants (cheap, low yield).
- **Listing venues on the register alone, labelled "details not yet checked"**, as Tranche A does for parks. I do not recommend it for play venues: a registration is not evidence that the venue is open, and Air Jump shows why.

Not legal advice. Contains public sector information licensed under the Open Government Licence v3.0 (FHRS identity). Operator wording is quoted briefly with its source and is each operator's own.
