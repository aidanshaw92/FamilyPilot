# The Create a Plan journey, as it actually renders

Screens captured by `familypilot/scripts/verify-create-plan-journey.mjs`, which walks
HOME → VENUE DETAIL → CREATE A PLAN → GENERATING → PLAN in a real browser at four phone widths and
asserts what each screen shows.

Everything here was produced against `scripts/serve-places-fixture.mjs`: synthetic venues invented
for this purpose, served on the same origin as the exported bundle. **No Google Places or Distance
Matrix request is made by this run**, and nothing in these images is Google content. Journey times
come from the same distance estimator the deployed endpoint falls back to when Google is disabled,
which is why the Plan screen labels them "Estimated from distance".

The fixture's venues carry no reviewed metadata, which is the honest worst case and the common one
in production today: every claim-backed fact is unconfirmed. These captures therefore also show the
unconfirmed states, which is the point — a day built on facts nobody has checked must say so.

## Running it

```
npm run build:web
node scripts/serve-places-fixture.mjs 4173 dist &
node scripts/verify-create-plan-journey.mjs http://127.0.0.1:4173
```

`ONLY_VIEWPORT=360x800` narrows it to one width while diagnosing a layout problem.

## What is not here yet

**Lunch.** The approved Plan shows a day with a meal stop. `createPlan` accepts a meal and schedules
it as a stop in its own right, but nothing in production currently supplies one: Venue Detail's "Eat
nearby" is served from `src/data/mock-restaurants`, keyed on mock activity ids, so it returns nothing
for a real venue. A restaurant search inside the Create a plan button would be a billable Google call
on every press, so the day is built without a meal rather than buying one — and the Generating steps
omit the lunch line entirely instead of showing progress for work that does not happen. A real
nearby-restaurant source is the next thing this journey needs.
