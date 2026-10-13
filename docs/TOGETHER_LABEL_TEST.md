# Label test: Together, Friends or Meet up?

**Status: not run. There are no results.** I cannot recruit parents. Nothing in the app or the pull request claims the label is
proven. The tab ships as **Together** provisionally, because Together is the name approved on Figma page 09. A different winner
changes one string (`title: 'Together'` in `app/(tabs)/_layout.tsx` and the heading in `app/(tabs)/together.tsx`), and the tab
label capture, so the test can run after the pull request is reviewed without blocking it.

## What is being decided

The five-tab bar has one tab that holds both "where do we meet?" and "who do I plan with?". The bar no longer says "Halfway", so
the only real risk (recorded in `docs/NAVIGATION_REVIEW.md`) is that a parent looking for a way to arrange a day with a friend
does not choose that tab. The test is whether any of three words does at least as well as the old "Halfway" tab did.

## Who and how many

Up to five parents of children under five, who have not seen FamilyPilot. Five is enough to see a label that fails, and not
enough to prove one is good. Anything under five is still worth running; say how many.

## Procedure (about five minutes each, in person or on a call)

Show a still of the bottom bar of the Home screen, with the five tabs and **only the middle label changed**. One label per
parent, rotated (A, B, C, A, B), so no parent sees two versions. Ask the first question before showing anything else.

1. "You want to arrange a day out with a friend whose children are about the same age. Where would you tap?"
   Record the tab they point at, first time, without hints. **Do not say the word "friends" or "together" yourself.**
2. "What do you think you would find behind that tab?" Record their words.
3. "Is there anything in this bar you would tap instead?" Record it.
4. Show Together's Meet halfway screen (the switch at its top). "What would you do next to find somewhere that suits both of
   you?" Record whether they notice the switch and what they think "Your families" will hold.

Labels: **A Together · B Friends · C Meet up.** Include the old "Halfway" as a fourth only if there are five parents (D, one
parent) so there is something to compare to.

## Record

| Parent | Label seen | Tapped first (Q1) | Their words (Q2) | Anything else (Q3) | Switch noticed (Q4) |
|---|---|---|---|---|---|
| | | | | | |

## How to read it

- A label **passes** if a parent taps it for Q1 without hesitating. A parent who taps Explore or Home first is a failure for that
  label, however friendly the word.
- **Keep Together** if it is tapped by at least as many parents as any other. **Switch to the winner** if another label is
  tapped by two or more parents more than Together. **Go back to six tabs** only if no label, including Halfway, is tapped by
  most of the parents who saw it, because then the problem is not the word.
- Five parents give a direction, not a measurement. Report it that way, with the count, and write down who they were.
- Do not use the parents' words as quotes in the product without asking them.

## What I have not done

I have not run this, and have not inferred any result from my own reading of the labels. What the review says about parents
(`docs/NAVIGATION_REVIEW.md`) is reasoning, marked as hypothesis, and stays so until this is filled in.
