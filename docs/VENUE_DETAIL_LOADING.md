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

The full screen needs the detail request and nothing else. Measured (simulated latencies, local fixture), with the detail
request at 150 ms and one other request slow:

| Slow dependency | Full screen, #167 baseline | Full screen now |
| --- | ---: | ---: |
| none | about 280 ms | about 280 ms |
| weather, 9 s | about 1.6 s | **about 280 ms** |
| parent feedback, 4 s | about 3.1 s | **about 280 ms** |

- **Weather: out of the blocking path.** It is not an input to Family Fit (see `STABLE_FAMILY_FIT.md`). The page asks for
  it on its own and draws one quiet line on the Today card when it arrives (`useWeather`, cached from Home).
- **Parent feedback: out of the blocking path.** `getById` waits for the detail alone. `useParentObservations` starts only
  once the real detail is on screen (never for the card standing in for it) and `venueService.withParentObservations`
  applies the result to the detail already shown. Capped at 3 s inside `fetchParentObservations`, one request, resolves to
  nothing on any failure. Planning never reads it: the plan sheet reads the same venue query, which carries no reports.

### The risk this takes, and the safest alternative

Parent reports can **withdraw** a fact ("Toilets needs rechecking: recent parent reports differ from the venue's own
information") or add a labelled parent-reported line. Rendering the venue's own facts first means that, for a venue with a
contradicted fact, the parent can read the official line for up to about 3 s before the correction replaces it, and the
verdict can move down one step when it does (it can never move up: reports never raise a verdict, a test checks this).

- Why this is acceptable: the official line is the venue's own published fact and is shown as such; a single report never
  reaches Family Fit; corroborated reports are always labelled "parent-reported, not confirmed by the venue"; the claim
  itself is never edited. Today there are no parent reports to apply (`venue_visit_reports` has 0 active rows on 2026-10-07, read-only count), so no family sees a
  correction in the beta unless parents start contradicting a fact.
- What can jump: only the lines inside the Family Fit card that change, and the Today card gaining its weather line. Nothing
  above them moves (the name, photograph and badge are drawn before and are not re-laid out by the correction).
- **Safest alternative if this proves unacceptable:** keep the page non-blocking but hold only the Family Fit card behind a
  short skeleton (about 800 ms) for venues that have reports, found from a flag on the detail response. That removes the
  visible change at the cost of one small server-side flag. Not built: no venue has reports yet.

## Run it

```bash
npm run build:web -- --clear
node scripts/serve-places-fixture.mjs 4173 dist &
node scripts/verify-venue-detail-loading.mjs http://127.0.0.1:4173
```

`--expect-legacy` measures without asserting, which is how the before numbers were taken.
