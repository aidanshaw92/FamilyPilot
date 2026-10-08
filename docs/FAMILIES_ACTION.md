# Families: a labelled action on Home and Explore

Connected Families existed (invitations, acceptance, what each side shares, Meet halfway, Who's coming) but only on the
Profile tab, three scrolls down. Nobody planning a day out looks there. This adds a labelled **Families** action to Home and
Explore and a **Families** screen behind it. The bottom navigation keeps its five tabs.

## What a parent gets

- A pill labelled **Families** (people icon + the word) on Home and on Explore.
- It opens the Families screen: a title, a way back, one line on what it is for, and the connected families.
- With nobody connected: "No families connected yet. Connect a family to choose them under Who's coming and to find a place
  that works for both of you." and a primary **Add a family** button.
- **Add a family** opens the existing tools: invite as Partner / Family / Friend (a link; the routine-sharing switch starts
  OFF), or add a family by postcode (a starting point on this phone only).
- With families: **Connected** (accepted, by label; Meet halfway, What I share, Disconnect), **Waiting for a reply**
  (pending, with the kind of invitation and Cancel), **On this phone only** (added by postcode; Meet halfway, Remove), and
  **Add another family**.
- A connected family is already offered under Who's coming in Create a plan (`ConnectedFamiliesPicker`) and used by Meet
  halfway; this screen starts Meet halfway from a family's row.

## Reuse, not duplication

The screen is the Profile's `ConnectedFamiliesSection` with `variant="screen"`: the same hook (`useConnectedFamilies`), the
same invitation calls, the same consent panel, the same disconnect. There is no second invitation system. The Profile keeps
its section unchanged (`variant="profile"` is the default). A test pins that `app/families.tsx` imports no invitation code,
reads no home coordinates and touches no planning store.

## Privacy and consent (unchanged, re-verified in the browser)

- Verified email, invitation and acceptance permissions are the existing ones (the route sits behind the same account guard as
  every other screen; a signed-out visitor is sent to Welcome).
- Routine sharing starts OFF on the invite tools (browser check: the switch is unchecked) and changes only on an explicit
  "Update what I share".
- The screen shows what a connection chose to share: a first-name label, an outward-code area, child counts. Browser check on
  the auth build: no full postcode, no email, no child name appears.
- Child information stays on the device; precise home location never reaches the screen.

## Placement, and why not the obvious one

Home's header is laid out against the approved frame in fixed points: the greeting runs up to the avatar's strokes, and a
44 point pill does not fit beside it at 320 to 430 without wrapping the greeting. So:

- **Home:** the right-hand side of the "Best for your family" heading row, which is empty and tall enough (the row is 51 points;
  the 44 point pill sits inside it), so nothing moves. On short phones Home drops that heading to make room for the deck; the
  action then keeps a 44 point row of its own in place of the 14 point gap that replaces the heading. The compact header
  therefore gives up 21 points instead of 51 (`HEADER_SAVINGS.compact.title`, pinned by a test): the one place this change
  costs vertical room, on the shortest phones only.
- **Explore:** the right-hand side of the "Explore London" heading, in a fixed 34.5 point row, so nothing below it or in the art
  moves. Below 340 points wide the heading and the pill do not fit side by side, so the pill takes its own 52 point row under
  the subtitle and everything below (and the art) moves down by that row.

**Limit, stated plainly:** I could not open the approved Figma file from this environment (no file link in the repository or
the session), so this placement is chosen from the repository's own Figma-measured geometry, not read from a frame. If the
Figma has a header action, or you prefer one of the other slots, it is a one-component move (`FamiliesAction`).

## Accessibility and narrow widths

- The visible word is the start of the accessible name ("Families, the families you plan days out with"), role button; the pill
  is drawn 44 points tall. (An earlier draft drew it at 36 and relied on hit slop for a 52 point target; the repository's
  accessibility audit measures the drawn box and flagged it, so the drawn size is the target.)
- Verified in Chromium at 320, 360, 393 and 430 wide and at 390x640 (Home's short layout): the action is on screen, inside the
  viewport, overlaps no text or control, the page does not scroll sideways, the five tabs are unchanged, tapping opens
  `/families`, Back returns to where you were. Also axe-style accessibility audit (`audit-accessibility.mjs`).
- Not verified: a real phone, a screen reader on a device, large dynamic type settings. The pill's label does not wrap
  (`numberOfLines={1}`), so a very large system font would widen it; the Home heading row and the Explore row both let the
  heading shrink first.

## Not done

- No unread badge for pending invitations in the header. It needs a connections request on every Home and Explore load; the
  Families screen is where pending is shown. Decide once the beta shows whether people miss invitations.
- No "start a plan with this family" from the Families screen: a plan starts from a place (Create a plan on a venue), where
  connected families are already offered under Who's coming. Meet halfway, which starts from a family, is on each row.

## Tests

`families-action.test.ts` (12): the label and accessible name, the target size, the route, both placements, the compact-header
arithmetic, the Explore narrow rule, five tabs and no sixth, the account guard, reuse of the section, the consent defaults,
the Profile unchanged. `scripts/verify-families-action.mjs` (browser, plain build) and the Families section added to
`scripts/verify-account-journey.mjs` (browser, auth-enabled build with the in-memory accounts fixture: connected, pending,
invite tools, consent default, another family sees us under Connected).
