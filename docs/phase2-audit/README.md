# Phase 2 audit of the approved journey

`familypilot/scripts/audit-journey-phase2.mjs` walks HOME → VENUE DETAIL → CREATE A PLAN →
GENERATING → PLAN at 360, 390, 393 and 430, once more with real iPhone safe-area insets, and then
drives the `/plan` links the Create a Plan sheet cannot produce.

Everything runs against `scripts/serve-places-fixture.mjs`: synthetic venues served on the bundle's
own origin. **No Google Places or Distance Matrix request is made.** Journey times come from the same
distance estimator the deployed endpoint falls back to, which is why the Plan labels them estimated.

`findings.json` holds every check and its result. `393x852/` is the reference width; `links/` holds
the adversarial cases. The other widths are produced on each run and uploaded by CI rather than
committed — see `.gitignore` here.

## What the fixture had to grow to make this honest

Every base fixture venue returned `metadata: null`, so no browser check in this project had ever
rendered a venue whose family facts are **confirmed** — only the unknown path. A screen that says
"not confirmed" correctly and then mangles a known fact passed everything we had, and one did: the
detail column title-cased a venue's reviewed parking prose into "Free On-Site Car Park, About 120
Spaces, Busiest Before 11am At Weekends."

So the fixture now serves venues that exist only on the detail endpoint: confirmed facts throughout,
a ninety-character name, no photograph, no published hours, and one that shuts at 09:30. They are
deliberately absent from the search payload, because Home's visual regression measures the deck
against a locked Figma frame and a design check should not fail over a fixture change.

## Safe-area insets

They are emulated by overriding the safe-area provider's probe element with an `!important` rule,
installed before the app boots. A desktop browser computes `env(safe-area-inset-*)` as 0 and a CSS
custom property does not feed `env()`, so a style tag added after navigation changes nothing — an
earlier version of this audit did exactly that and asserted against a number the layout never
received.
