# Families action: independent review against the approved geometry and small iPhones

2026-10-08. A second look at `FamiliesAction` on Home and Explore, this time **against the approved Figma frames** (file
`LNpbdnuAWcfWf9spvB7jBz`, Home `229:133`, Explore `294:133`, read this session through the Figma tools; the first pass could
not open the file), and at the smallest current iPhone sizes. Chromium at phone viewports, the local fixture, no provider.
**Not a real device**, and not with the OS's larger-text setting (see the end).

## 1. Geometry, from the frames (a 393 pt phone is drawn 852 px wide, so pt = px / 2.168)

| Element | Figma | App at 393 x 852 | Verdict |
| --- | --- | --- | --- |
| Home: avatar | x 322.4 to 368.5, 46 pt | right edge 369 | the pill's right edge (369) lines up with the avatar's (368.5) to half a point |
| Home: heading "Best for your family" | x 24.1, width 165, row 198.6 to 224 | x 24 to 213 (Inter at the app's size runs wider than the frame), pill 263 to 369 | 50 pt clear between heading and pill |
| Home: pill vertical position | n/a (the frame has no such control) | centre 161 against the heading's 164 | within 3 pt of the heading's centre |
| Home: nearby art ("Ray yellow title") | x 199 to 216, y 196 to 215 | pill starts at x 263 | clear of it |
| Explore: search field right edge | 373.6 | pill right edge 373 | aligned to the field below it |
| Explore: title | x 21.3, width 216, y 59.9 | pill beside the title, right-aligned | the title is never covered; 41 pt clear at 393 |
| Explore: "Sparkle title" art | x 254 to 277, y 54 to 88 | pill 267 to 373 | the pill's surface covers about 10 pt of the sparkle's right end: decorative, behind the control, cosmetic |

At 393 x 852 and at 360 x 780 and 375 x 812 the pill **moves nothing**: the chips, the deck and the navigation are at exactly
the positions they have without it.

## 2. Small iPhones: what the pill costs on Home (measured, with and without)

Top of the chip row / top of the deck, in points, baseline then with the pill:

| Screen | Baseline | With Families | What changes |
| --- | --- | --- | --- |
| 320 x 700 (a narrow Android-sized or old small phone) | chips 207, deck 255 | chips 233, deck 281 | the heading wraps to two lines (it has 166 pt, not 189): +26 pt |
| 375 x 667 (iPhone SE 2nd and 3rd gen, 8) | chips 170, deck 218 | chips 200, deck 248 | the heading is dropped on short phones, so the pill takes its own 44 pt row (+30 net); the deck is 30 pt shorter and the card still clears the navigation by 40 pt |
| 375 x 812 (X, 11 Pro, mini sizes), 360 x 780, 393 x 852, 430 x 932 | unchanged | unchanged | nothing |
| **320 x 568 (iPhone SE 1st gen, 5s)** | card bottom 476, 24 pt above the navigation | card bottom 506, **6 pt under the navigation** | the See more button is partly behind the bar |

Reading it plainly:

- **Balance and readability of the Home header are fine on every size that matters.** The greeting never meets the avatar
  (21 pt clear at 320, 34 pt at 375), the pill is 44 pt tall with a 14 pt SemiBold word, and no size scrolls sideways. On the
  375 x 667 phone the pill sits alone on a right-aligned row between the search field and the chips: it works, but it looks
  slightly orphaned. That is the cost of not moving the approved header.
- **One real regression: 320 x 568.** The iPhone SE 1st generation (and 5s) cannot run any iOS newer than 15, so this is a
  very small audience in 2026, but it is a visible defect: the deck's button sits 6 pt under the navigation where it used to
  clear it. I have **not** changed the code. Cheapest fixes if you want one: below 600 pt of height let the deck scale a
  little further (`deckMetrics`), or drop the credit line under the deck, or let the pill share the search row. Say if you want it.
- **The heading wrap at 320 wide** is the other visible effect: "Best for your family" breaks onto two lines. Acceptable, and
  absorbed by the deck (the card is 9 pt shorter there).

## 3. Not changed, re-checked

- The five tabs: Home, Explore, Halfway, Plans, Profile. No sixth, none called Families.
- Tapping opens `/families`; Back returns to where you were (browser, five sizes).
- Privacy and consent are the existing ones: the screen is the Profile's connected-families section with a layout variant,
  reads no home coordinates, and shows only a label, an outward-code area and child counts (the account journeys
  verify this on the auth build).
- No new Connected Families capability: no unread badge, no start-a-plan from a family row.
- `verify-families-action.mjs`: all checks pass on this branch's build at 320, 360, 393, 430 and 390 x 640.

## 4. Limits of this review

- **Not a real phone.** Safe-area insets, the home indicator, the Dynamic Island, system fonts and touch are not exercised.
- **Larger text.** The OS "Larger Text" setting cannot be simulated in a browser. CSS zoom at 130 % overflows sideways at
  375 and on Explore at 393 **identically with and without the pill** (so the pill adds no overflow), but that test is not
  Dynamic Type. The pill's label does not wrap (`numberOfLines={1}`), so a very large font widens the pill, and the heading
  shrinks first; to be seen on a device.
- **Frame offsets.** The frames include a 47.6 pt status-bar band the web layout does not have; comparisons use positions
  relative to the heading and the avatar, not absolute y.
