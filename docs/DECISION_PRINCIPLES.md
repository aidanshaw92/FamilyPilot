# FamilyPilot — Decision Principles

**Authority:** [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md)  
**Purpose:** Evaluate every feature, design change, and engineering decision before implementation.

---

## The primary gate

Before building anything, answer:

> **What family decision does this help solve?**

If the answer is unclear → **do not build**.

If the answer is clear → proceed through the checks below.

---

## The final gate

Before merging anything, answer:

> **Does this help a family make a better decision with less effort?**

If no → it remains outside the product.

---

## Core product principles (non-negotiable)

| # | Principle | Implication for builders |
|---|-----------|--------------------------|
| 1 | Reduce decision fatigue | Fewer competing CTAs; clear hierarchy |
| 2 | Reduce typing | Progressive profiling; smart defaults |
| 3 | Reduce research | Surface decision-relevant data early |
| 4 | Explain recommendations | Family Match must show *why* |
| 5 | Save families time | Fewer taps to a confident decision |
| 6 | Feel calm | No urgency patterns unless Need Now |
| 7 | Feel premium | Apple/Airbnb quality bar |
| 8 | Never overwhelm | Especially on Home |
| 9 | Always be trustworthy | Honest labels; no false claims |
| 10 | Build long-term confidence | Consistency beats novelty |

---

## What we will not build

Even if requested, reject or defer if it turns FamilyPilot into:

- A booking app (we recommend; parents book elsewhere)
- A parenting forum or social feed
- A generic social network or engagement feed
- A review spam platform or pay-to-win recommendation engine
- A travel agent checkout flow
- A restaurant reservation service
- A generic directory
- An AI chatbot front-end
- A cluttered advertising platform or booking site pretending to be impartial
- A product that maximises screen time at the expense of family time

---

## Feature classification

Every proposed feature must be labelled:

| Label | Meaning |
|-------|---------|
| **MVP** | Required for current testing or launch slice |
| **Post-MVP** | Next validated priority after user feedback |
| **Future Vision** | Documented, architecturally prepared, not scheduled |
| **Long-term Research** | Exploratory; no commitment |

See [MVP_SCOPE.md](./MVP_SCOPE.md) and [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md).

---

## Design decisions

Reference apps: **Apple · Airbnb · Headspace · Apple Maps**

Avoid: busy parenting apps, generic templates, directory layouts.

Visual tone: **Warm · Premium · Simple · Friendly · Modern · Calm**

---

## Home screen rule

Do **not** add primary Home buttons for every new feature.

New capabilities enter through:

- Contextual surfaces (venue detail, activity cards)
- **Plan Something** sub-menu
- Explore categories and filters

---

## Trust rules

Never claim without verified data:

- Accessibility suitability (use factual attributes)
- SEND suitability for a specific diagnosis
- Allergy safety
- Live stock or inventory
- Exact opening hours unless sourced
- Exact pricing unless estimated and labelled
- "Why Families Love It" summaries without sufficient underlying evidence

Prefer: *"Usually available" · "Estimated family cost" · "Sensory session: Sundays 9–10am"*

---

## Commercial integrity

Family Match must **never** be secretly manipulated by commission or affiliate revenue.

- If a sponsored option earns more but a different option suits the family better, the better option remains primary
- Sponsored content must always be clearly labelled (*Sponsored*, *Partner offer*)
- Never disguise advertising as personalisation
- Distinguish facts, estimates, community observations, and commercial content

See [MASTER_PRODUCT_VISION.md § The FamilyPilot Promise](./MASTER_PRODUCT_VISION.md).

---

## Architecture decisions

When choosing data models or navigation:

1. Will Phase 3–8 features fit without a rewrite?
2. Does this extend the family profile, not duplicate it?
3. Does Family Match consume the new data?
4. Is the minimum data collected (privacy)?

See [DATABASE_FUTURE.md](./DATABASE_FUTURE.md).

---

## Success metrics

Parents stop searching elsewhere because FamilyPilot provides **enough confidence** to decide.

Maximum confidence — not maximum information.

| Metric | What it measures |
|--------|------------------|
| Decision confidence | User stopped researching after recommendation |
| Repeat utility | Families return for new decisions |
| Recommendation acceptance | Saves, visits, plans, actions taken |
| Trust | Users believe the explanation |
| Research reduction | Fewer external searches required |
| Recommendation quality | Feedback: great / not for us / already been / save for later |

**Avoid optimising for:** session length, notification clicks, screen time.

The goal is useful decisions, not attention capture.

---

## Escalation

If a request conflicts with [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md):

1. Do not implement silently
2. Document the conflict
3. Propose an alternative that preserves the vision
4. Update roadmap docs if the vision legitimately evolves (requires explicit product decision)

---

*Read [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md) first. Always.*
