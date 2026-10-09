# Wave approval workflow: 21 decisions, the five high-impact ones apart

9 October 2026. Nothing is published by deciding. Each person works in one self-contained page (any browser, nothing to install), exports a file, and sends it back.

| Pack | Cards | Who | Contents |
|---|---:|---|---|
| **A. High-impact: yours or a named delegate** | **6** | You, or a delegate you name in writing | The five decisions that can refuse a date or a household (NHM closure; Science Museum closure and hours; Science Museum buggy note; Discover closure and hours; Discover buggy rule) plus Discover's own pushchair exception, which must be decided with the rule. `review-wave-owner.html` |
| **B. Expert** | **6** | A named expert (operations, accessibility or venue admin) | The three places where the venue's hours differ from Google (London Zoo, Mudchute, Gunnersbury) and the three prices (Discover, London Zoo, Science Museum). `review-wave-expert.html` |
| **C. Trained reviewer** | **9** (+4 hidden controls) | A reviewer who has read `REVIEWER_GUIDE.md` | Parking at Horniman, Discover, Zoo, Science; toilets at Discover, Zoo, Science; the Zoo's Zootown and the Science Museum's Garden activities. The page also holds 4 hidden planted errors; catching at least 3 of 4 is the bar. `review-wave-reviewer.html` |

The sheet with the source wording and effect for packs A and B is `NINE_CARD_SHEET.md`. The page shows the same source quotation, the page link, the date read, and every word the quote does not contain highlighted.

## Steps

1. Each person opens their page, decides every card (Approve, Edit meaning, Reject, Mark unknown), and presses Export. The file is `review-decisions.jsonl`.
2. They send it to me. I import it into the tamper-evident audit trail (`review-import.cjs`) with their name, score the hidden controls for pack C, and select a second-reader sample of pack C's approvals for you or the expert to re-check (every edit and one in five approvals, at least three).
3. **I build the publishing files from approved cards only**, and show you the manifest (every claim, its source, quotation, expiry):
   - claims batch for rules, hours and facts: `publish-batch.cjs` → `apply.sql`, `rollback.sql`, `manifest.json`;
   - reviewed prices and activities: `emit-reviewed-data.cjs` → a pull request (draft) for you to approve.
4. **You authorise each batch by name.** I run it, verify with the real app and the monitoring SQL, and report. The rollback is ready before it runs.
5. Anything not approved, edited into something narrower, rejected, or marked unknown is **not published**; the app keeps it as unknown.

## Rules that do not bend

A model's reading is never approval; the five in pack A are never decided by a reviewer; a delegate for any of them is recorded in writing with the item; a card that cannot be published (for example "adjacent") is not offered as if it could be.
