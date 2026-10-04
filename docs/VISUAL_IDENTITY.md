# FamilyPilot visual identity: assessment and plan

Written before any Figma or production change. The three approved references (Home, Explore, Welcome)
are the source; the existing Figma file (`LNpbdnuAWcfWf9spvB7jBz`), the implemented app and the shared
tokens were inspected against them. Everything below was measured, not assumed.

## 1. What the references establish, as a system

| Layer | Reference evidence (sampled from the PNGs, ±4 per channel) | Token |
| --- | --- | --- |
| Canvas | Warm near-white on all three (`#FBFAF8`), cards pure white | `background #FBFAF7`, `surface #FFFFFF` |
| Ink | Dark navy, not black: Explore heading `#070D2B`, Home greeting `#061332` | `ink #0D1733`; `text.primary = ink` |
| Secondary text | Slate greys `#5E5E7A` to `#848C94` | `text.secondary #626A80`, `text.tertiary #8A91A0` |
| Primary green | Buttons, selected chips, nav pill, CTA: `#0C4C3C`/`#0C443C`/`#0C3C34` | `green.700 #0F4A3E` (primary), `green.800 #0B3B32` (pressed, Welcome CTA), `green.600 #15534A` (Home's filter button) |
| Mid green | Wordmark "Pilot" `#4C9C84`, full stop `#247464`, leaf `#5CB4A4` | `green.500 #3F9A82`, `mint.500 #5FB3A3` |
| Mint | Idle chips `#ECF4F4`/`#E4F4EC`, Family Fit pill, nav active disc `#DCF4EC` | `mint.100 #E7F3EF`, `mint.200 #DDF1E8` |
| Blush | Chips `#FCECEC`, blob `#FCDCDC`, Welcome icon well `#FCECE4` | `blush.100 #FBECEA`, `blush.200 #FADBD8`, `coral.500 #E26B4A` |
| Lilac | Chips `#F4ECFC`, icon well; violet icon `#640CF4` | `lilac.100 #F3ECFB`, `lilac.200 #EADFF8`, `violet.500 #6B21E8` |
| Yellow | Strokes `#FCC424`, Home `#FCCC54`, logo dot `#FCBC04` | `yellow.500 #F7C12E` |
| Photo scrim | Home card fades to green-black `#0C342C`, not neutral black | `gradient.*` re-based on `#0A2E27` |
| Type | Headings read Bold, not Semi Bold; body/metadata regular; same Inter geometry | `display/heading1/heading2` → Inter Bold; `heading3` stays Semi Bold |
| Shape | 44pt chips, 28–32 card radius, full-radius buttons, 58pt arrow CTA with a disc | unchanged: the geometry already matches |

What carries the identity is the **ink-navy + deep-green pair on a warm canvas**, with the three tinted
chips (mint, blush, lilac) and a yellow stroke as accents. The geometry (chip heights, radii, the arrow
CTA, the floating pill nav, the deck) is the same as the locked Home frame; the references recolour and
warm it, and add photography and decoration. That is good news: the product's layout contracts survive.

## 2. Conflicts with the current Figma and code

**Figma.** The file has one page, five approved frames and two components, and **no variables, no text
styles, no effect styles**. The frames are drawings, not a system. "Formalise in Figma" therefore means
creating the foundations from nothing: variable collections (Primitives, Semantic colour, Spacing, Radius),
text styles, effect styles, and editable components, then rebuilding Welcome, Home and Explore from those
components alongside the existing frames (which stay as the record of the previous approval).

**Code.** The app has one accent, `ink #141416`, and uses it for *everything emphasised*: primary buttons,
selected chips, the floating nav (`#171617` hard-coded), the dark circle button, Family Fit's star, links,
the avatar, the DOB focus ring. The references split that one role into two: **ink navy for text** and
**deep green for action, selection and chrome**. So the change is not "swap a hex", it is to introduce an
`action` colour and move every control from `ink` to it, while text stays on `ink`. 28 files read
`colors.ink`; the primitives (`Button`, `Chip`, `CircleButton`, `FloatingTabBar`, `FamilyMatch`,
`SearchBar`, `ArrowCta`, `InkSwitch`, `Text.link`) are where the split happens, and the screens inherit it.

Specific conflicts:

1. `design-system-guard.test.ts` pins `ink === '#141416'`, `text.secondary === '#6E6E73'` and Semi Bold
   headings. It is updated deliberately with the new values; it keeps forbidding raw hex and the retired
   purple.
2. Family Fit on a light surface is currently white with a hairline and an ink star. The references draw
   it as a **mint pill with deep-green star and text**, and on photography as a **deep-green pill with
   white text** (Home). One component, two tones, as today.
3. Idle chips are white. The references give the idle chips in a rail **tinted fills by position** (mint,
   blush, lilac) with the selected chip deep green. That is a `tint` prop on `Chip`, assigned by the rail
   (index mod 3), never by meaning; a chip's tint carries no information.
4. The nav pill is near-black with a white active disc. References: deep-green pill, mint active disc,
   green icon on the disc.
5. The hero/deck scrim is neutral black; references tint it green. The photo card's eyebrow, title and
   Family Fit pill sit on that green-black.
6. The Welcome screen is an SVG family illustration with six feature rows (four behind pilot flags). The
   reference is a photo collage with three benefit cards. **There are no photographs in the repository**
   and no image service is permitted, so the collage ships as a `CollageTile` component with asset slots
   that render the category gradient treatment until real photographs are supplied. The composition,
   decorative marks and benefit cards are real; the photos are slots.
7. The logo is the Expo template icon (`assets/images/icon.png` is the default blue chevron) and a heart
   on an ink square in Welcome. There is no FamilyPilot mark. Directions will be drawn in Figma and shown
   before any production branding changes (owner stop point).
8. Explore's list card is a left-accented white card with a text link. The reference is a photo-left
   card with the Family Fit pill, a reason line, metadata, and a **full-width green arrow CTA**. The
   current reason line must keep saying only what the evidence says ("Baby changing confirmed on site"
   appears only when the fact is confirmed; the travel time only when computed), which the existing
   `DecisionCard` already enforces.
9. Decoration: none exists. A `Doodle` component (leaf, stroke, blob, with the palette) is added and used
   only on Welcome, Home and Explore, positioned outside cards and touch targets. Venue Detail, Plan,
   Create a plan and Profile get none.

No conflict with data, privacy, routing or cost contracts: this work touches tokens, primitives and screen
chrome only.

## 3. Sequence

1. **Figma foundations** (this document, then): variables with scopes and code syntax, text styles,
   effect styles; components (Button, Chip with tints, SearchBar, FamilyFit, CircleButton, ArrowCta,
   Nav, IconWell, PhotoCard, ExploreCard, BenefitCard, Doodles, Field, Switch, Sheet, states); then
   Welcome, Home and Explore rebuilt from them as "v2" frames beside the approved ones.
2. **Code foundations**: `colors.ts`, `typography.ts`, the primitives, the guard test, one visual pass of
   every screen to catch anything that assumed ink was the action colour.
3. **Home** visual evolution, verified against the v2 frame and the existing Home verifier (which measures
   geometry and copy, not colour, so it keeps guarding the locked composition).
4. **Explore**, then **Welcome** (collage slots, benefit cards, logo placeholder), then **onboarding**.
5. **Quieter screens**: Venue Detail, Create a plan, Generating, Plan, Saved, Trips, Profile, Edit,
   Restaurants, Account, and every loading/empty/error state: same tokens, no decoration.
6. **Logo** directions in Figma. Stop for approval before touching production branding.
7. Each slice: render at 360/390/430, verifiers, tests, adversarial review, PR, CI, merge, deploy check.
