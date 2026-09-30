# Live false facts: pushchair negation and conditional free parking

2026-09-30. Scope is deliberately narrow: two parent-facing claims that are wrong in production right
now, the extraction semantics behind them, and tests derived from the sentences that caused them.

Not in this pass, by decision: crawler discovery, HTML/content extraction (CSS, escaped JSON, carousel
chrome), review/community evidence, age semantics, UI, and Babylon Park's `playground` claim.

## P0 — Paradox Museum London published `pushchairSuitability = good`

The page behind the claim says the opposite, twice:

> Please keep in mind that the space is **not accessible for prams/strollers**. The museum space is
> **inaccessible for prams/strollers** but pram storage is available at the entrance.

### The root cause was not the one either of us named first

The review named two causes: `EXCELLENT_PATTERNS` counting "not step-free" positively, and
`DIFFICULT_PATTERNS` not recognising "not accessible for prams/strollers". Both are real defects. But
replaying the exact stored page text through the live classifier shows **neither is what produced
`good`**, and a fix limited to them would have left the claim exactly as it was.

The signals the real text actually produced:

| Signal | Value | Source |
| --- | --- | --- |
| `hasWelcome` | **true** | `"Are prams allowed?"` matched `pram(s)?\s+(are\s+)?(welcome\|allowed\|permitted)` on the substring "prams allowed" |
| `hasDifficult` | false | both explicit denials matched nothing |
| `caveatCount` | 1 | "uneven" |
| `excellentCount` | 1 | "step-free", from "not step-free" |

Verdict came from the branch `hasWelcome && caveatCount >= 1 → { good, high }`. The `excellentCount`
branch requires `caveatCount === 0`, so the step-free defect was never on the path.

**The trigger was an FAQ question heading read as an affirmation.** FAQ pages concatenate their
question headings into body text, so "Are prams allowed?" arrives looking like prose. The
field-pattern extractor already refused question-only evidence via `isQuestionOnlyEvidence`; the
pushchair classifier had no such rule. The same sentence was read two opposite ways on one page.

### Three fixes, because there are three independent paths to a wrong answer

1. **Questions are evidence of nothing.** `isInterrogativeSentence` moved into
   `evidence-text-utils.js` as one shared definition; `isQuestionOnlyEvidence` now delegates to it,
   with the logic preserved exactly so no other field's behaviour moves. Applied inside
   `classifyPushchairSuitability` itself, not only in `collectRelevantSentences` — the classifier is
   exported and called directly, and guarding one call path is how the original defect survived.
2. **Explicit pram denials are recognised.** One added pattern for "not accessible for
   prams/strollers" and "inaccessible for prams/strollers". Because `hasDifficult && !hasWelcome` is
   evaluated first, an explicit denial now outranks generic terrain and access-route positives.
3. **Positive signals are negation-aware.** `maskNegatedPositives` neutralises a negated positive
   phrase once, before positives are counted; negatives always read the original text, so "not
   accessible for prams" stays visible to the denial rules.

### Two further defects found while verifying, not reported by review

Both were found by probing the exported classifier directly rather than by reading the corpus.

- **`"No prams allowed."` classified as a welcome.** The denial rule was written `no pushchair|no
  buggy|no pram` with a trailing word boundary, so every plural slipped past it, while "prams
  allowed" satisfied a welcome pattern in those same three words. A flat denial read as permission.
  Fixed with a plural-aware rule plus a mask for a welcome verb negated by a leading "No".
- **Short denials were unclassifiable.** Routing classifier input through `splitSentences`, which
  discards fragments of ten characters or fewer, made `"No prams."` (nine characters) return null.
  Correct when gathering candidate sentences, wrong for classifier input; `dropInterrogatives` now
  splits without the length filter.

## P0/P1 — conditional `freeParking = yes`

A parent-facing "Free parking" badge is a promise to a family arriving by car on an ordinary day. It
was being produced by entitlements that only some visitors, or only some times, get.

### Audit of every active `freeParking = yes` claim

Eight venues, classified against the review's taxonomy from the sentence stored behind each claim.

| Venue | Class | Wording behind the claim | Outcome |
| --- | --- | --- | --- |
| Woodside Animal Farm | unconditional | "Parking All car parking is free." | **kept yes** |
| Headstone Manor and Museum | unconditional | "has free parking to the rear of the building" | **kept yes** |
| De Havilland Aircraft Museum | unconditional | "We have ample free parking" | **kept yes** |
| Thorpe Park | package/booking | "Every Thorpe Park short break includes ... Free parking" | **now unknown** |
| Flip Out Canary Wharf | conditional/time-limited | "3 Hours FREE parking on Weekends & Bank Holidays" | **now unknown** |
| Stanborough Park Water Sports Centre | accessibility-only | "Charges start at £1.50 ... free parking for Blue Badge holders" | **now unknown** |
| Hatfield Park | ambiguous (area-scoped) | "in The Stable Yard, with free parking & free entrance" | **unchanged, flagged** |
| Sydenham Hill Wood | ambiguous (area-scoped) | "free parking is available at the latter" | **unchanged, flagged** |

A ninth venue, Whitechapel Gallery, carries the Blue Badge wording but already reads `no`, from "pay
and display" in the same sentence. It is kept as a counterexample rather than a fix.

The three conditional cases now fail closed to unknown. The condition is not modelled anywhere, so
unknown is the honest answer — not `yes`, and not `no` either.

**The two ambiguous cases are left live and need your decision.** Both are area-scoped rather than
visitor-scoped: Hatfield's free parking is stated for The Stable Yard, and Sydenham Hill Wood's is
"at the latter" of two named entrances of the adjacent Dulwich Wood. Any regex that suppressed them
would be invented rather than derived, which the brief rules out, and Sydenham's is arguably a
subject-scope question (the text names a different wood) that belongs to a fenced-off workstream.

### What was deliberately not used

`hasRestrictedParking`, the guard `parking` already uses, was left out of the `freeParking` path even
though it looked like the obvious reuse. It matches bare "disabled parking" wording, so on a single
sentence it would suppress a legitimate unconditional yes — Woodside Animal Farm's real text is "All
car parking is free. There are designated disabled parking bays.", one period away from exactly that.
`hasConditionalFreeParking` covers every conditional shape found in production, including both Blue
Badge sentences, so the broader guard would only have cost true claims. A mutation that re-added it
survived every test, which is what surfaced the redundancy; the answer was to delete it, not to write
a test for it.

## Offline replay of every affected active claim

Every active claim in both fields, re-extracted from its own stored source text through the corrected
code. Before is the value production is serving; after is what the corrected code produces.

| Field | Active claims | Changed | Unchanged |
| --- | --- | --- | --- |
| `pushchairSuitability` | 8 | **1** | 7 |
| `familyFacilities.freeParking` | 22 | **3** | 19 |

```
pushchairSuitability
  Paradox Museum London                  good/high   ->  difficult/high   ** changed
  Madame Tussauds London                 difficult/high  (unchanged)
  Royal Air Force Museum London          good/high       (unchanged)
  SEA LIFE London Aquarium               excellent/high  (unchanged)
  V&A East Storehouse                    good/high       (unchanged)
  Victoria and Albert Museum             good/high       (unchanged)
  Woodside Animal Farm                   difficult/high  (unchanged)
  Young V&A                              good/high       (unchanged)

familyFacilities.freeParking
  Flip Out Canary Wharf                  yes/high    ->  (no fact)        ** changed
  Stanborough Park Water Sports Centre   yes/high    ->  (no fact)        ** changed
  Thorpe Park                            yes/high    ->  (no fact)        ** changed
  ... 19 others unchanged (3 yes kept, 14 no kept, 2 ambiguous yes kept)
```

Exactly the four intended claims move. Nothing else does — no legitimate claim is lost, and no new
claim is invented.

One limit on this replay: it re-extracts from the single evidence row each claim cites, whereas the
live pipeline merges facts across every page of a venue. For these 30 claims the cited page is the
deciding one, but the replay is not a full pipeline simulation and is not presented as one.

## Verification

- 1232 tests pass across 66 files; `tsc --noEmit` clean. 26 tests are new.
- Every test sentence is production wording. The two that are not whole sentences are the two halves
  of Flip Out's own sentence, used because it carries both a duration limit and a named-days limit, so
  neither clause is independently proven by the whole sentence.
- **14 mutants, 14 killed.** Each reverts one part of the fix: both interrogative guards, the pram
  denial, the plural-aware denial, the leading-"No" mask, the mask itself, positives reading unmasked
  text on three separate paths, the conditional guard, and four of its clauses individually.
- Two mutants survived the first round and were answered by changing code, not by adding assertions:
  a redundant reversed denial pattern and the `hasRestrictedParking` reuse were both deleted.
- One of my own tests passed for the wrong reason and was rewritten: it asserted that Paradox's Zero
  Gravity sentence yields nothing, which is true only because that sentence never names a pushchair,
  so it proved nothing about negation. It is now two tests, one stating that gate explicitly and one
  that reaches the access-route branch.

## Production state after this pass

Nothing has changed in production. No claim was edited by hand and no venue was requeued.

The four claims above are still being served as they are. The intended repair is a targeted re-crawl
of the affected venues after deployment, so the claims self-heal through the normal pipeline.
