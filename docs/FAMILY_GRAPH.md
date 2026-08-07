# FamilyPilot — Family Graph™

**Authority:** [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md)  
**Status:** Conceptual domain model — Future Vision  
**Purpose:** Describe how family context interconnects to power Family Match and Family DNA

---

## What is Family Graph?

**Family Graph™** is the internal name for FamilyPilot's relationship layer — the interconnected model of everything that makes a family unique and influences decisions.

FamilyPilot should **not** treat the user as a flat profile. A family is a graph of entities and relationships that Family Match reads when scoring recommendations.

This is a **conceptual domain model first**. Do not implement a graph database merely because the concept is called Family Graph. Current architecture should avoid decisions that would prevent this model from emerging later.

---

## Core entities

| Entity | Description | Examples |
|--------|-------------|----------|
| **Family** | Root container for all family-scoped data | The Smith family |
| **Parent** | Adult account holder(s) | Name, auth ID |
| **Child** | Family member used for age/suitability matching | Age, interests (optional) |
| **Vehicle** | Transport context for Car Fit and travel | Boot dimensions, seats |
| **Equipment** | Pushchairs, car seats, bikes, scooters | Dimensions, requirements |
| **Preference** | Explicit user-stated requirements | Accessibility, SEND, dietary |
| **Membership** | Passes and savings opportunities | National Trust, Merlin |
| **SavedPlace** | Venues the family has bookmarked | Parks, restaurants |
| **Trip** | Planned or past outings | Day plans, holidays |
| **Connection** | Link to another family (Connected Families) | Friends, grandparents |
| **FamilyDNA** | Learned patterns over time | Typical drive distance, spend |
| **Recommendation** | Scored suggestion with explanation | Family Match output |

---

## Relationship model

```
Family
├── has → Parent(s)
├── has → Child(ren)
│         ├── has → Age
│         └── has → Interest(s)
├── has → Preference(s)
│         ├── AccessibilityRequirement
│         ├── SendPreference
│         └── DietaryPreference
├── has → Vehicle(s)
├── has → Equipment
├── has → Membership(s)
├── has → SavedPlace(s)
├── has → Trip(s)
├── connects → Family (via Connection)
└── accumulates → FamilyDNA
              └── informs → Recommendation(s)
```

---

## How Family Graph powers Family Match

Family Match reads from the graph at scoring time:

| Graph source | Match use |
|--------------|-----------|
| Child ages | Age suitability |
| Preferences | Hard filters / score adjustments |
| Vehicle + Equipment | Car Fit, travel feasibility |
| Saved places | Boost familiar venues; avoid repeats if rejected |
| Family DNA | Learned distance, spend, environment preferences |
| Connection (meetups) | Combined profile for multi-family scoring |
| Trip context | Current plan influences restaurant and stop suggestions |

---

## Family DNA on the graph

Family DNA is not a separate silo — it is **learned edges and weights** on the graph:

- `Family → prefers → quiet_restaurants` (inferred, editable)
- `Family → typically_drives → ≤25 min` (inferred, editable)
- `Family → favours → outdoor_when_sunny` (inferred, editable)
- `Family → rejects → crowded_venues` (from feedback signals)

**Rules:**

- Inferences must be explainable to the user
- Important inferred preferences should eventually be viewable and editable
- Do not infer sensitive attributes unnecessarily
- Never behave like hidden surveillance

Detail: [PRIVACY_MODEL.md § Family DNA](./PRIVACY_MODEL.md)

---

## Connected Families on the graph

When two families connect for planning:

```
Family A ──Connection── Family B
     │                      │
     └── Combined Match ────┘
              ↓
     Meetup / Day Plan Recommendation
```

Connected Families is **not** a social network. Connections exist for practical planning only — no public profiles, follower counts, or feeds.

Privacy: explicit invite + accept; granular permissions; either party can disconnect.

---

## Privacy implications

| Entity / data | Classification | Rule |
|---------------|----------------|------|
| Child age | Family profile | RLS; never in public shares |
| Accessibility / SEND prefs | Sensitive | Progressive collection; never for marketing |
| Family DNA inferences | Behavioural | Transparent; editable; opt-in where required |
| Connection | Account | Consent before sharing prefs across families |
| Saved places | Behavioural | Private unless user shares a plan |
| Home location | Sensitive | Postcode/centroid only; never in shares |

See [PRIVACY_MODEL.md](./PRIVACY_MODEL.md) for full policy.

---

## Future architectural considerations

When implementing profile or venue features, ask:

1. Does this data belong on a **node** (entity) or an **edge** (relationship)?
2. Will Family Match need to traverse this relationship later?
3. Can we store it in relational tables today without blocking graph-like queries?
4. Is the minimum data collected (privacy)?

**Acceptable today:**

- Relational tables (`families`, `children`, `vehicles`, `saved_places`, etc.)
- JSONB for flexible preference blobs
- Foreign keys and family-scoped RLS

**Not required today:**

- Graph database (Neo4j, etc.)
- Real-time graph traversal engine
- Full Family DNA inference pipeline

Schema direction: [DATABASE_FUTURE.md](./DATABASE_FUTURE.md)

---

## Related documents

| Document | Purpose |
|----------|---------|
| [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md) | Family Graph in product vision |
| [FAMILY_MATCH.md](./FAMILY_MATCH.md) | How Match consumes graph data |
| [PRIVACY_MODEL.md](./PRIVACY_MODEL.md) | Data handling rules |
| [DATABASE_FUTURE.md](./DATABASE_FUTURE.md) | Table design |
| [PRODUCT_DIRECTION_V2.md §5](./PRODUCT_DIRECTION_V2.md) | Connected Families spec |

---

*Family Graph is how FamilyPilot thinks about families. Implement incrementally; design deliberately.*
