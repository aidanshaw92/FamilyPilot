# The review process: what it checks, what it cannot, and how to measure it

Status: 2026-10-08. Nothing here publishes anything. Companion to `METHOD_AND_REVIEW.md`, which describes the gate; this page describes what was added after the gate and what it found.

## Why a verbatim match is not enough

The build stops if a quoted sentence is not on the page. That proves the words exist. It does not prove they are about this venue, this facility, this part of the site, or that the proposed sentence means what the quote says. A quote about *accessible* toilets cannot support a claim about toilets in general, and a quote about parking cannot support a toilets claim, however exactly it is copied.

So every accepted or proposed item now passes **independent checks**, run from the quote and the proposal alone, trusting neither the author nor the pipeline (`scripts/pilot/review-checks.cjs`):

| Check | The question |
|---|---|
| own site | Is the page on the venue's own site? |
| mentions subject | Does the quote mention the thing the fact is about (a toilets fact must say toilet, a parking fact must say park)? |
| numbers supported | Is every price, time, age and number word in the proposal in the quote, in any notation (`10am` = `10:00 a.m.`)? |
| no over-reach | Does the proposal use a stronger word than the quote (free, every, throughout, step-free)? |
| polarity | Is a "yes" negated near its subject in the quote, or a "no" stated with no negation at all? |
| this place | Does the quote name another place (Whipsnade, Tring, Cosford)? |
| dated | Does the quote refer to a year before the reading? |
| shares content / size | Does the proposal draw on the quote, or run far past it? |

A **fail** means the proposal is unsupported by its own evidence: it is stopped before anyone reads it (reversibly). A **warn** sends it to a person with the reason shown. A fact the gate would have accepted is not accepted if any check doubts it.

## What the checks found in the pilot's own data

Run over all 169 accepted or proposed items, the checks failed **26**: the proposal carried a figure the quoted sentence did not contain. 16 of the 26 had been accepted without a person. The cause was structural, not carelessness: one item could hold only one quote, so a proposal summarising two sentences of a page was verified against one of them. Each was checked against the page and fixed:

- **Real errors in what was claimed** (6): Babylon Park's "seven indoor rides" (the page lists nine named rides and never says seven); Mudchute's "D7" bus (the page names the D3, D6 and 135); Gunnersbury's parking text said "charged at all times" and left out the **free first 30 minutes** the page states; Discover's station item restated the "no step-free access at Stratford High Street" notice, which the page itself dates "until July 2025", already past; the Natural History Museum's lifts "out of order on 6 October" (the page gives no date, so the date was ours); and the RAF Museum's parking item carried fees that are on a different page.
- **Right, but resting on one sentence too few** (the other 20): Discover's closure dates, Horniman's garden hours, the Science Museum's picnic levels and Bubble Explorers' price, London Zoo's bus routes and ZooTown's £1, and others. A fact may now rest on several sentences of the same page, and the proposal may use only what they say together.
- **Doubted, not wrong** (12): sent to a person. Nine say more than their quote ("every floor" where the quote says "all levels"; "accessible" where it says "inclusive"; "free" where the quote only names the park), two share little wording with their quote because they paraphrase it, and one has a negation near its subject (Discover's buggy storage, where "many of our spaces cannot have buggies in" is the same sentence).

Effect on the headline figures: items accepted without a person fell from 84 to **71**; see `RECONCILIATION.md`. After the fixes no item fails; **27 of 170 warn** (16%), which is the cost of the checks in reading time.

## Do the checks catch errors nobody wrote them for?

Seeded-error validation (`scripts/pilot/review-seeded.cjs`): every real item is copied with one realistic error put in. "Noticed" counts only a finding the seeded error *caused*; an item that was already doubted gets no credit.

| Error put in | Items | Noticed | Stopped outright |
|---|---|---|---|
| the quote is about a different facility | 91 | 100% | 91 |
| the quote is from a different venue's site | 170 | 100% | 170 |
| an invented count (digits) | 170 | 100% | 170 |
| the quote names another site of the same operator | 78 | 100% | 0 (sent to a person) |
| a yes became a no | 71 | 99% | 69 |
| the notice is out of date | 170 | 99% | 0 (sent to a person) |
| the proposal is about something else | 146 | 98% | 73 |
| the proposal claims more than the quote (words the checks list) | 170 | 91% | 0 (sent to a person) |
| a figure changed (price, time or age) | 63 | 90% | 57 |
| **the proposal adds a claim in words the checks do not list** | 170 | **5%** | 0 |

The structural errors are caught. The last row is the honest limit, and it is held out on purpose: those phrases ("Suitable for babies from birth", "Dogs are welcome", "No booking is needed") were chosen before looking at what the checks list. An interpretation that quietly adds a claim in ordinary words is **not** caught by any check I could build without flagging almost half of the real items (a novel-word check flagged 77 of 173). A person is the only control for it, which is why high-impact items are never batched, and why the review page highlights, in each proposed sentence, the words that are not in the quote.

The first run of this validation scored 100% on over-reach, because the test used the same words the check looks for. It was rewritten to credit only caused findings and to hold out a second set of phrases. A control that is tested against its own checklist has not been tested.

## Where a person's time goes

`scripts/pilot/review-triage.cjs` routes every item:

| Route | Items | What happens |
|---|---|---|
| auto-reject | 0 | An independent check failed. None remain after the fixes; seeded errors prove the route works. |
| individual | 97 | A person reads it alone, with the quote in the words around it on the page. |
| batch | 2 (one group of 2) | Decided together after a sample is read; any rejected sample makes the group individual. |
| accepted | 61 | The gate and every check agree. |
| accepted, spot-checked | 10 | Same, read anyway: one in ten, at least one per venue, picked by a fixed seed. An automatic acceptance nobody ever looks at is not a control. |

**Triage does not make this queue faster, and was not built to.** 75 of the 99 proposed items are high-impact by design (prices, accessibility, negatives, ages, rules and conflicts are where a wrong "yes" costs a family a wasted journey) and only 10 are low-impact and clean. Batching has almost nothing to batch here. Modelled from words to read, reading every proposed item one at a time is 30.4 minutes and the triaged queue is 32.6, because the spot-checks add reading. What triage buys is control, not speed. It should become faster as the set grows and equivalent items accumulate (the same accessible-toilet statement across venues), but that is a hypothesis to measure, not a forecast.

## What a reviewer can do with an item

Approve; **edit** (the quote is right but the proposed meaning is not, so the reviewer writes the meaning the quote supports); reject; mark unknown; **undo** (a revert line that withdraws any earlier decision, and a later revert withdraws the revert); or approve a batch as one action that can be undone as one. Decisions go to an append-only trail, one JSON line each, each carrying the hash of the line before it, so an edited, removed or reordered line is detectable (`review-audit.cjs`, tested in `pilot-review.test.ts`). An edit changes what would be proposed for publication; it never publishes.

## Measuring the real review time

The 26-minute figure in the first report was modelled from word counts, not measured. **Nothing should be forecast for 50 or 700 venues from it.** The measurement needs a person and takes about half an hour:

1. Build the review page locally. It carries the venues' surrounding page text, so it stays on the reviewer's machine and is never committed:
   ```
   node scripts/pilot/review-triage.cjs --pack /local/pack.json --pages /local/pages.json,/local/gap.json
   node scripts/pilot/review-pack.cjs   --pack /local/pack.json --out /local/review.html
   ```
2. The reviewer opens `review.html`, enters a name, and works the queue as they would for real. The page times each item from the moment it is in view to the moment it is decided, and stores the decision in the browser.
3. **Export decisions**, then:
   ```
   node scripts/pilot/review-import.cjs decisions.jsonl --out audit.jsonl --json timing.json
   ```
   This builds the tamper-evident trail and reports the **measured** median, 90th percentile and total seconds per item, how many items were edited, rejected or marked unknown, and how many decisions were undone.
4. One session by one reviewer describes that session. Forecasting needs at least three sessions, ideally two reviewers, and a note of how many items were high-impact in each, because the cost per item is very different for a price than for a café.

## What this does not do

- It does not approve the held items. All 99 still need a person, and none is approved by this work.
- It does not catch an interpretation that adds a claim in ordinary words (above).
- It cannot tell that a source is *wrong*, only that the proposal is not what the source says. A venue page that is itself out of date is a source problem (see `HOURS_AND_PRICING.md`), handled by freshness rules and parent reports, not by this review.
- It has been run on ten venues by me. It has not been run by anyone else.
