# FamilyPilot — Master Product Vision (Version 2)

> **IMPORTANT — Read before any code change**
>
> This document defines the long-term vision of FamilyPilot.  
> It is more important than any previous prompt.  
> **Do not overwrite this vision. Do not simplify it. Do not reinterpret it.**  
> Use it as the foundation for every future decision.

**Status:** Canonical product constitution  
**Audience:** Every developer, designer, and agent working on FamilyPilot  
**Related:** [DECISION_PRINCIPLES.md](./DECISION_PRINCIPLES.md) · [PRODUCT_DIRECTION_V2.md](./PRODUCT_DIRECTION_V2.md) · [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md) · [FAMILY_MATCH.md](./FAMILY_MATCH.md) · [FAMILY_GRAPH.md](./FAMILY_GRAPH.md)

---

## Mission

FamilyPilot exists to help families make better everyday decisions with less effort.

It should remove uncertainty, reduce research time, and give parents confidence.

The goal is **not** to replace Google.  
The goal is **not** to replace ChatGPT.  
The goal is **not** to become another parenting app.

The goal is to become **the first app parents instinctively open whenever they face a practical family decision**.

FamilyPilot should reduce:

- Uncertainty
- Research
- Typing
- Decision fatigue

And increase:

- Confidence
- Relevance
- Convenience
- Trust
- Time spent enjoying family life rather than planning it

---

## Positioning

**Internal positioning (product strategy):**

> FamilyPilot is the **operating system for family decisions**.

**Supporting proposition:**

> One family profile. Better decisions everywhere.

Treat "operating system" primarily as an internal strategy statement — not consumer-facing copy.

FamilyPilot helps with decisions including:

- Where should we go?
- Where should we eat?
- Is this suitable for our children?
- Is this accessible?
- Is this SEND-friendly?
- Where should we meet another family?
- What should we pack?
- Which hotel suits us?
- Should we hire a car?
- Will our equipment fit in this car?
- Where can I buy formula now?
- What should I buy for my child?
- What should we do this weekend?

The product must **never** become restricted to any single one of these use cases.

---

## Product Philosophy

Every feature must answer one question:

### What family decision does this help solve?

If the answer is unclear, **do not build the feature**.

Examples include:

- What should we do today?
- Which park suits us?
- Which restaurant should we eat at?
- Can this car fit our buggy?
- Where should we meet another family?
- Which hotel suits us?
- Is this venue wheelchair accessible?
- Is this activity SEND-friendly?
- What should we pack?
- Where can I buy formula now?
- Should we hire a car?
- Which pushchair should I buy?

---

## FamilyPilot is NOT

FamilyPilot should **never** become:

- A booking app
- A parenting forum
- A generic social network
- An engagement feed
- A parenting argument forum
- A review spam platform
- A pay-to-win recommendation engine
- A travel agent
- A restaurant booking service
- A directory
- A generic AI chat interface
- A cluttered advertising platform
- A booking site pretending to be impartial
- A product that maximises screen time at the expense of family time
- An AI chatbot

These are permanent product guardrails — architectural and cultural, not temporary constraints.

---

## FamilyPilot IS

**A personalised family decision platform.**

One evolving family profile powers recommendations throughout the product.

The app should always explain **WHY** it recommends something.

Never just present data.  
**Present confidence.**

---

## Core Product Principles

1. Reduce decision fatigue.
2. Reduce typing.
3. Reduce research.
4. Explain recommendations.
5. Save families time.
6. Feel calm.
7. Feel premium.
8. Never overwhelm.
9. Always be trustworthy.
10. Build long-term confidence.

**Additional principle:**

> The more FamilyPilot understands a family, the less work that family should need to do.

---

## Design Philosophy

The app should feel closer to:

- Apple
- Airbnb
- Headspace
- Apple Maps

**Not:**

- Busy parenting apps
- Generic React Native templates
- Directory websites

Visual language should feel:

**Warm · Premium · Simple · Friendly · Modern · Calm**

---

## The Family Profile & Family Graph™

Everything begins with one family profile.

It should eventually understand:

- Parents
- Children
- Ages
- Vehicles
- Pushchairs
- Budget
- Travel preferences
- Accessibility needs
- SEND preferences
- Dietary preferences
- Favourite activities
- Favourite restaurants
- Weather preferences
- Travel distance
- Memberships
- Equipment
- Connected families
- **Family DNA™**

The user should **never repeatedly enter the same information**.

### Family Graph™ (architectural concept)

FamilyPilot should not treat the user as a flat profile. The family has interconnected context:

```
Family
  → Parents
  → Children → Ages → Interests
  → Accessibility requirements
  → SEND preferences
  → Dietary preferences
  → Vehicles → Pushchairs → Car seats → Equipment
  → Memberships
  → Favourite activities / restaurants / saved places
  → Holidays → Trips
  → Connected families
  → Family DNA
  → Recommendations
```

**Family Graph™** is the internal name for this relationship layer. It is a conceptual domain model first — not a mandate to implement a graph database today. Current architecture should avoid decisions that would prevent this model from emerging later.

Detail: [FAMILY_GRAPH.md](./FAMILY_GRAPH.md)

---

## Family DNA™

**Family DNA** represents what FamilyPilot gradually learns about a family over time.

Examples:

- They rarely drive more than 25 minutes for a normal day out.
- They favour places with cafés.
- They prefer free parking.
- They enjoy farms more than museums.
- They prefer quieter restaurants.
- They often choose outdoor activities when the weather allows.
- They usually spend under £50 on a casual day out.
- They regularly meet another particular family.
- Accessibility requirements affect venue selection.
- SEND-friendly sessions are especially valuable.

Family DNA should improve recommendations over time.

**Important rules:**

- Family DNA must never behave like hidden surveillance.
- Users should be able to understand why a preference exists.
- Important inferred preferences should eventually be viewable and editable.
- Sensitive attributes must be handled according to the [privacy model](./PRIVACY_MODEL.md).
- Do not infer sensitive information unnecessarily.

---

## Family Match™ — The Intelligence Layer

**Family Match is not merely a feature. It is the intelligence layer that powers FamilyPilot.**

Family Match can eventually evaluate:

- Activities
- Parks
- Attractions
- Restaurants
- Cafés
- Hotels
- Holidays
- Cars
- Products
- Family meetups
- Day plans
- Travel options

It combines three context layers:

### Family context

- Children's ages
- Interests
- Family preferences
- Accessibility requirements
- SEND preferences
- Dietary preferences
- Equipment
- Vehicle
- Budget

### Situational context

- Weather
- Travel time
- Time available
- Opening times
- Cost
- Parking
- Terrain
- Facilities
- Restaurant availability
- Current plan

### Learned context (Family DNA)

- Previous choices
- Saved places
- Places rejected
- Favourite categories
- Typical travel distance
- Typical spend
- Preferred environments

Family Match must remain:

- **Explainable** — never show a percentage without explaining the strongest reasons behind it
- **Transparent** — parents should never wonder why something appears
- **Contextual** — scores reflect *this family, right now*
- **Personalised** — one profile powers every recommendation

Example:

```
98% Family Match

Perfect because:
✓ Ideal for ages 3 and 0
✓ Flat paths
✓ Pushchair friendly
✓ Café
✓ Baby changing
✓ Restaurant nearby
✓ Only 16 minutes away
```

See [FAMILY_MATCH.md](./FAMILY_MATCH.md) for technical specification.

---

## Long-Term Product Areas

### 🌳 Discover

Find: Parks, Playgrounds, Soft play, Farms, Museums, Walks, Beaches, Seasonal events, Indoor/outdoor activities, Attractions, SEND-friendly places, Accessible venues.

### 🍽 Family-Friendly Restaurants

Restaurants are **first-class recommendations** — not generic listings or an isolated database.

**Principle:** Activities and eating are usually part of the same family decision.

Restaurants should appear **contextually throughout the app**:

| Context | Behaviour |
|---------|-----------|
| Visiting a park | Show **Eat nearby** |
| Building a day plan | Automatically recommend **Lunch** |
| Meeting another family | Recommend somewhere that suits **both families** |
| Holiday | Show family-friendly restaurants near the hotel |

Each restaurant should eventually include: Family Match, kids menu, high chairs, baby changing, pushchair space, accessibility, SEND considerations (where factual), noise level, play area, outdoor seating, dietary choices, estimated spend, parking, distance from current activity.

Example:

```
After your visit

Best nearby lunch
Family Match 95%
Kids menu · Baby changing
2 minutes away
Estimated spend £34
```

### 🤝 Meet Another Family

**Version 1 — One phone:** Two addresses · Children's ages → best place to meet (**not** simply midpoint). Optimises for journey time fairness, activity suitability, age suitability, restaurants nearby, accessibility, SEND requirements, parking, weather, and estimated cost.

Show clearly:

- Travel time for Family A
- Travel time for Family B
- Travel-time difference
- Combined Family Match
- Why the location works

The user can share the recommendation. The recipient should not initially need an account.

**Version 2 — Connected Families:** Invite friends, grandparents, cousins, neighbours. Combined recommendations from both profiles.

**Connected Families is NOT a social network.** No public follower counts, engagement feeds, popularity contests, or public child profiles. Its purpose is practical planning.

### 🗓 Plan Your Day

Plan Your Day is an **important capability**, but it is **NOT** the main product identity.

The broader product must remain capable of standalone decisions. A parent should still be able to find a park, find a restaurant, find formula, compare a car, plan a holiday, or meet another family **without** creating a full itinerary.

Plan Your Day **combines** existing FamilyPilot capabilities when useful. It does not replace them.

Generate: Morning activity · Lunch · Optional afternoon stop · Estimated cost · Travel · Return home.

Everything should remain **editable**.

### ♿ Accessibility

Accessibility is **NOT** a separate niche mode. Accessibility data belongs in the **core venue model**.

Include: Step-free access, wheelchair accessibility, accessible parking, accessible toilets, Changing Places, lifts, accessible playground equipment, terrain gradient, path surfaces, seating, entrance restrictions.

Parents should be able to save requirements to their family profile. Requirements should influence Family Match.

- **Hard requirements** may exclude unsuitable venues.
- **Preferences** may simply reduce Family Match.

Never reduce accessibility to a generic **Accessible ✓** when more meaningful information exists.

### 🧩 SEND-Friendly

Store **factual, evidence-based information** only:

- Sensory-friendly sessions
- Quiet sessions
- Reduced-noise sessions
- Visual schedules
- Quiet areas
- Sensory rooms
- Ear defenders
- Queue assistance
- Carer tickets
- Accessible equipment
- Staff training

Avoid statements such as *"Perfect for autistic children"* unless a reliable authoritative source genuinely supports such wording.

Prefer factual descriptions such as: *"Sensory-friendly session available Sundays 9–10am."*

SEND requirements entered by families are sensitive data and must be treated accordingly. See [PRIVACY_MODEL.md](./PRIVACY_MODEL.md).

### 🚗 Car Fit

Understand: Vehicles, pushchairs, suitcases, travel cots, scooters, bikes, shopping. Eventually recommend suitable family cars.

### 🎒 Packing

Automatically generate packing lists based on: Destination, weather, children, activities, trip duration.

### ✈ Holiday Planning

Recommend: Hotels, flights, car hire, transfers, luggage, travel time, Family Match, holiday suitability. Compare options. **Never force booking.**

### 🍼 Need Something Now

Locate: Formula, nappies, baby wipes, medicine, baby food, pharmacies. Eventually support live stock where available.

### ☀ Weather Intelligence

Adjust recommendations using: Rain, wind, heat, UV, indoor alternatives.

### 🎟 Family Deals

Recommend: Membership savings, kids eat free, discounts, attraction offers, voucher opportunities.

### 🚻 Facilities

Every venue should eventually include: Toilets, baby changing, family toilets, microwave, breastfeeding, water refill, shade, picnic area, seating.

### 🎂 Birthday Planner

Recommend: Venues, entertainment, food, budget, guests.

### 💬 Why Families Love It (Future Vision)

This is **NOT** a generic review feed.

FamilyPilot should eventually summarise recurring factual patterns from trusted reviews and family feedback:

```
Why families love it
✓ Children stay entertained for several hours
✓ Easy parking
✓ Good café
✓ Clean toilets
✓ Excellent toddler playground

Things to know
⚠ Gets busy after 11am
⚠ Café queues around lunchtime
⚠ Paths become muddy after rain
```

**Trust rules:**

- Do not fabricate summaries.
- Only summarise sufficient underlying evidence.
- Show recency where relevant.
- Separate venue-provided information from community observations.
- Do not present subjective opinion as objective fact.

Community-contributed information must eventually include verification, recency, and confidence mechanisms. Do not implement now — see [FUTURE_BACKLOG.md](./FUTURE_BACKLOG.md).

---

## Why We Recommended This

Every recommendation should explain itself.

Example:

```
Why we recommended this
✓ Great for ages 3 and 0
✓ Pushchair friendly
✓ 14 minutes away
✓ Restaurant nearby
✓ Sunny weather today
✓ Estimated spend £22
```

Parents should **never wonder why something appears**.

---

## Habit Loop

The goal is **not** addictive engagement. The goal is **useful recurring engagement whenever a family has a genuine decision to make**.

Example weekly behaviour:

```
Friday evening     → "What could we do this weekend?"
                     FamilyPilot provides personalised ideas.

Saturday morning   → Check weather-adjusted recommendations.

During the outing  → Find lunch, toilets, baby changing,
                     nearby essentials, optional additional activity.

After the outing   → Save favourite venue, restaurant, future idea.

Later              → Use FamilyPilot for meetup, holiday, birthday,
                     car decision, packing, product purchase.

Repeat
```

Avoid product mechanics designed purely to increase screen time.

**FamilyPilot should save time, not consume it.**

---

## The FamilyPilot Flywheel

### Personalisation flywheel

```
More family context
        ↓
Better Family Match
        ↓
More relevant recommendations
        ↓
Greater trust
        ↓
More decisions made through FamilyPilot
        ↓
More useful preference signals
        ↓
Better Family DNA
        ↓
Even stronger recommendations
        ↓
Repeat
```

### Community data flywheel

```
More families use venues
        ↓
More factual family-focused venue information
        ↓
Better recommendations
        ↓
Higher usefulness
        ↓
More families use FamilyPilot
```

Do not imply community data is automatically trustworthy. Community-contributed information must eventually include verification, recency, and confidence mechanisms.

---

## User Journey

The app should answer questions naturally.

**"What should we do?"**  
→ Activity → Restaurant → Optional second stop → Home

**"Can we meet another family?"**  
→ Recommendations → Travel fairness → Restaurant → Share

**"Can I get formula?"**  
→ Nearby shops → Directions → Opening hours

---

## Home Screen

Keep the simplified Home. **Do not overload it.**

Sections: Greeting · Today's Pick · Quick Actions · More Ideas · Continue Planning

Quick Actions: Go Outside · Indoor Ideas · Need Something Now · **Plan Something**

Plan Something opens: Plan Your Day · Meet Another Family · Plan a Trip

**Do not continue adding Home buttons.**

---

## Strategic Product Evolution

The master vision describes **what** FamilyPilot becomes, not **when** each piece ships. Detailed implementation sequencing lives in [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md).

| Category | Focus |
|----------|-------|
| **Foundation** | Core family profile, discovery, Family Match, and trust |
| **Enrichment** | Restaurants, accessibility, SEND, and deeper venue intelligence |
| **Planning** | Meetups, day planning, and richer trip planning |
| **Expansion** | Travel, shopping, cars, family tools, and connected families |

The exact build order belongs in [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md). This prevents the product constitution from becoming outdated every few weeks.

---

## Architecture Rule

Build the database and navigation so these future features fit naturally.

**Do NOT build everything immediately.**

Document them. Plan them. Create extensible models. Implement only when prioritised.

The Family Graph concept should inform data modelling without requiring a graph database today.

---

## Privacy

- Never expose family addresses
- Never expose children's data
- Never expose another family's information
- Use the minimum information necessary
- Be transparent about what is stored
- Respect accessibility and SEND information as **sensitive user preferences**
- Family DNA inferences must be transparent and editable — never hidden surveillance

Detail: [PRIVACY_MODEL.md](./PRIVACY_MODEL.md)

---

## Success Metrics

The app is successful when parents **stop searching elsewhere** because FamilyPilot gives them enough confidence to make a decision.

The goal is not maximum information.  
**The goal is maximum confidence.**

Beyond downloads, FamilyPilot should measure:

| Metric | Question |
|--------|----------|
| **Decision confidence** | Did the user stop researching after receiving the recommendation? |
| **Repeat utility** | Do families return when another decision arises? |
| **Recommendation acceptance** | How often do users save, visit, plan, or act on recommendations? |
| **Trust** | Do users believe the explanation? |
| **Research reduction** | Does FamilyPilot reduce external searches required? |
| **Recommendation quality** | Do users say "Great suggestion", "Not for us", "Already been", or "Save for later"? |

These feedback loops should eventually improve Family DNA.

**Avoid optimising purely for:** session length, notification clicks, or screen time.

The goal is useful decisions, not attention capture.

---

## The FamilyPilot Promise

Every recommendation FamilyPilot makes should exist to save families time, reduce uncertainty, and help them make decisions with confidence.

We will never knowingly recommend an option solely because it makes FamilyPilot more money.

Commercial relationships must never secretly determine Family Match.

Sponsored content must always be clearly labelled.

We will always explain why something has been recommended.

We will distinguish facts, estimates, community observations, and commercial content.

If we cannot confidently recommend something, we should say so.

Families should be able to trust that their needs come before our commercial interests.

This is a permanent company and product principle.

---

## Commercial Integrity

FamilyPilot may eventually make money from:

- Affiliate links
- Attraction tickets
- Hotel referrals
- Product recommendations
- Car hire
- Premium subscriptions
- Partnerships
- Clearly labelled sponsored listings

**But Family Match must never be secretly manipulated by commission.**

Example: If Hotel A earns FamilyPilot £100 but Hotel B genuinely suits the family better, Hotel B should remain the primary recommendation. FamilyPilot may show Hotel A separately as **Sponsored** or **Partner offer** — but never disguise advertising as personalisation.

Trust is a long-term asset.

---

## Final Principle

Every future decision should be measured against one question:

### Does this help a family make a better decision with less effort?

If yes, it belongs in FamilyPilot.  
If not, it should remain outside the product.

**Final north star:**

FamilyPilot should become the app families instinctively trust whenever they face a practical family decision. The goal is not more information — it is **enough confidence to stop researching and make the decision**.

Every feature, recommendation, partnership, design decision, and future business model must protect that principle.

---

## Documentation Index

| Document | Purpose |
|----------|---------|
| [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md) | **This document — the constitution** |
| [DECISION_PRINCIPLES.md](./DECISION_PRINCIPLES.md) | How to evaluate features and changes |
| [PRODUCT_DIRECTION_V2.md](./PRODUCT_DIRECTION_V2.md) | Detailed feature specifications |
| [VISION_2030.md](./VISION_2030.md) | Long-term product vision |
| [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md) | Phased roadmap with scope labels |
| [INFORMATION_ARCHITECTURE.md](./INFORMATION_ARCHITECTURE.md) | Navigation and screen structure |
| [FAMILY_MATCH.md](./FAMILY_MATCH.md) | Family Match algorithm and UI |
| [FAMILY_GRAPH.md](./FAMILY_GRAPH.md) | Family Graph domain model |
| [DATABASE_FUTURE.md](./DATABASE_FUTURE.md) | Extensible data model |
| [PRIVACY_MODEL.md](./PRIVACY_MODEL.md) | Privacy and data handling |
| [MVP_SCOPE.md](./MVP_SCOPE.md) | What is built vs planned |
| [FUTURE_BACKLOG.md](./FUTURE_BACKLOG.md) | Prioritised future work |

---

*If FamilyPilot succeeds, every new developer or designer reads this document before writing a single line of code.*
