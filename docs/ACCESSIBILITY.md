# Accessibility

`familypilot/scripts/audit-accessibility.mjs` audits the running web build (axe-core WCAG 2.0 to 2.2 A/AA, plus
checks axe cannot make) across Welcome, Home, Explore, the Explore filter sheet, Saved and Venue Detail at 320
(the WCAG reflow width), 360, 393 and 430. It is clean on both fixture scenarios.

```
node scripts/serve-places-fixture.mjs 4173 &
FIXTURE_SCENARIO=realistic node scripts/serve-places-fixture.mjs 4175 &
node scripts/audit-accessibility.mjs http://127.0.0.1:4175 [out.json]
```

| Check | How |
| --- | --- |
| WCAG A/AA rules (names, roles, ARIA validity, contrast, titles, labels) | axe-core |
| Touch targets under 44 x 44 | measures the area that really answers a pointer with `elementFromPoint`, so hit slop counts only where it works |
| Controls with no accessible name | text, `aria-label`, `aria-labelledby`, placeholder, title |
| Decorative artwork exposed | every drawn `svg` must be under `aria-hidden` or inside a labelled `role=img` |
| Visible keyboard focus | tabs through each page; the control or its field must show an outline |
| Selected state | tabs must carry `aria-selected`; chips carry `aria-pressed` |
| Dialogs | the page behind an open dialog must be inert / `aria-hidden` |
| Reading order | DOM order matches the visual order of what is on screen (pages; not scrolling dialogs) |
| Reflow | no horizontal scrolling at 320 |

What it found and what changed: selection was told by colour alone on the web (react-native-web does not turn
`accessibilityState` into ARIA); the placeholder and footnote grey was 3.0:1; controls drawn under 44 relied on
`hitSlop`, which the web ignores; buttons were nested in buttons (the deck card, Explore card and Home search),
which no screen reader can traverse; the filter sheet left the page behind it reachable; pages had no `<title>`;
the brand mark was announced next to its own wordmark; the search field had no focus ring.

Design decisions that follow from it: a card is one button and its CTA is a visible cue, not a second button; a
control with a small drawn size gets a real 44pt pressable around it; selection is never colour alone.

## MANUAL DEVICE QA REQUIRED (not done, not claimed)

The audit above is a browser audit. These three cannot be reached from a browser, have **not** been run, and are
pre-release items. Nothing in this repository claims they passed.

| Item | What to check | Status |
| --- | --- | --- |
| **iOS VoiceOver** | Every control is announced with a name, role and state (tabs "selected", filter chips "pressed", the save heart "Save place" / "Remove from saved"); each venue card is one button, not two; the decorative art, brand mark and Welcome collage are skipped; focus order follows the visual order on Welcome, Home and Explore; the filter sheet traps focus | **MANUAL DEVICE QA REQUIRED** |
| **Android TalkBack** | The same checks; the floating tab bar reads as a tab list with the current tab selected; 44 dp touch targets are reachable by explore-by-touch | **MANUAL DEVICE QA REQUIRED** |
| **OS larger text / Dynamic Type** | At the largest accessibility size on iOS and Android font scale 200%: no clipped or overlapping text on Welcome, Home (greeting against the avatar strokes, search placeholder) and Explore (card title, Family Fit pill, CTA); the Home greeting and Welcome headline reflow rather than truncating; nothing becomes unreachable | **MANUAL DEVICE QA REQUIRED** |

They depend on the semantics checked here (roles, names, states, order) and on the reflow logic, which the
responsive checks cover at 360, 393 and 430 CSS pixels, but a screen reader and the system text scale are
different environments and still need a person with a device before launch.
