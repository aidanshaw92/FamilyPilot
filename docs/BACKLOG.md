# FamilyPilot — Backlog

Items deferred from remediation QA and planned V2 features. **None of the V2 features below are implemented.**

Full specifications: [PRODUCT_DIRECTION_V2.md](./PRODUCT_DIRECTION_V2.md)

---

## Post-remediation polish (non-blocking)

- Profile edit rows — visual only, no edit flow
- Trips Start trip / Edit — placeholder buttons
- Saved empty state — requires clearing mock saved data to demo
- Home loading skeleton — mock API too fast to see in normal use
- Explore "Map (coming soon)" — real map integration
- JS bundle code splitting (~2.9MB)
- Native swipe-to-remove on Saved
- Pull-to-refresh on data screens
- Real maps provider for GO / Directions
- Live inventory API for Need Now
- Concierge screen (route registered, screen missing)
- Grammar: "1 years old" on Profile child row

---

## Product Direction V2 (planned — after parent testing)

Implementation order per [PRODUCT_DIRECTION_V2.md §13](./PRODUCT_DIRECTION_V2.md#13-updated-roadmap):

| Priority | Feature | Status |
|----------|---------|--------|
| 1 | Family-friendly restaurant data + **Eat Nearby** | Not started |
| 2 | Accessibility fields, profile preferences, filters | Not started |
| 3 | SEND-friendly venue information + filters | Not started |
| 4 | **Meet Another Family** (one-phone two-postcode mode) | Not started |
| 5 | **Plan Your Day** (itinerary builder) | Not started |
| 6 | Connected Families (invite other profiles) | Not started |

### Supporting work (when features ship)

- Extended venue schema (`accessibility_features`, `send_features`, `restaurant_features`)
- Combined Family Match for meetups
- Shareable plan pages (browser-readable, no account required)
- Explore category expansion + progressive filter sheet
- Venue detail sections: Accessibility, SEND, Eat nearby, Meet here
- Profile progressive preferences (accessibility, SEND, dining)
- Privacy-safe location handling for meetups

---

## Explicitly out of scope (do not build)

- Repositioning FamilyPilot as a day planner only
- Social networking feeds
- Requiring FamilyPilot download to read shared meetup plans
- Exposing private home addresses in shares
- Claiming SEND suitability or accessibility without sourced data
- Claiming allergy safety without verification
- Overloading Home with new primary buttons
- Building all V2 features before user testing completes
