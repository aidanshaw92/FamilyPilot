# FamilyPilot — Design Review Screenshots

Automated screenshot pack captured with Playwright after the first-time user experience (FTUE) build.

## Viewports

| Folder | Size | Device reference |
|--------|------|------------------|
| `390x844/` | 390×844 @2x | iPhone 14 / 15 |
| `430x932/` | 430×932 @2x | iPhone 14 Pro Max / 15 Plus |

## Screens included

| File | Screen |
|------|--------|
| `01-splash.png` | Premium splash (animated state settled) |
| `02-landing.png` | One-sentence landing / welcome |
| `03-onboarding-step-1-name.png` | Onboarding — your name |
| `04-onboarding-step-2-location.png` | Onboarding — home area |
| `05-onboarding-step-3-children.png` | Onboarding — children |
| `06-onboarding-step-4-preferences.png` | Onboarding — drive time & budget |
| `07-home.png` | Home (post-onboarding, personalised) |
| `08-explore.png` | Explore |
| `09-venue-detail.png` | Venue detail (`venue-1`) |
| `10-need-now.png` | Need Something Now |
| `11-holiday.png` | Holiday comparison |
| `12-packing.png` | Packing list |
| `13-car-fit.png` | Car Fit |
| `14-saved.png` | Saved places |
| `15-profile.png` | Profile |
| `16-edit-profile.png` | Edit profile |
| `17-empty-venue-not-found.png` | Empty state — venue not found |
| `18-empty-explore-filters.png` | Empty state — no explore results (Indoor + Parks) |
| `19-empty-saved-search.png` | Empty state — saved search with no matches |

Post-onboarding screens use a seeded demo profile: **Sarah** family with **Mia** (4) and **Leo** (1) in Bushey.

## Regenerate

From `familypilot/`:

```bash
npm run screenshots:design-review
```

Or against a deployed URL:

```bash
npm run build:web
node scripts/capture-design-review.mjs https://family-pilot-seven.vercel.app
```

The script waits for `document.fonts.ready`, network idle, and animation settle time before each capture.
