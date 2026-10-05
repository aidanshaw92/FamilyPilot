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

Not covered, because a browser cannot reach them: VoiceOver and TalkBack, and the operating system's larger-text
setting. Both depend on the semantics checked here (roles, names, states, order) and on reflow, but still deserve
a manual pass on a device before launch.
