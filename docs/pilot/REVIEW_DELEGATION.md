# Review delegation: who decides what, so the owner is not the bottleneck

Status: 9 October 2026. Replaces the "owner reviews everything" assumption. Nothing here approves or publishes anything. The tiers and counts come from `REVIEW_WORKFLOW.md` (`review-workflow.json`): **96 decisions** for the ten pilot venues.

## The roles

| Role | Who | Decides | Count now |
|---|---|---|---:|
| **Owner** | You | The 5 decisions that can refuse a date or a household (unless delegated in writing below); authorises each publication batch (a production write) | 5 |
| **Expert reviewer** | A named delegate with operations, accessibility or venue-admin experience | Opening hours against the provider's, prices and free entry, a "no" on access, the held under-1 admission item | 26 |
| **Trained reviewer** | Anyone who has done the 30-minute onboarding below | Every other high-impact fact; rules that only inform; anything a check or a model flagged; plain "yes" facts, in groups | 50 reads + 13 group reads + 2 group approvals |
| **Second reader** | The owner or the expert, not the person whose work it is | An audit sample of the trained reviewer's work | about 15 |
| **Nobody** | Mechanical failures only | Rejected automatically, reversibly, with the reason | 0 |

The five owner decisions: the Natural History Museum's closure dates (including **Friday 9 October**), the Science Museum's 24–26 December closure and its pushchair rule, Discover Children's Story Centre's festive closure and its pushchair restriction. If no suitable delegate exists you make these five. If you delegate any of them, write the name and the item in the audit trail (a line saying "delegated to X by the owner on <date>"). A refusal rule is **never** decided by one person alone: the expert decides and the owner (or a second expert) confirms, and the trail shows both.

## What no one can do

- **A model cannot approve.** Two models agreeing proves nothing: in the blind check 48 of 170 items that matched their quotation word for word still claimed more than it said. A model reading is a flag on the card that moves an item up a tier, never down or out.
- **A model cannot reject.** Only a mechanical failure can (a number the quote lacks, a page that is not the venue's), and it is listed and reversible.
- **A reviewer cannot publish.** Decisions go to a tamper-evident trail. A separate publication step (a person-approved claim batch, with its own rollback) is authorised by the owner, class by class.

## The four outcomes for any card

| Outcome | Use when | What happens |
|---|---|---|
| **Approve** | The venue's words say exactly this, for this site, with the same conditions | Becomes eligible for a publication batch |
| **Edit meaning** | The quote supports something narrower or different | The edited wording is what is eligible; the original is kept |
| **Reject** | The statement is wrong or says more than the quote | Not published; recorded with the reason |
| **Mark unknown** | The page does not settle it, is out of date, or is about somewhere else | Not published; the field stays unknown; looked at again when the page changes |

"Unsupported claims: reject or leave unknown." Reject when the claim is wrong; unknown when the evidence is merely not enough. When unsure, unknown.

## Qualification and calibration (about 30 minutes)

1. Read `REVIEWER_GUIDE.md` (or the same guide at the top of the review page).
2. Do the reviewer pack. It contains **4 hidden planted errors** that look like any other card (an added claim in ordinary words, a flipped yes/no, a changed figure). The scorer reports whether they were caught.
3. **Bar (a proposal, to be adjusted after the first sessions): catch at least 3 of 4.** Below that, every approval by that reviewer is second-read until a later pack clears the bar. A reviewer who rejects almost everything also fails: the second reader's sample shows whether the rejected cards were fine.
4. Experts do not get planted errors (their items are specific facts, not interchangeable). Their control is the second reader: all five refusing decisions, plus a one-in-four sample of the rest.

## The second reader

`review-session-score.cjs` writes the audit sample for each session: **every edit and a fixed one in five approvals, at least three**, chosen by a seed the reviewer does not know. The second reader opens those cards in the same page (from the full pack) and decides afresh, without seeing the first decision. Disagreement widens the sample to everything that reviewer approved.

## Measuring the time

The page times each card from when it is in view until it is decided. After a role's first complete pack the scorer reports median, 90th percentile and total seconds by tier, the wall-clock minutes, and the control result. **Nothing is forecast for 50 or 700 venues from one session.** The rule: at least three sessions, at least two reviewers, the tier mix and the control result recorded each time. Until then the plan for 50 venues is "the same workflow, measured".

## What goes to whom, in order

1. **Expert pack (31 cards)** to the expert: `review-expert-all.html`.
2. **Reviewer pack (67 cards, 4 of them hidden controls)** to a trained reviewer: `review-reviewer-all.html`. Both are single files; they open in any browser and need nothing installed. They contain short extracts of each venue's own web pages, so share them only with the reviewer.
3. Each returns `review-decisions.jsonl`.
4. I score each file (timings, controls, audit sample) and build the audit trail. The second reader checks the sample.
5. Only then does anything go to a publication batch, and each class of batch needs your explicit approval.

## What to do when a reviewer is stuck

Mark the card **unknown**, finish the pack, and send me the venue and field shown on the card with one sentence on what was unclear. A confusing card is a defect in the card, not in the reviewer, and the next pack is fixed.
