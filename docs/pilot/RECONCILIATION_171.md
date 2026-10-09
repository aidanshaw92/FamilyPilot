# Reconciling the evidence queue: 171 items, 96 decisions, 31 + 67 cards

9 October 2026. Every one of the 171 proposed pilot facts is listed in [`reconciliation-171.csv`](reconciliation-171.csv) with where it is decided. Nothing was dropped, deferred without a reason, or approved automatically; nothing is published.

## The arithmetic

| | Items | What happens to them |
|---|---:|---|
| **Expert pack** | **31** | Each is one card in `review-expert-all.html` (31 cards) |
| **Reviewer pack** (real cards) | **63** | 50 reviewer-tier items + 13 low-risk items read as cards (7 read alone, 6 as the sample of two groups of four) |
| **Covered by a group approval** | **2** | The 4th member of each group of four: approved only after its group's sample has been read and none was rejected; one rejected sample makes the whole group individual cards |
| *Hidden controls (not evidence)* | *4* | *Added to the reviewer pack: copies of real items with one planted error. 63 real + 4 = **67 cards**. They are never decided into the audit trail* |
| **Merged with a twin** | 6 | Same sentence as a card above; decided once, with it (each row names its twin) |
| **Deferred** | 18 | Production already serves the same value from an active claim; nothing to publish, nothing changes |
| **Parked** | 51 | No claim type can hold them yet (e.g. a plain activity description, a station, a supervision age); **not published, the app keeps them unknown**. Listed so none is forgotten. None can refuse a family (checked: the pushchair, step-free and supervision items among them only inform) |
| **Total** | **171** | 31 + 63 + 2 + 6 + 18 + 51 = **171** |

**96 decisions** = 31 expert + 50 reviewer + 13 grouped reads + 2 group approvals. **94 reads.** The reviewer pack has 63 real cards because the two group approvals are given on the group's sample cards, not on separate cards.

## What the beta needs, in order (the minimum, not the whole queue)

Leaving anything undecided leaves it **unknown**, which the app already handles honestly (named as "to check", never as closed or unsuitable). So the question is only what is worth deciding *before* inviting families.

| Wave | Items | Why | Who |
|---|---:|---|---|
| **1. Safety** | **8** | The five on `DECISION_SHEET_FIVE.md`, plus the three places where the venue's own hours differ from Google's and a plan could be wrong: London Zoo (4pm from 24 Oct, Google says 5pm), Mudchute (Google says closed Mondays, the farm is open), Gunnersbury (Google says open 24 hours; park 7am to dusk) | You or a named delegate (5); an expert (3) |
| **2. Useful** | **23** | The other expert cards: prices and free entry (so a family sees what it costs; unknown prices stay "not confirmed", never free), the remaining hours that agree with Google, "no" on access, one held item | A named expert |
| **3. Later** | **65** | The 50 reviewer items and 15 low-risk items: ages and activities, "For children". These make recommendations sharper, none is needed to be safe | A trained reviewer, with the hidden controls and the second-reader sample |

**Wave 1 is eight cards.** It is the only wave that must be finished before the first family is invited. Waves 2 and 3 can follow while the first ten families are using the app, in separate publishing batches, each approved and each with a rollback.

## Where each item is, by venue

Run `reconciliation-171.csv`: columns `id, venue, field, proposed, source, tier, decision_route, where_decided, wave, why`. Filter by `tier` for the totals above (parked 51, reviewer 50, expert 31, deferred 18, grouped 15, merged 6).

## What this does not claim

Nothing here says any item is true. Every card shows the venue's own words, and a model's reading is only ever a flag. Review time is unmeasured; I give counts, not hours, until a real session has been timed.
