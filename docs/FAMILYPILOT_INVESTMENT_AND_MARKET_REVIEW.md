# FamilyPilot: Investment, Business and Family Product Review

**Date:** 7 October 2026 · **Product reviewed:** `main` at `c6d1edb` (after #164) · **Type:** independent due diligence,
research only. No code, data, infrastructure or design was changed to produce it.

Every statement is tagged by where it comes from:

| Tag | Meaning |
| --- | --- |
| **[Observed]** | Seen directly in the code, in the running app (local fixture builds), or in read-only aggregate queries of the production database on 7 Oct 2026 |
| **[Research]** | External, public source, linked in §13 |
| **[Assumption]** | An input chosen for a model; stated so it can be argued with |
| **[Judgement]** | The reviewer's opinion |

---

## Executive summary

**[Judgement]** FamilyPilot is a carefully engineered, unusually honest *functional prototype* aimed at a real but
moderately painful problem. As of today it has **no users outside the founder's household, no billing, no native app,
and too little verified venue data to deliver its central promise**. The idea is not wrong. What it has is unproven.

- **The thing that would make FamilyPilot special is mostly absent in production.**
  - The promise is "this place will work for *our* family: baby changing, buggy access, the right age, food, toilets".
  - Of 151 real destinations, **89 (59%) carry no confirmed family fact at all**, **0 carry a confirmed age range**,
    buggy access is confirmed for **6**, and a café for **5** **[Observed]**.
  - The Family Fit engine is sophisticated. On real data it mostly says "Not yet reviewed" or "Possible fit · buggy
    access still to be checked".
- **There is no evidence of demand yet.**
  - Production holds **2 accounts, 0 post-visit reports, 0 Connected Family links and 0 saved planning workspaces**
    **[Observed]**.
  - 298 commits, about 60,000 lines of application code, 2,636 automated tests and 64 design documents were produced in
    about 9 weeks. None of that is product–market fit.
- **The usage is episodic, and monthly pricing fits that badly.**
  - UK families report about seven "big" days out a year **[Research]**.
  - Local, low-stakes outings (the park on Saturday) are frequent but need little planning.
  - A £4.99/month subscription fits poorly. The direct incumbent, Day Out With The Kids, charges **£29.99 a year**
    (often discounted to £9.99) for a discount membership on top of a free, 7,500-attraction directory **[Research]**.
- **The platforms are closing in.**
  - Google Maps launched Gemini-powered **Ask Maps** in March 2026 and expanded it to 150+ countries in August
    **[Research]**.
  - ChatGPT has about 900m weekly users **[Research]**.
  - "Find a buggy-friendly place near me with baby changing and a café" is now an everyday query for those products.
  - FamilyPilot's only durable edge over them is **verified, family-specific venue truth plus the family's own context**.
    That is the part that is currently thinnest.

**Investment decision: WAIT FOR USER EVIDENCE.** Confidence in that decision: 75%. Probability that FamilyPilot as
currently conceived becomes venture-scale: low (≈3–5%) **[Judgement]**.

**Founder recommendation: YES, but only through a tightly controlled 90-day validation phase.** That means narrowing to
under-5s in a few London boroughs, verifying the top 50–100 venues by hand, recruiting 40–60 real families, measuring
weekend-over-weekend return and pre-paid intent, and setting written kill criteria now (§11).

---

## 1. The product as it actually exists

### 1.1 How this was examined

- **[Observed]** I read the code on `main`: about 60k lines across `familypilot/app`, `src`, `server` and `api`; 169 test
  files; 64 documents in `docs/`.
- **[Observed]** I ran the web build locally against the realistic and sparse fixture catalogues, using the project's
  browser journeys at 360–430 px. These cover Home, Explore, Venue Detail, Create a plan, the generated plan, saving,
  View plan, calendar export, Halfway with its map, Plans and Saved places, onboarding, account, Connected Families and
  post-visit. Most of these were exercised repeatedly during the last three engineering passes, with screenshots in
  `docs/decision-completion/`, `docs/stable-personalisation/` and `docs/product-coherence/`.
- **[Observed]** I queried the production database for aggregate counts only. No personal records were read.
- **Not observed:**
  - the production site on a real phone (this environment cannot reach it);
  - any App Store listing (none exists);
  - any real user other than the founder.

### 1.2 What genuinely works today (**[Observed]**)

| Area | State |
| --- | --- |
| Onboarding | A family profile (parents, children with date of birth or age, buggy or sling, naps and feeds, home postcode). Children's details stay on the device. Takes a few minutes. |
| Home / Explore | Live London catalogue (Google Places plus a stored catalogue of **168** places), ranked by a family-specific score. Since #164 the ranking is stable through the day and not driven by routines. |
| Family Fit | A rigorous, evidence-gated verdict (excellent / good / possible / poor / not reviewed) that never turns "unknown" into "yes". Names children only where a fact is about them. |
| Venue Detail | Family Fit, today's opening state, Create a plan, "What to know", food nearby (OpenStreetMap), evidence and provenance. |
| Create a plan → Plan | Arrival, length of visit, who's coming, lunch, routine clashes with verified alternatives ("Best option: arrive around 10:00"), save, View plan, Add to calendar (.ics). |
| Halfway | A tab: two families' approximate areas, a fairness-scored shortlist from the stored catalogue, a free bundled map. |
| Connected Families | Consent-based sharing of a coarse area and optional routines between two households. Requires accounts. |
| Post-visit | "Did you go?" questions that can dispute or corroborate venue facts. |
| Evidence pipeline | Fetches official venue pages, extracts facts sentence by sentence with quotes, approves them, expires them and quarantines conflicts. |
| Engineering hygiene | CI, visual regression against Figma, Google spend caps, privacy model, 2,636 tests. |

### 1.3 What is mocked, incomplete or missing (**[Observed]**)

- **No monetisation:** no paywall, trial, billing, RevenueCat or Stripe. £4.99/month is a hypothesis in this brief, not
  in the code.
- **No native app:** no `eas.json`, no iOS bundle identifier. The product is a web app on Vercel ("Add to Home Screen").
  App Store acquisition, a native calendar and push notifications all depend on a build that doesn't exist yet.
- **Hidden legacy surfaces** behind a flag: Need Something Now (mock inventory), Holiday planner (mock), Packing list
  (static), Car fit (mock), restaurant browsing (mock), Concierge.
- **No preference learning** yet (Step 4 of the roadmap).
- **Saved places and the family profile are device-only.** They don't sync across devices unless the parent signs in
  for backup.
- **Tests run against synthetic fixture catalogues.** The fixture is richer than production (every fixture venue has an
  age range; no production venue has one).

### 1.4 The data reality (**[Observed]**, production, 7 Oct 2026)

| Measure | Value |
| --- | ---: |
| Stored places (London only) | 168 (70 parks, 42 museums, 12 attractions, 8 farms, 7 activities, 6 soft play, 6 zoos, 17 food) |
| Destinations with **zero** confirmed family facts | **89 of 151 (59%)** |
| Destinations with ≥ 2 confirmed family facts | 32 (21%) |
| Destinations with ≥ 4 confirmed family facts | **2** |
| Confirmed age range | **0** |
| Buggy access confirmed | 6 |
| Baby changing confirmed | 23 |
| Café on site confirmed | 5 |
| Active facts approved by a human editor | 4 of 183 (the other 179 auto-approved from official-page text) |
| Disputed / quarantined facts | 121 |
| Post-visit reports from parents | **0** |
| Connected Family links / planning workspaces / invites | **0 / 0 / 0** |
| Accounts | **2** |
| Google Places bill, September 2026 (development traffic only) | £104.11 (per `GOOGLE_PLACES_COST_CONTROL.md`) |

The project's own audits say the same, candidly. `EVIDENCE_COVERAGE_AUDIT.md` reports that **28% of venues have no
usable official page at all** (missing website, Cloudflare challenges, 404s), and that council parks rarely publish
facility details. Silence on a venue's own website is the norm, not the exception.

### 1.5 Impressive in code, weaker as a parent (**[Judgement]**, grounded in **[Observed]** facts)

1. **Family Fit.**
   - *In code:* a careful, multi-child, evidence-only verdict with per-child naming.
   - *As a parent with today's data:* "Possible fit" or "Not yet reviewed" on almost every card, plus "Buggy access
     still to be checked for Ozzie's buggy".
   - The honesty is admirable. It also means the app often tells you what it *doesn't* know.
   - "Good for Sloane's age" cannot appear on any real venue, because no age range exists in production.
2. **The evidence pipeline.**
   - *In code:* elegant (quotes, provenance, expiry, quarantine).
   - *As a parent:* the coverage it produces is thin, and 98% of the facts it serves were approved automatically.
   - This is the right architecture but not yet a data asset.
3. **The learning loop (post-visit reports).**
   - Fully built, with **zero** reports.
   - The flywheel exists on paper only; its viability is unknown.
4. **Connected Families and Halfway.**
   - Technically excellent and privacy-conscious.
   - Requires both families to have accounts and set up profiles. **No connection has ever been made in production.**
   - The parent experience of "invite another family" is an untested cold-start.
5. **Routine-aware planning.**
   - Genuinely distinctive for families with a baby, and now correctly placed after Create a plan.
   - But it's an advanced step most parents may never reach in a first session.
6. **Food nearby.**
   - Free and fast.
   - Until recently it described a café inside the park as a "1 min drive". It can't yet say "on site" or "lots of
     places to eat around here", which is what a parent actually needs.
7. **Performance.**
   - The founder's iPhone measured 10–12 seconds to the first Home card before the latest fixes. No production
     measurement exists after them.
   - A 10-second first impression is fatal for a consumer app. It has been engineered against, not yet verified on a
     device.
8. **Volume of engineering vs. evidence of need.**
   - Nine weeks of very high-quality engineering, at least 30 passes of polish, and no user research artefacts beyond a
     testing guide whose questions still refer to the mock "Need Now" and "Car fit" screens (`PARENT_TESTING_GUIDE.md`).

---

## 2. Independent review panel

### A. Consumer-technology angel investor

- **Opportunity.**
  - About **8.3m UK families with dependent children** **[Research: ONS 2024]**, and about **595k births a year** in
    England & Wales **[Research: ONS 2024]**.
  - London has about 106k births a year **[Research: GLA/ONS]**, so roughly **0.5m under-5s** **[Assumption: 5 × births,
    net of migration]**.
  - Families spend about £87 per big day out and about £700 a year **[Research: Boundless/Hyundai surveys]**.
  - The *activity* is large; the *software spend* on choosing where to go is small and mostly captured by free media
    (Google, Mumsnet, DOWTK, Instagram).
- **Problem strength:** real but intermittent.
  - Failed outings with a baby are memorable and costly: missing baby changing, steps everywhere, nowhere to eat.
  - Most weekends, parents default to known places. Pain is high on maybe 5–15 "new place" days a year
    **[Assumption]**.
- **Differentiation.** Family-specific, evidence-backed suitability plus routine-aware planning plus two-family meeting.
  Novel as a combination; individually copyable.
- **Defensibility.** Today, none. Potentially a verified, parent-confirmed venue facts graph (see §8).
- **Founder insight.** Strong on the *quality* of the experience and on trust ethics ("unknown ≠ no" is rare and right).
  Weak so far on *demand discovery*: the product has been built far ahead of evidence.
- **Monetisation.** An unproven direct subscription in a category where the incumbent's paid offer is a £29.99/year
  discount pass. Affiliate/ticketing is the more natural model, but conflicts with the "never pay-to-win" constitution
  unless kept strictly separate.
- **Capital requirements.**
  - Low to validate.
  - High to scale, because data coverage is the bottleneck. Each new city needs hundreds of verified venues and ongoing
    freshness work.
- **Execution risks:**
  - data coverage;
  - frequency;
  - willingness to pay;
  - platform substitution by Google and AI assistants;
  - founder bandwidth (evenings and weekends).
- **Shape of outcome.**
  - Most likely a *lifestyle or niche* business, or a feature an incumbent (DOWTK, Hoop, Mumsnet) would value.
  - Venture-scale only if the verified family-venue graph becomes a UK-wide asset with a network loop.
- **Decision: INTERESTED BUT NOT YET.**
  - It would move to INVEST with 50+ real families returning across 4+ weekends, a measurable share contributing
    post-visit facts, and evidence of pre-paid intent.
  - It would move to PASS if, after a well-run 90-day beta, fewer than about 20% of activated families come back in
    week 4.

### B. Subscription-app founder (grew an app beyond 100k users)

Expected journey **[Judgement / benchmark-informed]**:

| Step | Expectation |
| --- | --- |
| Download → onboarding complete | 55–70%. The profile is valuable but takes several minutes; children's dates of birth and naps feel like a lot before any value is shown. |
| Onboarding → first recommendation viewed | 85–95%, if Home loads in under 3 s. A slow first load would cut this hard. |
| First recommendation → **felt personal** | **The biggest risk.** With today's data most cards say "Possible fit / Not yet reviewed". The aha moment ("it knows the baby changing is downstairs and the paths are fine for the buggy") is rare. |
| First rec → first plan created | 15–30%. Create a plan is good, but many parents only want "where", not a timed itinerary. |
| First plan → first outing | 30–50% of planners (weather, sickness, inertia). |
| Week 2 return | 20–35% of activated users. |
| Month 2 | 8–15% still using monthly. |

- **Largest drop-offs:**
  - the first recommendation not feeling better than Google;
  - the gap between outings (no reason to open the app on a Tuesday).
- **Weekly habit?** Unlikely as specified. The natural cadence is "Friday evening / Saturday morning, sometimes", and in
  school holidays more often. A weekly ritual would need a *proactive* weekend brief ("3 places that suit Sloane and
  Ozzie this Saturday: dry, open, buggy-friendly"), not a browse surface.
- **£4.99/month.**
  - The price itself is fine (lower than most utility apps).
  - The problem is *usage frequency*: parents will feel they are paying for months they didn't use.
  - Benchmarks: median install-to-paid conversion is about **2%**, and about **10.7% behind a hard paywall**
    **[Research: RevenueCat]**.
  - Monthly plans keep only about **10%** of subscribers after 12 months (9.5% non-AI apps) **[Research: RevenueCat 2026
    via TechCrunch]**.
- **Trials.** RevenueCat data suggests monthly-plan trial conversion peaks with roughly 10–16 day trials. Annual plans
  convert best with longer trials **[Research]**. A 3-day trial is too short for a product used at weekends: a trial
  must span at least one weekend, so **7 days minimum, ideally 14**.
- **Paywall.** A hard paywall before first value would be fatal while the data is thin. The paywall should sit at
  *planning* depth (Create a plan, routines, Halfway), not at discovery.
- **Referral and network effects.**
  - Halfway and Connected Families are the only built-in viral mechanisms.
  - Their value depends on the *other* family installing and onboarding. That's high friction, and unproven (0
    connections).
- **Verdict:** a plausible niche subscription for affluent under-5 families, *if* data quality makes the first
  recommendation feel decisive. Not a mass-market habit app.

### C. Senior consumer product leader

- **Is the proposition immediately understandable?** "Days out that work for your family" is clear. The documented
  vision ("operating system for family decisions": hotels, car hire, formula, pushchairs, SEND, packing) is not, and it
  has already leaked into the product as hidden mock surfaces.
- **Painful enough?** For under-2s, yes, on new outings. For 5+, mostly no.
- **Decides or displays?** It now decides better: "Best option: arrive around 10:00" and the verdict-led cards. Without
  data, though, it mostly displays uncertainty.
- **Does personalisation feel personal?** Only as far as the data allows. Today, rarely.
- **Too complex?** Yes.
  - Five tabs, plus Venue Detail with six sections, Create a plan, the plan with three tabs, Halfway with a map,
    Connected Families with consent flows, post-visit, calendar and Saved.
  - That is a lot of surface for a product with no retained users.
- **Strengthens the core:** Family Fit (when data exists); Venue Detail's "What to know"; Create a plan with routine
  advice; post-visit facts.
- **Distracts:** Connected Families' depth, the Halfway map, calendar export, the hidden mock surfaces, the long-term
  multi-vertical vision, and preference learning before there are users.
- **Discover → Decide → Plan → Do → Learn.** Correct as a mental model. Most parents will live in Discover and Decide.
  Plan, Do and Learn are for a minority of high-intent days.
- **Is Meet Halfway a differentiator?** Clever and real for a subset (two friend families, NCT groups). But it is a
  *second-order* job and needs two engaged households. It belongs later, as a growth experiment.
- **One job to own:** *"Before we set off somewhere new with a baby or toddler, tell us honestly whether it will work for
  us: buggy, changing, food, toilets, naps. Then help us do it."*

### D. Growth / consumer-marketing expert (London first)

- **Ideal first customer.**
  - First- or second-time parents of a 0–3-year-old (ideally a baby plus a toddler), in north and west London (the
    founder's network: Mill Hill, Barnet, Brent, Camden, Haringey), with a car or a buggy-on-transit lifestyle.
  - Mid-to-high income; on maternity or paternity leave, or doing weekend-heavy parenting.
- **Positioning:** "Know before you go. Days out that actually work with a baby and a toddler." Not "AI", not
  "operating system".
- **Language:**
  - "buggy-friendly, changing, café, toilets, nap-proof";
  - "checked from the venue's own website, and by parents who went";
  - "we tell you what we don't know".
- **Channels:**
  - NCT and antenatal WhatsApp groups;
  - baby-class networks (Happity reaches 1.2m parents a year **[Research]**);
  - local parent Instagram accounts and creators;
  - Mumsnet (about 8m monthly uniques **[Research]**);
  - borough Facebook groups;
  - nurseries;
  - SEO for "[venue] baby changing / buggy access" (long-tail, venue-level pages are a real asset if made public);
  - App Store search (low intent volume, high competition).
- **CAC risk.**
  - Paid social for UK parents typically runs £2–£6 per install **[Assumption]**. At 2–4% install-to-paid that is
    £50–£300 per payer, against about £36/year net revenue per payer.
  - **Paid acquisition cannot work at £4.99** unless retention is exceptional.
  - Growth must be organic: community, SEO, creators and invites.
- **Viral loop:**
  - The credible one is *content*, not product: shareable "Will this work with a buggy?" venue cards and lists, posted in
    WhatsApp groups.
  - Halfway invites are a weaker loop (one invite per occasional meet-up).
- **Acquisition hypothesis** **[Assumption]**:

  | Paying families | How |
  | --- | --- |
  | First 100 | Founder network, NCT groups and 3–5 local WhatsApp communities; free lifetime beta for the first 50. 4–6 months. |
  | 500 | Borough-level SEO venue pages, 5–10 micro-creators, nursery and class partnerships; needs about 1,250–2,500 installs/month at 10% churn. |
  | 1,000 | All-London coverage of the top 300 under-5 venues, verified; PR (Evening Standard, Time Out Kids); referral rewards. |
  | 10,000 | UK-wide data coverage (5+ cities), App Store presence and a working content/SEO engine. 12,500–25,000 installs/month sustained. **No current evidence supports this.** |

### E. Data / trust / operations specialist

- **Freshness.** Claims expire after 60 days (30 for age policies). The oldest active claim is about 55 days old, so the
  first mass expiry wave is imminent **[Observed]**. Refresh is capped at 50 venues a day.
- **Unknown data.** Dominant: 59% of destinations have nothing confirmed. The system is honest about this, which protects
  trust but undermines usefulness.
- **Incorrect data.** 121 disputed or quarantined facts; there is an extractor history of false positives (CSS class
  names, Tate Liverpool read for Tate Britain). Auto-approval accounts for 98% of served facts.
- **User confirmations.** Built, unproven, zero volume. It needs high-trust parents and thousands of visits to matter.
- **Google / OSM dependencies.**
  - Google provides identity, hours and photos, with spend capped.
  - OSM provides food.
  - Routes API costs scale with plans; the project's own model shows **$100–$5,670 a month at 100–5,000 plans a day**
    (`docs/routing-cost-model.md`).
- **London → UK.**
  - The same pipeline will hit the same wall: council parks don't publish facilities.
  - Coverage per city will plateau around 40–50% "something confirmed" without human or parent input.
- **Privacy.**
  - Strong: children's dates of birth stay on the device; Connected Families use coarse grids and are opt-in; the
    calendar export has no private data.
  - A public launch still needs a children's-data DPIA, ICO registration and Age-Appropriate Design Code review
    **[Judgement]**.
- **Bad recommendations.** A family arriving with a buggy to "possible fit" steps, or with a baby to no changing, blames
  the app. One viral negative story in a parent group is costly.
- **What gets harder:**

  | Users | What gets harder |
  | --- | --- |
  | 1,000 | Support questions about wrong facts; venue owners asking for corrections; expiry churn on 300+ venues. |
  | 10,000 | Moderating parent reports, abuse and fraud; multi-city crawling; Google costs from photos and routing; GDPR requests. |
  | 100,000 | A real data-operations team; a venue-owner portal; liability for accessibility claims; partnership deals with attractions and councils. |
- **Answer:** at scale, *not by automation alone*. It is achievable only if parents become the primary source of truth
  (as reviews did for Tripadvisor), seeded by human verification of the top venues. That loop is entirely unproven.

---

## 3. Family reviews (simulated, **[Judgement]**, using the product's real behaviour and real data coverage)

| # | Family | First impression | Most valuable | Frustrating | Missing | Back next weekend? | Pay £4.99/mo? | Would cancel because | Score |
| - | --- | --- | --- | --- | --- | --- | --- | --- | ---: |
| 1 | Two parents, 3-yr-old + baby (core user) | "This gets us: buggy, naps, feeds." | Plan with routine advice ("arrive around 10:00 so the nap falls on the drive home") | Most venues say "still to be checked" for buggy and changing; few confirmed facts | Confirmed baby changing, buggy route, café on site | Probably, for new places | Maybe, after it saves one bad day | Too many "unknown"s; one wrong fact | **6.5** |
| 2 | Children 5 and 8, no buggy | "Another days-out list." | Distance and opening hours | Baby-centred language; little age guidance | What the kids will actually enjoy; prices; events | Unlikely | No | Nothing it does beats Google/DOWTK | **4** |
| 3 | First-time parents, 6-month-old | "Exactly my anxiety." | Honest "not confirmed" plus "What to know" | The honesty turns into "we don't know" at most places | Changing location, feeding space, lift access, quiet room | Yes, if the facts are there | Possibly, out of anxiety | Being burned once by a wrong "confirmed" | **6** (8 with good data) |
| 4 | Children 9 and 12 | "Not for us." | Halfway, occasionally | Everything's toddler logistics | Activities, events, teen interest, cost | No | No | — | **2.5** |
| 5 | Budget-conscious | "Why pay? Google is free." | Free parking flag | A subscription for something done a few times a year | Free events, discounts (DOWTK membership £29.99/yr gives discounts) | Maybe, free | **No** | Any charge | **3** |
| 6 | Busy affluent London parents | "Saves me the research." | A decisive pick plus plan plus calendar | Too much to read; uncertainty; speed | A proactive "Saturday plan for you" | Yes, if proactive | Yes (£4.99 is trivial) | Wrong facts; not proactive | **7** |
| 7 | Two families meeting | "Clever idea." | Fair-journey shortlist | The other family must install, sign up and set up | Shared plan in WhatsApp without an install | Occasionally | No (would expect it free) | Friction for the other family | **5** |

**Takeaway [Judgement]:** the product scores well only where (a) there's a baby or toddler and (b) the venue data is
good. That's a narrow intersection today.

---

## 4. Competitive review

| Alternative | What it is (**[Research]**) | Why a parent uses it | What FamilyPilot does better | Could they copy FamilyPilot? |
| --- | --- | --- | --- | --- |
| **Google Maps + Ask Maps** | Gemini conversational place search, launched March 2026, 150+ countries by August 2026; personalised by history | Default, free, complete, reviews, photos, routes | Honest unknowns; family-specific facts; routines; two-family fairness | **Yes, mostly.** Google lacks verified family facts but has review text and will mine it. The biggest threat. |
| **ChatGPT / general assistants** | ~900m weekly users (secondary source); can plan "a day out with a 3-year-old and a baby" | Free, conversational, handles naps in prose | Grounded, cited, current facts; a persistent family profile; no hallucinated "baby changing" | Partly. Assistants lack verified current data, but will gain memory and Maps grounding. |
| **Day Out With The Kids** | UK's largest family days-out site: 7,500+ attractions, ~2m visits/month, paid membership £29.99/yr for discounts | Inspiration plus discounts, free | Personalisation, honesty about facilities, planning | Easily copy filters; harder to copy evidence rigour. A natural acquirer or partner. |
| **Hoop** | Founded 2016, ~£6.4m raised, 1m+ downloads, closed July 2020, relaunched 2022–23; 100k+ classes and events | Classes, clubs, events | Day-out suitability, planning | Could add days out; focus is bookable activities. Hoop's own history shows the category's difficulty. |
| **Happity** | Baby and toddler class marketplace, 1.2m parents a year, £800k seed | Booking classes | Not a competitor for days out | A potential distribution partner |
| **Mumsnet / Facebook / WhatsApp groups** | ~8m monthly uniques (Mumsnet) | Trusted peer answers ("is X buggy-friendly?") | Structured, searchable, personalised | They *are* the trust layer FamilyPilot is trying to build. |
| **TikTok / Instagram creators** | — | Inspiration, vibes | Logistics, suitability | No. Different job. |
| **Tripadvisor** | Reviews | Reviews | Family-specific structure | Could add family filters |
| **AI trip planners** (Stardrift, Layla, Nori, GetOutTrip) | Family itineraries "accounting for nap schedules" | Holiday planning | Local, everyday, evidence-backed | Yes, the generic version already exists. |
| **Kids Pass / Boundless** | Discount membership, £1 for a 10-day trial | Saving money | — | Different job; anchors willingness to pay *for savings*, not for advice. |

- **Why open FamilyPilot instead?** Only if it reliably answers "will this work with *our* baby and buggy?" better than a
  Google review scan, and does it in under 30 seconds. Today it often can't, for lack of data.
- **Easy to copy:** UI, family profile, filters, AI explanations, itinerary generation, calendar export, maps.
- **Hard to copy:** a large, current, verified, parent-confirmed set of family facts per venue, *if* it exists. Also
  accumulated outcome data ("families with a 6-month-old rated this 4.7 for buggy access") and trust built in a parent
  community.
- **Could a general AI assistant make FamilyPilot redundant?**
  - For discovery and generic itineraries: **largely yes, within 1–2 years** **[Judgement]**.
  - For verified facility truth and a learning loop of parent confirmations: **no, unless Google mines reviews well
    enough**.
  - FamilyPilot's survival depends on owning the data, not the interface.

---

## 5. Business model challenge

- **The hypothesis:** £4.99/month, a free trial, no permanently useful free tier.
- **Unit economics** **[Research for fees and rates; Assumption for mix]**:
  - £4.99 including 20% VAT is £4.16 net of VAT. After Apple's Small Business 15% that leaves **£3.53/month**.
  - An annual plan at £34.99 nets about **£2.07/month**.
  - A realistic monthly/annual mix gives about **£3.00/month** per payer (≈£36 a year).
  - Infrastructure today costs pennies per user. Routing and photos scale with use.
  - The real cost is **data operations** (human verification and moderation), which no subscription at this price
    covers until thousands of payers.
- **Churn and seasonality:**
  - Expect high churn in winter and post-holiday months, and spikes in Easter, summer and half-terms.
  - Families with children over 5 churn out structurally.
  - Benchmark: about 10% of monthly subscribers remain at 12 months **[Research]**.
- **Do families need it every month?** Most don't. That's the core problem with a monthly subscription.
- **£4.99:** cheap in absolute terms, expensive relative to the anchor (DOWTK £29.99/year *with* discounts) and to free
  Google.
- **Trial:** 3-day is too short (it must include a weekend); 7-day is the minimum; 14-day is better for monthly.
- **Hard paywall vs freemium.** Hard paywalls convert 5× better on installs **[Research: RevenueCat]**, but only when the
  value is evident before the wall. Here, value depends on data that is often missing, so a hard paywall risks
  converting no one.
- **Connected Families.** The paying family should be able to invite another family **free**. The invited family is the
  acquisition channel; charging both kills the loop.

**Recommended launch model [Judgement]:**
1. **Free:** discovery, Family Fit, Venue Detail, saving.
2. **"FamilyPilot Plus" at £29.99/year** (with a monthly option at £3.99 for flexibility):
   - planning (routine-aware plans, best-option advice, calendar);
   - Halfway with invited families free;
   - a proactive weekend brief;
   - early access to verified-venue cities.
3. **A 14-day trial started from a moment of value** (the first plan), not from install.
4. Validate first with a *web* Stripe pre-order of a "founding family" annual membership. No App Store needed.

Revisit affiliate and ticketing only with a strict separation from Family Fit, as the constitution already requires.

---

## 6. Market and growth scenarios (**[Assumption]**-labelled; *not* predictions)

**Market framing:**
- **UK:** about 8.3m families with dependent children **[Research: ONS]**; about 1.6–1.8m have a child under 3
  **[Assumption: ~595k births/yr × 3, minus siblings]**.
- **London:** roughly 0.35–0.45m families with an under-5 **[Assumption, from ~106k births/yr]**.
- **The serviceable first market:** affluent families with a 0–3-year-old in north and west London who use apps for
  logistics, perhaps 40–80k households **[Assumption]**.

**Model.** Monthly installs ramp linearly within each year. Payers each month are last month's payers × (1 − churn) plus
installs × install-to-paid. The net revenue per payer is £3.00/month **[Assumption]**.

| Scenario | Installs/mo (start Y1 → end Y1 → end Y2 → end Y3) | Install→paid | Monthly churn | Payers M12 | Payers M24 | Payers M36 | MRR M36 | ARR M36 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Failure | 150 → 300 → 300 → 300 | 1.0% | 22% | 11 | 14 | 14 | £42 | £0.5k |
| Niche success | 500 → 1.5k → 2.5k → 3.5k | 3.0% | 13% | 214 | 442 | 672 | £2.0k | £24k |
| Base case | 1k → 4k → 8k → 12k | 4.0% | 10% | 813 | 2,080 | 3,585 | £10.8k | £129k |
| Strong success | 2k → 10k → 25k → 40k | 5.0% | 8% | 2,652 | 8,418 | 16,466 | £49k | £593k |
| Breakout | 4k → 30k → 90k → 150k | 6.0% | 6% | 9,814 | 38,204 | 83,160 | £249k | £3.0m |

- **Breakout** needs about 2.4m cumulative installs over three years: UK-wide coverage, a working viral or content
  engine, and top-decile retention. Nothing observed today supports it.
- **Base case** (about £130k ARR at 36 months) is a modest business that would not fund a data-operations team.
- **Strong success** (about £600k ARR) is a viable small company.

**What needs to be true (steady state, installs/month needed):**

| Paying families | 2% conv, 15% churn | 4% conv, 10% churn | 4% conv, 8% churn |
| ---: | ---: | ---: | ---: |
| 100 | 750 | 250 | 200 |
| 500 | 3,750 | 1,250 | 1,000 |
| 1,000 | 7,500 | 2,500 | 2,000 |
| 5,000 | 37,500 | 12,500 | 10,000 |
| 10,000 | 75,000 | 25,000 | 20,000 |

- **Reading it:** 1,000 paying families needs roughly **2,000–7,500 installs every month, forever**.
- That's achievable organically in London only with strong community and SEO.
- 10,000 payers needs UK-wide reach.

---

## 7. Pre-mortem: it's October 2029 and FamilyPilot failed

Ranked by probability × severity **[Judgement]**:

| # | Cause | P | Sev | Early-warning metric (next 6–12 months) |
| - | --- | :-: | :-: | --- |
| 1 | **Not enough trustworthy venue data**: recommendations felt generic or "unknown" | High | High | Share of Home's top 10 cards with ≥ 3 confirmed facts for the family's needs (target > 70% in the beta boroughs) |
| 2 | **Episodic use**: no weekly habit, high churn | High | High | Weekend-over-weekend return; % of activated families active in ≥ 3 of 8 weekends |
| 3 | **Low willingness to pay vs free Google/DOWTK** | High | High | Pre-order / founding-membership conversion among beta families (target ≥ 10%) |
| 4 | **Google Ask Maps / assistants became "good enough"** | Med-High | High | Blind tests: do parents prefer FamilyPilot's answer to Ask Maps / ChatGPT for 10 real venues? |
| 5 | **Organic acquisition never ignited; paid CAC unaffordable** | High | Med-High | Installs from shares/referrals vs paid; cost per activated family |
| 6 | **Founder bandwidth**: evenings and weekends can't sustain product, data, ops and growth | Med-High | High | Hours a week on data and growth vs code; shipped-to-learned ratio |
| 7 | **Parent-report loop never reached critical mass** | High | Med | Reports per completed outing (target ≥ 25%); repeat contributors |
| 8 | **A wrong fact caused a public trust incident** | Med | Med-High | Disputed-fact rate; correction latency; complaints per 1,000 plans |
| 9 | **Scope creep** (Halfway, maps, calendar, holidays, packing) diluted focus | Med | Med | % of engineering time on the core job vs adjacent features |
| 10 | **Expansion beyond London stalled on data cost** | Med | Med | Cost and time to verify 100 venues in a new city |

**If FamilyPilot succeeded, the five things that most likely went right:**
1. It narrowed to **babies and toddlers** and became *the* source for "will this work with a buggy and a baby?".
2. **Parents became the data engine.** Post-visit confirmations reached thousands a month, and venue pages ranked in
   Google for "[venue] baby changing".
3. It found a **cadence**: a proactive Friday "your weekend" brief and school-holiday plans that brought families back.
4. It priced as a **low-friction annual membership** (or partner-subsidised), not a monthly bill.
5. It **partnered rather than fought**: data licensed to or from DOWTK, Happity, councils or venues, and distribution
   through NCT and baby classes.

---

## 8. Moat

| Not a moat | Could become a moat |
| --- | --- |
| UI and visual polish | **A verified, parent-confirmed family-facilities graph** (buggy routes, changing locations, feeding spaces, café on site), current and cited, across thousands of UK venues |
| AI-generated recommendations or explanations | **Outcome data:** what families with a 6-month-old actually rated, did and avoided |
| The family profile itself (any app can ask the same questions) | **A trusted community brand** among under-5 parents (the Mumsnet effect) |
| Family Fit logic (rules can be re-implemented) | **Venue relationships:** attractions and councils supplying and maintaining facts directly |
| Routine-aware planning (an LLM can reason about naps) | **Distribution embedded** in NCT, baby classes and nurseries |
| Halfway, maps, calendar | Weak network effect from Connected Families, if two-family planning becomes common (unproven) |
| The evidence pipeline code (replicable) | — |

**What must be built or learned in the next 2–3 years:**
1. A parent-confirmation loop that produces facts at scale (target: 1 confirmed fact per 2 completed outings).
2. Human-verified coverage of the top 300 under-5 venues in London, then city by city.
3. Public, indexable venue fact pages, to win SEO and become *the* reference.
4. Evidence that families trust FamilyPilot over Google for this specific question.
5. A partnership channel with venues to keep the facts current.

---

## 9. What NOT to build (ruthless)

**Remove from the codebase or product (not just hide):** Need Something Now, Holiday planner, Packing list, Car fit,
mock restaurant browsing and mock Eat Nearby, Concierge. They signal an "everything app" and cost maintenance.

**Defer (no work until the beta proves the core):**
- **Step 2 (Halfway list/map/filters redesign).** Halfway has never been used by a second family. Test whether anyone
  uses the current version first.
- **Step 4 (learned preferences).** No users means nothing to learn from.
- **The native iOS calendar** (`expo-calendar`), a richer map provider, transit (TfL) integration and plan-map
  visualisations.
- Connected Families' routine sharing and update-consent flows (keep the basic invite).
- New cities, SEND or accessibility expansion beyond honest unknowns, and affiliate/ticketing.

**Technically impressive, commercially unimportant (stop polishing):**
- Figma pixel-fidelity verification;
- multi-family routine reasoning;
- route-free fairness maths;
- server timing work beyond "Home in under 3 s on a phone";
- visual regression breadth.

**The five things that matter most before public launch:**
1. **Data:** human-verify the top 100 under-5 venues in 3–4 launch boroughs (baby changing, buggy access, café on site,
   toilets, age suitability, feeding space), so every top card has real facts.
2. **First-session value:** Home loads in under 3 s on a mid-range phone, and the first card says something specific and
   true about *this* family.
3. **The return trigger:** a Friday "this weekend for Sloane and Ozzie" brief (web push or email) to create a cadence.
4. **The learning loop:** a post-visit prompt that a parent actually answers, measured.
5. **The payment test:** a web founding-membership pre-order (Stripe), before any App Store work.

---

## 10. Investment committee memo

- **Investment thesis.**
  - Parents of under-3s face real, recurring anxiety about whether a new place will work for a buggy, a baby and a
    toddler.
  - Existing tools answer "what's near me" but not "will it work for us", and they often get facilities wrong.
  - A trusted, verified, family-specific layer, fed by parents, could become the reference that Google, DOWTK and
    parents themselves rely on.
  - FamilyPilot's builder has shown unusual craft and integrity in getting the *honesty* right.
- **Bear case.**
  - The data never reaches density, so recommendations feel like Google with more "unknowns".
  - Use is episodic, so subscriptions churn.
  - Google's Ask Maps and AI assistants absorb the discovery job.
  - Paid acquisition is uneconomic, and one person can't run product, data and growth.
  - It ends as a well-built hobby.
- **Bull case.**
  - FamilyPilot becomes the UK's trusted "will it work with a baby?" layer: tens of thousands of parent-confirmed facts,
    venue pages ranking in search, a proactive weekend habit, an annual membership, partnerships with attractions and
    baby-class networks.
  - Possibly a valuable acquisition for DOWTK, Hoop, Mumsnet or a mapping company.
  - Upside: a £1–5m ARR UK business, or a strategic exit. Venture-scale only with Europe expansion and a strong data
    network effect.
- **Current stage: functional product / private-beta candidate.**
  - Live London data, honest trust model, end-to-end flows.
  - No users, no retention, no revenue, no native app.
- **Decision: WAIT FOR USER EVIDENCE.**
  - Investing now would fund engineering that is already ahead of evidence.
  - Passing would ignore a credible niche and an unusually trustworthy product foundation.
- **Confidence in this decision:** 75%.
- **The three pieces of evidence that would most change it:**
  1. **Retention:** ≥ 40% of activated beta families use FamilyPilot on ≥ 3 of 8 weekends.
  2. **Willingness to pay:** ≥ 10% of activated families pre-pay a £29.99 founding annual membership.
  3. **Data flywheel:** ≥ 25% of completed outings yield a parent-confirmed fact, and top-venue coverage reaches ≥ 70%
     with ≥ 3 confirmed family facts.

---

## 11. Founder recommendation

**If this were my own money and evenings and weekends: YES, but only through a tightly controlled validation phase.**

- Continuing is rational **not** because of the sunk engineering cost, but because the cheapest next experiment (real
  families, hand-verified data, a pre-order) is now very cheap relative to what's been built.
- Continuing *without* that experiment would be irrational.

**The next 90 days:**

- **Weeks 0–1: freeze and focus.**
  - Stop feature development: Step 2, maps, Halfway redesign, learning preferences.
  - Write down the kill criteria below and share them with one honest friend.
  - Remove the hidden mock surfaces.
- **Weeks 1–4: make the data true where the beta lives.**
  - Pick 3–4 boroughs near home.
  - Human-verify the top 80–100 venues families with a 0–3-year-old actually go to: phone calls, visits, venue emails,
    photos of changing rooms and buggy routes.
  - Target: ≥ 3 confirmed facts on every venue the beta will see.
- **Weeks 2–4: recruit.**
  - 40–60 families with a child under 3, via NCT groups, baby classes and local WhatsApp groups.
  - Use the web app, free.
  - Instrument: activation, weekly return, plans created, outings completed, post-visit replies.
  - Measure Home load time on their phones.
- **Weeks 4–10: run it like a product, not a project.**
  - Send a Friday "this weekend for your family" message (manually at first).
  - Run 10–15 user interviews: the first five in week 4, the rest during weeks 5–9.
  - Run a blind comparison against Google Ask Maps and ChatGPT for 10 real venues.
  - Fix only what blocks the core job.
- **Week 8: the payment test.** Offer a £29.99 "founding family" annual membership via a Stripe web link (refundable),
  no App Store.
- **Week 12: decide against the written criteria.**

  | Outcome | Criteria |
  | --- | --- |
  | **Continue and build the native app plus monetisation** | ≥ 40% of activated families active on ≥ 3 of 8 weekends, **and** ≥ 10% pre-pay, **and** ≥ 25% of outings produce a confirmed fact |
  | **Reposition** (e.g. a free content/SEO venue-fact site with affiliate or partner revenue, or a B2B data offer to DOWTK/Happity/venues) | Retention is good but nobody pays, or payment is fine but retention is weak |
  | **Stop**, and publish what you learned | Week-4 return < 20% and nobody pre-pays |

The single most important change in behaviour **[Judgement]**: for the next 90 days, spend most build time on **venue
truth and real families**, not on the app.

---

## 12. Method notes and limits

- The production site could not be opened from the review environment. Product behaviour was observed on local builds
  using fixture catalogues. Production *data* coverage was measured directly, with aggregate counts only.
- The family reviews are simulations informed by the product's real behaviour and data coverage, not interviews.
- The scenario model is a set of labelled assumptions, not a forecast.
- Some market figures come from company self-reports or secondary sources; they are marked as such in §13. Treat them
  as order-of-magnitude.

## 13. Sources

**Product (primary, this repository / production, 7 Oct 2026):**
- `docs/EVIDENCE_COVERAGE_AUDIT.md`
- `docs/VENUE_COVERAGE.md`
- `docs/GOOGLE_PLACES_COST_CONTROL.md`
- `docs/routing-cost-model.md`
- `docs/PROJECT_STATUS.md`
- `docs/MASTER_PRODUCT_VISION.md`
- `docs/PARENT_TESTING_GUIDE.md`
- Read-only aggregate queries of the production database.

**Market and demographics:**
- ONS, Families and households in the UK: 2024 —
  https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/families/bulletins/familiesandhouseholds/2024
- ONS, Births in England and Wales: 2024 —
  https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/bulletins/birthsummarytablesenglandandwales/2024
- GLA / London Datastore, Births by mother's country of birth in London (2024: 106,129 births) —
  https://data.london.gov.uk/dataset/births-by-mothers-country-of-birth-in-london-2y9y7
- GLA, London's population — https://data.london.gov.uk/dataset/londons-population-e6y30
- Boundless, "Value for money drives summer plans" (July 2026) —
  https://www.boundless.co.uk/press-centre/value-for-money-drives-summer-plans-as-more-brits-opt-for-uk-days-out
- Hyundai survey via Motor1, "British families only take seven day trips per year" —
  https://www.motor1.com/news/345008/hyundai-seven-day-trips-a-year/
- Barclays, "Will 2025 be the year consumers act on streamflation?" —
  https://home.barclays/insights/2025/03/will-2025-be-the-year-consumers-act-on-streamflation

**Competitors and alternatives:**
- Day Out With The Kids, About us — https://www.dayoutwiththekids.co.uk/about-us
- Day Out With The Kids, Work with us (audience figures) —
  https://www.dayoutwiththekids.co.uk/marketing-packages-and-listings
- MoneySavingExpert, Day Out With The Kids deals (membership price) —
  https://www.moneysavingexpert.com/deals/day-out-with-the-kids/
- Hoop, About — https://hoop.co.uk/about/
- TechCrunch, Hoop £2.4m (2017) —
  https://techcrunch.com/2017/09/27/hoop-app-for-millennial-parents-secures-2-4m-in-a-round-led-by-bgf-ventures/
- UKTN, Hoop £4m Series A (2018) —
  https://www.uktech.news/news/investment-news/kids-activity-finder-hoop-secures-4m-series-a-20180521
- Happity on Hoop's closure —
  https://www.happity.co.uk/blog/article/best-hoop-alternative-hoop-app-closing-booking-classes/
- Happity seed round / reach — https://femtechinsider.com/happity-seed-round/
- Mumsnet, About us — https://www.mumsnet.com/info/about-us
- Peanut Series A — https://www.globaldatinginsights.com/news/peanut-raises-12-million-in-series-a-funding-round/
- Kids Pass via Boundless — https://www.boundless.co.uk/days-out-discounts/kids-pass
- TechCrunch, Google Maps Ask Maps (12 Mar 2026) —
  https://www.techcrunch.com/2026/03/12/google-maps-is-getting-an-ai-ask-maps-feature-and-upgraded-immersive-navigation/
- Forbes, Google Maps adds Gemini conversational search (16 Mar 2026) —
  https://www.forbes.com/sites/anishasircar/2026/03/16/google-maps-adds-gemini-ai-with-conversational-search-and-3d-immersive-navigation/
- EFTM, Ask Maps to 150+ countries (Aug 2026) —
  https://eftm.com/2026/08/google-rolls-out-gemini-powered-ask-maps-to-150-countries-including-australia-279055
  (UK availability not explicitly confirmed in sources I could access)
- Stardrift, AI trip planners for families — https://stardrift.ai/resources/best-ai-trip-planner-family-group-travel
- Layla — https://layla.ai/
- ChatGPT usage statistics 2026 (secondary aggregator) — https://searchlab.nl/en/statistics/chatgpt-statistics-2026

**Subscription economics:**
- RevenueCat, State of Subscription Apps 2025 — https://www.revenuecat.com/state-of-subscription-apps-2025/
- SaaStr summary of RevenueCat trial-length data —
  https://saastr.com/what-17000-subscription-apps-tell-us-about-free-trial-length-annual-plans-convert-86-better-with-30-day-trials-monthly-tops-out-at-two-weeks-and-ai-apps-hit-a-wall-at-16-days
- TechCrunch, AI-powered apps struggle with long-term retention (RevenueCat 2026, Mar 2026) —
  https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows
- Apple, App Store Small Business Program (15%) — https://developer.apple.com/app-store/small-business-program/
- UK VAT on digital services: the standard 20% rate is assumed.
