# FamilyPilot — Privacy Model

**Authority:** [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md)  
**Status:** Policy + technical requirements — applies to all phases

---

## Privacy principles

1. **Minimum necessary data** — Collect only what improves decisions
2. **Transparency** — Users know what is stored and why
3. **No exposure by default** — Addresses, children's details, and preferences are private
4. **Sensitive preferences** — Accessibility and SEND flags treated as sensitive
5. **Share safely** — Shared plans reveal venues and travel *times*, not home locations
6. **No selling data** — Family data is not a product

---

## Data classification

| Class | Examples | Handling |
|-------|----------|----------|
| **Public** | Venue names, public facility flags | Cacheable, CDN |
| **Account** | Email, auth ID | Supabase Auth, RLS |
| **Family profile** | Children ages, budget, vehicles | RLS, family-scoped |
| **Sensitive preferences** | Accessibility requirements, SEND needs | RLS, optional, progressive |
| **Location (session)** | Postcode for meetup calculation | Minimise retention |
| **Location (saved)** | Home area / postcode | Never in public shares |
| **Behavioural** | Saves, plan history, Family DNA inferences | RLS, transparent, editable, future opt-in |

---

## Rules (non-negotiable)

### Never expose

- Exact family home addresses in shared links or to other users
- Children's full names to other families without explicit consent
- Another family's profile, preferences, or location
- Accessibility/SEND requirements to third parties without consent

### Meet Another Family (Phase 6)

| Allowed | Not allowed |
|---------|-------------|
| Postcode or general area for **calculation** | Full street address in share payload |
| "Your family: 27 min" in share | "From WD6 3BA" in share |
| Venue name + map pin (venue location) | Either family's home coordinates |
| Optional save of plan to account | Storing friend's address permanently without consent |

**Implementation:** Geocode postcodes server-side; discard raw input after session unless user saves plan; share tokens contain venue + times only.

### Connected Families (Phase 8)

- Invite + accept required before sharing preferences
- Granular permissions (`connection_permissions`)
- Either party can disconnect and revoke access
- No public family directory or search

---

## Children's data

- Collect **minimum**: name (optional), age or date of birth for matching
- No photos of children required — initials / avatars only
- Ages used for Family Match, not advertising profiles
- COPPA/GDPR-K considerations before launch in relevant markets
- Parent account holder controls all child records

---

## Location data

| Use case | Storage | Retention |
|----------|---------|-----------|
| Home area (profile) | Postcode or lat/lng centroid | Until user deletes |
| Current location (session) | Device-only preferred | Not persisted by default |
| Meetup calculation | Transient | Delete after plan generated unless saved |
| Directions | Delegated to Maps app | No storage |

Prefer **postcode/general area** over full address where sufficient for drive time.

---

## Family DNA & learned preferences

Family DNA represents patterns FamilyPilot learns over time (typical drive distance, spend, environment preferences).

| Rule | Implementation |
|------|----------------|
| Transparent | User can see why a preference exists |
| Editable | Important inferences viewable and correctable |
| Minimum inference | Do not infer sensitive attributes unnecessarily |
| Not surveillance | Never hidden behavioural profiling |
| Feedback-driven | Saves, rejects, and explicit feedback improve DNA |

Family DNA must comply with applicable data protection law before production personalisation ships.

---

## Accessibility & SEND preferences

- Stored as user preferences, not medical records
- Used only for matching and filtering
- Never used for marketing segmentation
- User can clear at any time
- Displayed only on own profile unless explicitly shared (Connected Families, future)

---

## Third-party providers

| Provider type | Data sent | Requirement |
|---------------|-----------|-------------|
| Maps / routing | Origin/destination coordinates | Minimise; use centroids |
| Places API | Search area, category | No PII in queries |
| Weather | Location area | Coarse location |
| Inventory | Store search area | No child data |
| Analytics (if any) | Anonymised events | No PII; opt-in where required |

Document each integration in privacy policy before production launch.

---

## Shared plan pages (Future Vision)

Public URL: `/share/meetup/{token}` or `/share/plan/{token}`

**May include:** Venue, date/time, drive durations per party label ("Family A"), facilities, Family Match, restaurant suggestion, estimated cost

**Must not include:** Home addresses, postcodes, children's names, account emails, internal user IDs

Tokens: unguessable, optional expiry, revocable by creator.

---

## Transparency (user-facing)

Profile should eventually include:

- What data FamilyPilot stores
- How Family Match uses preferences
- How to export / delete data
- Link to full privacy policy

Testing build includes discreet notice: *prototype data* — see Profile.

---

## Security (technical)

- Supabase RLS on all family-scoped tables
- Auth required for profile write
- Share tokens read-only via edge function or RLS policy
- No secrets in client (API keys server-side or restricted)
- HTTPS everywhere (Vercel default)

---

## Agent / developer rule

When implementing any feature that touches location, children, or preferences:

1. Read this document
2. Default to **less** data collection
3. Never log addresses or child PII to analytics
4. Flag conflicts in PR description

---

## Related documents

- [DATABASE_FUTURE.md](./DATABASE_FUTURE.md) — RLS and table design
- [PRODUCT_DIRECTION_V2.md §12](./PRODUCT_DIRECTION_V2.md) — Meetup privacy
- [PARENT_TESTING_GUIDE.md](./PARENT_TESTING_GUIDE.md) — Tester expectations

---

*Privacy enables trust. Trust enables the mission: confident family decisions.*
