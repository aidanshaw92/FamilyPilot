# FamilyPilot — Master Product Vision (Version 2)

> **IMPORTANT — Read before any code change**
>
> This document defines the long-term vision of FamilyPilot.  
> It is more important than any previous prompt.  
> **Do not overwrite this vision. Do not simplify it. Do not reinterpret it.**  
> Use it as the foundation for every future decision.

**Status:** Canonical product constitution  
**Audience:** Every developer, designer, and agent working on FamilyPilot  
**Related:** [DECISION_PRINCIPLES.md](./DECISION_PRINCIPLES.md) · [PRODUCT_DIRECTION_V2.md](./PRODUCT_DIRECTION_V2.md) · [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md)

---

## Mission

FamilyPilot exists to help families make better everyday decisions.

It should remove uncertainty, reduce research time and give parents confidence.

The goal is **not** to replace Google.  
The goal is **not** to replace ChatGPT.  
The goal is **not** to become another parenting app.

The goal is to become **the first app parents instinctively open whenever they need to decide something for their family**.

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

- A booking app
- A parenting forum
- A social network
- A travel agent
- A restaurant booking service
- A directory
- An AI chatbot

---

## FamilyPilot IS

**A personalised family decision platform.**

One family profile powers every recommendation.

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

## The Family Profile

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
- **Family DNA™**

The user should **never repeatedly enter the same information**.

---

## Family Match™

Family Match powers every recommendation.

It should eventually consider:

- Children's ages
- Travel time
- Budget
- Weather
- Accessibility
- Facilities
- SEND suitability
- Restaurants nearby
- Parking
- Pushchair friendliness
- Family interests
- Previous behaviour
- Travel fairness

**Never simply display a percentage. Always explain why.**

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

Restaurants are **first-class recommendations** — not generic listings.

Each restaurant should eventually include: Family Match, kids menu, high chairs, baby changing, pushchair space, accessibility, SEND suitability, noise level, outdoor seating, play area, parking, estimated family spend, dietary options, children's offers, opening hours.

Recommendations should **always appear alongside activities**.

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

**Version 1:** One phone · Two addresses · Children's ages → best place to meet (not simply midpoint). Balances travel, facilities, children, restaurants, accessibility, weather, budget, parking, Family Match. Shareable without account.

**Version 2:** Connected Families — invite friends, grandparents, cousins, neighbours. Combined recommendations from both profiles.

### 🗓 Plan Your Day

Plan Your Day is a **feature**. It is **NOT** the main product.

Generate: Morning activity · Lunch · Optional afternoon stop · Estimated cost · Travel · Return home.

Everything should remain **editable**.

### ♿ Accessibility

Accessibility is part of **every venue** — not a separate feature.

Store: Step-free, accessible toilets, Changing Places, accessible parking, flat terrain, lift, accessible seating, wheelchair play equipment, surface type, gradient.

Accessibility preferences should influence Family Match.

### 🧩 SEND-Friendly

Store **factual information** only: Quiet sessions, sensory sessions, visual schedules, ear defenders, quiet room, staff training, carer tickets, queue support.

**Never guess. Never make unsupported claims.**

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

## User Journey

The app should answer questions naturally.

**“What should we do?”**  
→ Activity → Restaurant → Optional second stop → Home

**“Can we meet another family?”**  
→ Recommendations → Travel fairness → Restaurant → Share

**“Can I get formula?”**  
→ Nearby shops → Directions → Opening hours

---

## Home Screen

Keep the simplified Home. **Do not overload it.**

Sections: Greeting · Today's Pick · Quick Actions · More Ideas · Continue Planning

Quick Actions: Go Outside · Indoor Ideas · Need Something Now · **Plan Something**

Plan Something opens: Plan Your Day · Meet Another Family · Plan a Trip

**Do not continue adding Home buttons.**

---

## Roadmap (Phases)

| Phase | Focus |
|-------|-------|
| **1** | Core platform, Explore, Family Match, Saved, Need Something Now, Trips, Testing |
| **2** | User feedback, Polish, Bug fixes, Performance |
| **3** | Eat Nearby, Family-friendly restaurants, Restaurant recommendations |
| **4** | Accessibility, Accessibility filters, Venue model |
| **5** | SEND-Friendly, Venue attributes, Filters |
| **6** | Meet Another Family (one phone, two addresses, share plan) |
| **7** | Plan Your Day (automatic itinerary, editable plans) |
| **8** | Connected Families (shared profiles, meetups, collaborative planning) |

Detail: [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md)

---

## Architecture Rule

Build the database and navigation so these future features fit naturally.

**Do NOT build everything immediately.**

Document them. Plan them. Create extensible models. Implement only when prioritised.

---

## Privacy

- Never expose family addresses
- Never expose children's data
- Never expose another family's information
- Use the minimum information necessary
- Be transparent about what is stored
- Respect accessibility and SEND information as **sensitive user preferences**

Detail: [PRIVACY_MODEL.md](./PRIVACY_MODEL.md)

---

## Success Metric

The app is successful when parents **stop searching elsewhere** because FamilyPilot gives them enough confidence to make a decision.

The goal is not maximum information.  
**The goal is maximum confidence.**

---

## Final Principle

Every future decision should be measured against one question:

### Does this help a family make a better decision with less effort?

If yes, it belongs in FamilyPilot.  
If not, it should remain outside the product.

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
| [DATABASE_FUTURE.md](./DATABASE_FUTURE.md) | Extensible data model |
| [PRIVACY_MODEL.md](./PRIVACY_MODEL.md) | Privacy and data handling |
| [MVP_SCOPE.md](./MVP_SCOPE.md) | What is built vs planned |
| [FUTURE_BACKLOG.md](./FUTURE_BACKLOG.md) | Prioritised future work |

---

*If FamilyPilot succeeds, every new developer or designer reads this document before writing a single line of code.*
