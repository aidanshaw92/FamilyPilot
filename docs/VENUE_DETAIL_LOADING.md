# Venue Detail loading

How the venue screen opens, what it may show before its own data arrives, and what holds it up. Measured with
`familypilot/scripts/verify-venue-detail-loading.mjs` (real browser, local fixture, zero provider requests).

**Every timing below is simulated.** The production host cannot be reached from the sandbox, so the detail, weather and
parent-feedback requests are held back by fixed amounts. The numbers show what the code does for a given connection, not
how slow production is.

## What the screen does

1. A card on Home, Explore or Halfway hands the tapped venue to `venue-detail-seed.ts` and navigates.
2. The venue screen asks for the full detail with `useVenue(id, { showCardWhileLoading: true })`. While that request is
   out, React Query's `placeholderData` supplies the card.
3. While `isPlaceholderData` is true the screen draws only what the card showed: name, photograph, fit badge, category and
   travel time. A labelled skeleton ("Getting the details for …") stands where the fit explanation, today's opening state,
   the plan action, what to know, More and Evidence go. The "Why this fit" link is inert and invisible until then.
4. When the detail arrives it replaces the card wholesale. Nothing is merged.

## The guarantees, and how each is checked

| Guarantee | Check |
| --- | --- |
| Card data never becomes authoritative detail | Placeholder data is never written to the cache (`venue-detail-seed.test.ts`, through a real `QueryObserver`) |
| Planning cannot proceed on placeholder data | Only the venue screen opts in. Planning's own observer on the same query stays pending with no data (test); `app/plan.tsx` and the restaurant page are checked not to opt in |
| A cached full detail is never replaced by a card | `placeholderData` is not used once data is cached (test) |
| A failed request cannot leave misleading information | The error screen replaces the card; nothing evidence-backed is drawn (test, and browser: request aborted, error at about 1.1 s, no card, no plan button) |
| Deep links and reloads | Nothing is handed over, so they show the plain loading screen, never the card (browser, both) |
| No extra provider requests | No endpoint is requested more than once after the tap; zero requests to provider hosts (browser) |
| Nothing jumps | The venue name moves 0 to 2 px when the real screen replaces the card (browser) |
| Privacy | The seed is memory only, expires after 5 minutes, is dropped by any profile change, and is never created for a card that was not scored for the family |

## What holds up the full screen

The full screen needs the detail request, today's weather and the parent-feedback read. They run in parallel, and the
screen waits for the slowest. Measured, with the detail request at 150 ms and one other request slow:

| Slow dependency | Full screen before this PR | Full screen now |
| --- | ---: | ---: |
| none | about 340 ms | about 280 ms |
| weather, 9 s | **about 9.1 s** | about 1.6 s |
| parent feedback, 4 s | about 3.1 s | about 3.1 s |

- **Weather: fixed.** It is one soft line on the page, and a hung weather read held the whole screen for as long as it took.
  The page now gives it 1.5 s and goes ahead without it (`soft-deadline.ts`). The artificial 200 ms floor on the detail
  request is also gone.
- **Parent feedback: not changed, recorded as a follow-up.** `fetchParentObservations` is capped at 3 s by design, and
  holds the screen for up to that long because the observations can withdraw a fact from Family Fit ("needs recheck").
  Rendering without them first and correcting afterwards would show a confirmed fact that then disappears, which is
  worse than a short wait. The right fix is to render the full screen at once and apply observations when they arrive,
  with the change made visible, which is a behaviour change to design, not a low-risk patch.

## Run it

```bash
npm run build:web -- --clear
node scripts/serve-places-fixture.mjs 4173 dist &
node scripts/verify-venue-detail-loading.mjs http://127.0.0.1:4173
```

`--expect-legacy` measures without asserting, which is how the before numbers were taken.
