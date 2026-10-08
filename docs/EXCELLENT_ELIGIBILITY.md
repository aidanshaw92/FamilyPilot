# What should earn "Excellent": evidence of activity support, not only an easy visit

2026-10-08. **A proposal with measurements. Nothing in scoring or wording has been changed.** It replaces the "require every
child to be confirmed by a whole-venue recommended age range" proposal in `STABLE_FAMILY_FIT.md`, which you rejected: a venue's
official recommended range is neither available (0 of 134 destinations carry one) nor the only meaningful evidence.

Agreed and unchanged: weather, opening status and closing-soon never change a fit; the under-12-month convention stays for now.

## 0. Final rule after your review (2026-10-08) — still not applied

You agreed that Excellent needs activity evidence, but a playground or other child-directed provision must not qualify a child
of any age. So R2b (section 3) is withdrawn and replaced by **R3**:

> **Excellent requires, for every child aged 12 months or more, activity evidence that names an age range including that
> child:** the venue's own recommended range, or a range the venue states for a part, area, session or regular programme (for
> example "the playground is for ages 4 to 14", "interactive play area for under-8s"). A provision with no stated age (a
> playground, a soft-play area, a farm's animal barn) is **shown as provision** ("Has a playground; the ages it suits aren't
> stated") but never counts toward Excellent, never names a child as suited, and never removes the "we haven't yet confirmed
> whether this suits Sloane" line. One-off events and ticket bands do not count.
>
> **Under 12 months** (the convention, kept provisionally): nothing changes in the gap line, but a baby-only household's
> Excellent rests on logistics alone, so its badge reads **"Easy visit"**, not "Excellent fit", and the headline keeps saying
> "Easy to visit with Ozzie".

**Final measured impact** (same method as section 4: 134 destinations, 8 homes, 7 households, no stated limit or budget,
7,504 pairs; the four part-level age statements found in stored pages are Battersea Park playground 4 to 14, Burgess Park up to
14, Belmont Farm soft play 6 months to 10 years and London Museum Docklands play area for under-8s):

| | Today | Final rule |
| --- | ---: | ---: |
| Excellent, households with a child of 12 months or more | 21 pairs | **0** |
| Excellent, baby-only households (relabelled "Easy visit") | 28 pairs | 28 pairs, worded "Easy visit" |
| Good | 767 | 767 + the 21 that drop one step = 788 |
| Possible, Poor, Not reviewed, scores, ranking | unchanged | unchanged |
| Venues that can show the words "Excellent fit" to anyone | 2 | **0** |

If the four part-level ranges were captured as claims (they are not today), Good would rise by 16 pairs and Excellent would
still be 0: none of those four venues has enough confirmed visit facts to reach Excellent on its other conditions. Excellent
returns when a venue has both an age statement for the child and the confirmed visit facts, which is what the existing-facts
recovery (`EXISTING_FACTS_AUDIT.md`) and age capture will build.

**What a parent reads under R3.** At the museum that is Excellent today for a 3-year-old: badge **Good**, headline "Easy to visit
with Sloane", the playground shown as provision, and "We haven't yet confirmed whether this activity suits Sloane" kept. For a
2-month-old at the same place: badge **"Easy visit"**.

Nothing in scoring or wording has changed; the build (one rule beside the verdict, the provision row, the badge word, tests per
household above) waits for your go.

## 1. The problem, as the data shows it

`excellent` today needs a score of 85 or more, at least four confirmed positives, at least two facts about the venue and
nothing soft left to check. Those facts are toilets, baby changing, parking, café and buggy access: **how easy the visit is, not
whether the activity suits the child**. So the badge can read "Excellent fit" over a card whose own last line says "We haven't
yet confirmed whether this activity suits Sloane". Measured on the combined branch, this is what the engine produces for a
household with a 3-year-old at the museum that reaches Excellent:

> **Easy to visit with Sloane**: Good buggy access, toilets confirmed, parking confirmed, 22 min away. *To check: we haven't yet
> confirmed whether this activity suits Sloane.* Badge: **Excellent fit**.

The sentences are honest; the badge word is not earned by them.

## 2. What evidence of activity support exists today

From read-only queries, 7 October to 8 October 2026, over the 134 London destinations (151 stored rows include 17 restaurants and
cafés, which are scored separately):

| Signal | Venues | Notes |
| --- | ---: | --- |
| The venue's own recommended age range, whole venue (the current `basis: activity`) | **0** | The one candidate (SEA LIFE) was inspected and rejected as unsafe to publish |
| An operator-stated age range for a **part or session** (playground, soft-play area, sensory session) | 3 of the venues in the 134 have a part range; 9 more are sessions or classes | Battersea Park (playground 4 to 14), Burgess Park (up to 14), Belmont Children's Farm (soft play, 6 months to 10 years). Not stored as claims today |
| A confirmed **child-directed provision**: `familyFacilities.playground = yes`, from the venue's own pages, an approved claim with a source | **30** (25 parks, 4 museums, 1 zoo) | Approved claims. The engine does not use this field at all today, in a reason or a score |
| Parent reports about activity | 0 | `venue_visit_reports` has no active rows, and the five fields it covers are facilities anyway |
| Category (farm, soft play, museum) | all | **Not evidence.** Never used to say a place suits an age |

The honest summary: there is meaningful *provision* evidence for 30 venues and *age-specific* evidence for 3, and the
engine reads neither.

## 3. Candidate rules, and what each does

"Supported" is judged for **every child aged 12 months or more** in the household (the under-12-month convention is unchanged:
for a younger baby the visit is the activity, and no activity line is raised). A rule only ever **removes** Excellent; it never adds
one, and Good, Possible, Poor, scores and ranking are untouched.

| | Rule for Excellent | Needs |
| --- | --- | --- |
| R0 | today: logistics alone can earn it | nothing |
| R1 | the venue's recommended range includes the child (the rule in `STABLE_FAMILY_FIT.md`, rejected) | whole-venue ages |
| R2a | R1, **or** an operator-stated range for a part, session or area that includes the child | R1 or part ranges |
| **R2b** | R2a, **or** a confirmed child-directed provision (a playground) **with no operator age statement that excludes the child** | provision claims |

R2b never claims an age fit from provision. The child is not put in "Good for"; the headline stays about the visit; and a
provision-only match says so in words ("Has a playground; the ages it suits aren't confirmed").

## 4. Measured impact

Method: every one of 134 destinations against 8 home areas across London and 7 representative households (a 2-month-old; a
10-month-old; a 3-year-old; a 7-year-old; children of 4 and 7; a 3-year-old with a baby; a 13-year-old), **no journey limit and
no budget stated** (the true new-user state), open every day, 7,504 household-venue pairs. Harness:
`scripts/measure-excellent-options.test.ts.txt` (the catalogue export it reads is never committed).

Verdicts today: Excellent **49** pairs, Good **767**.

| Rule | Excellent pairs | Change | Venues that can ever be Excellent |
| --- | ---: | ---: | ---: |
| R0 today | 49 | n/a | 2 |
| R1 | 28 | -21 | 2 (only for babies under 12 months) |
| R2a | 28 | -21 | 2 (the three part-range venues do not reach Excellent on logistics anyway, so this changes nothing today) |
| R2b | 42 | -7 | 2 |

By household (Excellent pairs; each household has 1,072 pairs, 8 homes x 134 venues):

| Household | R0 | R1 | R2a | R2b |
| --- | ---: | ---: | ---: | ---: |
| 2-month-old | 14 | 14 | 14 | 14 |
| 10-month-old | 14 | 14 | 14 | 14 |
| 3-year-old | 7 | 0 | 0 | 7 |
| 3-year-old and a baby | 14 | 0 | 0 | 7 |
| 7-year-old, children of 4 and 7, 13-year-old | 0 | 0 | 0 | 0 |

What this says, plainly:

1. **Excellent is already almost unreachable: two venues in 134, for four household types.** The school-age and teenage
   households never reach it, under any rule, today included (their cards stop at Good with no activity evidence). The rule
   choice therefore moves a handful of badges, not the product.
2. The two venues are an indoor attraction on the South Bank with excellent buggy access, and (by its coordinates) the RAF
   Museum in Hendon, which has a confirmed playground, parking and a café. Under R2b the museum stays Excellent for the 3-year-old (it has a confirmed playground and no age statement
   against a 3-year-old) and the attraction (no confirmed child-directed provision) drops to Good.
3. **R1 and R2a make Excellent a baby-only badge**, earned on logistics alone, which is the loophole the rule was meant to close.
   That is the strongest argument against R1.
4. The 767 Good pairs are untouched. Where a child has only logistics, the card already says the activity is not yet confirmed.

## 5. Recommendation (superseded by section 0)

**Adopt R2b, and fix the baby case in the words, not the logic.**

1. **For children of 12 months or more**, Excellent requires activity support as defined in R2b: a stated range (whole venue or
   part) that includes the child, or a confirmed child-directed provision with nothing that excludes them. Provision claims
   already exist for 30 venues, so this is real on day one, not a promise about future data.
2. **Show the support.** Add one line to the card for the supporting evidence, in the venue's own terms: "Has a playground (ages
   not confirmed)" or "The playground is for ages 4 to 14". It is a reason with a tick for provision and for a range alike; it
   never names the child as suited unless an age statement includes them.
3. **Under 12 months, unchanged for now** (the convention keeps its job: no "activity not confirmed" line for a carried,
   fed, changed baby). But **a logistics-only Excellent for a baby must not be labelled "fit"**: the badge reads "Easy visit" and
   the headline already says "Easy to visit with Ozzie". That changes 28 badge labels in the sample (the 2-month and
   10-month households), no score and no ranking, and it states exactly what the evidence supports.
4. **Not changed:** any verdict below Excellent, any score, any ranking, the 12-month constant, parent-report semantics.

What R2b needs to be built (about a day, no data work, no provider call): read `familyFacilities.playground` into the matcher's
facts and the reason list, the support test in `family-match.ts` beside the verdict, the badge label for the logistics-only
baby case, tests for each branch and each household above, and the harness rerun for the after-numbers. I have **not** done it
because it changes what the top badge means, which you asked to approve first.

## 6. Risks to say out loud

- **A playground is provision, not suitability.** A playground confirmed on a park's page does not say the 3-year-old can use
  its equipment (many are for 5 to 12). R2b accepts that as meaningful support but not as an age claim, so it is worded as
  provision, never as "suits". If you would rather not accept provision at all, the answer is R2a, and Excellent becomes a
  baby-only badge until part ranges are captured; I do not recommend that.
- **Thin evidence base.** 30 provision claims and 3 part ranges were found by pattern and by hand in stored pages; a
  structured extraction of part ranges (the three above are hand-read) would be a separate, reviewed piece of work.
- **The sample is not the population.** No stated limit or budget, venues open daily, 8 homes and 7 households. It shows the
  direction and the size of the effect, not a forecast for any family.
- **Cards versus the page.** Cards use the venue's own facts and the badge is computed the same way everywhere; if R2b is
  adopted the card and the page agree because they share the engine.
