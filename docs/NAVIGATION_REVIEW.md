# Navigation review: six tabs or five?

**Update: the five-tab navigation was approved and is implemented on its own branch, not merged (`docs/TOGETHER_NAVIGATION.md`; label test in `docs/TOGETHER_LABEL_TEST.md`, not yet run).** What follows is the review as written, a proposal and recommendation; it was written when no navigation code had changed. Figma: page "09 — Navigation & App Flow Review" in the FamilyPilot design file (https://www.figma.com/design/LNpbdnuAWcfWf9spvB7jBz/?node-id=366-2).

Option A, today: Home · Explore · Families · Halfway · Plans · Profile.
Option B: Home · Explore · **Together** · Plans · Profile, where Together holds **Meet halfway** and **Your families** behind a two-way switch.

## What I measured in the running app (320 to 430 pt wide)

| | Option A (six) | Option B (five, same 314 pt bar) |
|---|---|---|
| Tab size | 51 × 66 pt | 62 × 66 pt |
| Label size | 10 pt | 11 pt fits |
| Largest text (labels capped at 120%) | 12 pt: "Families" / "Halfway" about 48 of 51 pt | 13 pt: "Together" about 52 of 62 pt |
| Touch target (44 pt) | met | met, with more margin |

The six-tab bar does not fail any current check (touch targets, labels whole, nothing clipped at the largest text in the emulation), so this is not a layout bug. It has no slack: 10 pt labels, and a capped label that nearly fills its tab.

## The six journeys (taps from any screen; a tab press is one)

| Journey | A | B |
|---|---|---|
| 1. Find somewhere to go today | Home → recommendation → Create a plan → Build: 3 | same: 3 |
| 2. Explore a type of activity | Explore → category → place: 3 | same: 3 |
| 3. Meet another family halfway | Halfway tab: 1 (+1 to choose between several families) | Together tab, opens on Meet halfway when a family exists: 1 (+1) |
| 4. Invite or manage a family | Families → Add another family → Invite: 3 (Invite to connect on a family on this phone: 2) | Together → Your families → Add another family → Invite: 4 from Meet halfway, 3 when it already shows Your families |
| 5. Return to an existing plan | Plans → plan, or Home "Up next": 1 to 2 | same |
| 6. Create a plan with another family | Halfway → Plan this day → Save & send: 3 | Together → Plan this day → Save & send: 3 |

Five of six are identical. Managing a family costs one more tap in B when Together opens on Meet halfway. Where B differs is not taps: Families' "Meet halfway" button today **jumps to a different tab** (the highlight moves; Back retraces), and "which tab do I start in to organise something with a friend" has two answers.

## Assessment

| Criterion | Edge | Why |
|---|---|---|
| Taps | A, slightly | managing a family is 1 tap fewer |
| Discoverability | B (hypothesis) | one entry point for one job |
| Label clarity | A | "Together" says less than "Halfway"; it relies on the switch beneath it |
| Navigation consistency | B | Families → Meet halfway stays inside one tab |
| Cognitive load | B | five destinations; the two friend jobs sit together |
| One-handed use | B | tabs 22% wider |
| Small-screen readability | B | 11 pt versus 10 pt labels |
| Larger text and accessibility | B | room to grow to 13 pt |
| Understanding what each tab holds | B (hypothesis) | Together is named by its switch |
| Home versus Explore | neither | Home is picks and what is next; Explore is search and filters. Both show category chips; the roles are distinct enough to keep |

Parent understanding is my reasoning, not evidence: there are no real-parent results yet.

## Recommendation

**Move to five tabs with Together, after a short label test, and before beta if the label holds.**

- *Why:* it does not shorten the journeys; it removes a choice a parent should not have to make, ends the tab jump from Families to Halfway, and gives every tab more room, which is what lets labels reach 11 pt and survive larger text.
- *Becomes simpler:* where to start with a friend; one tab bar state throughout the friends flow; larger, more legible tabs.
- *Could become harder:* managing a family (+1 tap from Meet halfway); the bar no longer says "Halfway", so a first-time parent scanning for those words will not find them. Meet halfway itself is not less accessible: one tap, and the default view whenever a family exists.
- *Meet halfway discoverability:* equal in taps, lower in label literalness. This is the one real risk, and it is testable.
- *Before beta or wait:* test now, because it is cheap to test and costly to change after parents have learned six tabs. Test "Together" against "Friends" and "Meet up" with five parents on the task "arrange a day out with a friend". If none beats "Halfway" for finding it, keep six tabs and fix the label size instead.
- *Implementation impact:* about 1.5 to 2 days plus test changes. One tab route holding the two existing screens as its two views; remove two tab routes; keep `/halfway` and `/families` links working as redirects; change six-to-five in the navigation, larger-text and accessibility checks. No data, API, privacy or spending change.
- *Not recommended:* four tabs (folding Plans into Home hides what parents return for); renaming Halfway while keeping six tabs (neither the duplicate entry nor the 10 pt labels).

## Decisions needed before any navigation code

1. Approve Option B in principle, or keep six tabs.
2. Together opens on Meet halfway when a family exists, Your families otherwise (versus always a menu: +1 tap).
3. Approve the five-parent label test before implementation.
4. Confirm the switch sits at the top of Together, and Meet halfway gives up its subtitle line to make room.
