# The regression the canary surfaced: a feature phrase became a venue verdict

The Horniman canary published **`environment = mixed`** for an indoor museum, off one sentence:

> "Indoor and outdoor seating is available for Cafe purchases only"
> -- `horniman.ac.uk/plan-your-visit/food-drink/`

Cafe seating is the canonical Q2 case. This is not a reopening of Q2; it is code violating a contract
Q2 already settled.

## Root cause, found by replay rather than by reading

```
venueLevelSetting("Indoor and outdoor seating is available...")  ->  { indoor: false, outdoor: false }
classifyEnvironment("Indoor and outdoor seating is available...")  ->  mixed
```

The two disagreed on the same sentence. `classifyEnvironment` tested `MIXED_PATTERNS` against the
**raw** sentence in a short-circuit loop that ran *before* `venueLevelSetting` was ever consulted. The
mask existed in one code path and not the other, and the unmasked one won.

A second case in the same family turned up while probing it:

```
classifyEnvironment("Indoor & outdoor seating available")  ->  indoor
```

`&` is not a word character, so the modifier run could not bridge it: only "outdoor seating" was
masked, leaving a bare "Indoor" to win outright. Partial masking produced a one-sided venue verdict
from a pure feature phrase -- the same shape as the Belmont bug, opposite sign.

## The fix

1. `maskFeaturePhrases()` extracted as one function, used by **both** the mixed short-circuit and
   `venueLevelSetting`. Having it in one place and not the other is how this happened.
2. The modifier run bridges `&` and `/` as well as `and`, so a conjunction cannot split a feature
   phrase in half.
3. `courtyard` removed from `FEATURE_NOUNS` -- see below.

## Why `courtyard` had to go, and why that is not reopening the contract

Masking the mixed test broke a committed test:

> `'Our indoor galleries and outdoor courtyard are both open today.'` -> `mixed`

alongside its sibling, which still passed:

> `'The galleries are entirely indoors. There is outdoor seating on the forecourt.'` -> `indoor`
> *"An indoor venue with outdoor seating is indoor-with-a-feature, not a mix. The outdoor half has to
> be venue-level too."*

Those two can only both hold if **a courtyard is venue space and seating is furniture**. That is the
product's own stated position. But `courtyard` was sitting in `FEATURE_NOUNS`, so on masked text the
galleries sentence lost its outdoor half and came out `indoor`. The two tests had only ever both
passed because the mixed short-circuit read the sentence unmasked -- the identical defect that
published the Horniman's false `mixed`. The galleries test was green for the wrong reason.

So the list was wrong, not the contract. Changing the test expectation to `indoor` would have been
reopening Q2 to suit the implementation; removing `courtyard` aligns the implementation with Q2.

## Verification

18 behavioural cases pass, including every earlier Belmont and corpus case. Four mutants, all killed:

| mutant | failures |
|---|---|
| mixed short-circuit reads the raw sentence again (the production defect) | 2 |
| modifier run cannot bridge `&` | 1 |
| `courtyard` restored to `FEATURE_NOUNS` | 1 |
| `VENUE_NOUNS` exclusion removed (the Belmont regression) | 3 |

The second mutant initially appeared to survive. It had not been applied -- the substitution silently
failed. Re-applied and verified against the file's own text first, it dies. A mutant that was never
really injected is not a survivor, and reporting it as one would have been worse than not running it.

1376 tests across 74 files, typecheck clean.

An invariant test now asserts the thing that actually broke: for every sentence,
`classifyEnvironment` returns a verdict if and only if `venueLevelSetting` reports a side. The two
cannot drift apart again without a red test.
