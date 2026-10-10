# Keeping evidence fresh at scale: a safe future approach (not built; nothing here changes today's controls)

9 October 2026. Today a rule is valid 30 days and hours 45 days from the day a page was read, and a person re-approves each time. At 10 venues that is a monthly batch of about nine cards. At 700 it would be unworkable, and the answer is **not** to lengthen the window or approve automatically. The principle: **a person approves a *meaning*; the system may only prove that the *source has not changed* since that approval, and anything it cannot prove goes back to a person.**

## The approach, in order of safety

1. **Pin what was approved.** Every approved claim already stores its source URL, quotation, reading date and the page's hash (`pageSha256`). Also store the *normalised text of the extract the quotation came from*, so the approval is of this exact sentence in this exact context.
2. **Revalidate by comparison, not by re-extraction.** On a schedule (inside the existing every-minute worker; stored-page and `refetch_official` modes already exist, and neither calls Google), re-fetch the page and compare the **normalised extract** to the approved one. Three outcomes only:
   - **Unchanged** (the quotation and its surrounding paragraph are byte-identical after normalisation): the claim's reading date and expiry are extended by another window, recorded as a *revalidation* row with the old and new page hash, **not** as a new approval. The approver on record stays the person who approved the meaning. This is the one place automation touches expiry, and it can only ever repeat a decision a person already made on identical words.
   - **Changed** (any difference in the extract, the quotation missing, the page gone, redirected to another site, or an error): the claim is **not** extended. It lapses on its original date (the safe direction: the app falls back to provider data and unknown) and goes to a review queue with a word-level diff of old and new.
   - **Unreadable** (blocked, timeout, a bot challenge): treated as changed. Never as unchanged.
3. **Exception-based review.** People only see (a) changed extracts, with the diff, (b) claims that lapsed unread, (c) a random audit sample of unchanged ones (say one in twenty, always including every closure and restriction that can refuse a household), re-read against the live page by a person. The sample rate is raised automatically if any sampled "unchanged" claim turns out to be wrong.
4. **Guardrails that never relax.** Only a `human:` approver creates or changes a meaning; revalidation can only extend, never create, never edit, and never for a claim whose meaning depended on a date that has passed (a dated closure expires on its date regardless). Closures, pushchair/access restrictions, hours and prices keep the shorter window and a higher audit rate than plain facilities. A revalidated claim shows its real last-read date to families. A kill switch disables revalidation and lets everything lapse.
5. **Measure before relying.** Run revalidation in **shadow mode** first: compute what it would extend, change nothing, and have people check a sample of its "unchanged" calls for a few weeks. Only turn it on if its false-"unchanged" rate on that sample is zero across a few hundred checks, and keep the audit sample permanently.

## Why this is safe, and its limits

It cannot make a wrong claim true; it can only fail to notice that a page changed in a way the extract does not contain (for example a new notice elsewhere on the site that overrides the approved sentence, like the Natural History Museum's separate closure notice). That is a real residual risk: it is why closures and restrictions keep short windows and high audit rates, why a venue's other pages remain in the diff scope for those claim types, and why families can always report "this was wrong" (an existing, tested path that disputes a claim).

## What to build later, and what not to

Build later: normalised-extract storage, a `revalidation` row type, the shadow-mode report, the diff view in the existing review page. **Do not** build: automatic approval of changed text, model-judged "same meaning" decisions, or longer fixed windows.
