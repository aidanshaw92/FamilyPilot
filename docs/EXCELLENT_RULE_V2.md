# Excellent, second proposal: credible age-relevant activity evidence

2026-10-08. **A proposal with measurements. No scoring or wording has changed.** It replaces R3 in
`EXCELLENT_ELIGIBILITY.md` (#168), which you rejected: requiring a published numerical range for every child over 12 months
would remove Excellent entirely, because no venue publishes a whole-venue range.

## 1. The rule (R4)

**Activity evidence** is something the venue's own pages state about what children of an age can do there. There are three
kinds:

| Kind | What counts | Example from the stored pages |
| --- | --- | --- |
| A. Whole-venue range | the venue's own recommended ages | none in the catalogue today |
| B. **Permanent provision for an age** | a playground, play area, soft play, space, gallery or hands-on exhibits described for an age: stated numbers, or an explicit age band (toddlers, under-5s, preschool, juniors, older children, teens) | Chiswick House "Under 7s playground"; Battersea Park "Playground for toddlers and juniors ... suitable for children 4 to 7, 8 to 14"; RAF Museum "Free activities for everyone from toddlers to teens ... hands-on activities and family-friendly exhibits in every hangar"; Discover "Baby and Toddler Sensory Space, Daily, Age guide: 0-2"; Flip Out Watford "Toddler Soft Play" |
| C. **Scheduled programme for an age** | classes, sessions or a regular event for an age, on set days | Beckenham Place Park "Junior Park run for 4-14 year olds"; Frameless "Multi-Sensory Tots Classes"; William Morris Gallery "Activities are suitable for children aged 2+" (drop-in sessions) |

**Bands**, used only where the venue uses the word:

| Word on the page | Ages assumed |
| --- | --- |
| baby and toddler | 0 to 3 |
| toddlers, tots | 1 to 3 |
| preschool, under-5s, early years | 2 to 4 |
| juniors, older children | 7 to 12 |
| teens | 12 to 17 |

These do not count:

- a vague audience ("kids", "children", "families", "young people");
- a provision with no age (a playground, a farm);
- a one-off dated event;
- a ticket band ("under 3s free");
- an accompaniment or independent-entry rule ("Ages 14-17 may visit independently");
- a height rule ("under 1.2m");
- benefits eligibility ("children under 16 on DLA");
- activities "to do at home".

**What each kind does, per child aged 12 months or more:**

1. **The child is named.** Any kind that includes the child names them, with the evidence in words:
   - "Good for Maya: Junior parkrun for ages 4 to 14 (on set days), for Maya's age";
   - "Under-7s playground, for Kit's age".
   A provision with no stated age is shown as provision and names no one.
2. **Excellent** needs the existing visit conditions, unchanged (score of 85 or more, four confirmed positives, nothing soft
   left to check). On top of that, **every child aged 12 months or more must be covered by kind A or B.** A scheduled
   programme (C) alone keeps the place at Good: the family may not visit on the day it runs.
3. **Unknown stays honest.** A child no evidence covers keeps "We haven't yet confirmed whether this activity suits <name>".
   Evidence that covers a different age is never read as unsuitability: Discover's baby space says nothing against a
   7-year-old.
4. **Logistics stay separate.** Toilets, parking, buggy access, wheelchair access and opening hours never cover a child.
   Under 12 months the convention is unchanged: the visit is the activity, and a baby-only household's Excellent badge reads
   "Easy visit".
5. **Optional, measured separately (R4 + score):** kind B covering every older child sets the age factor of the score to 88
   (a whole-venue range is 96, unknown is 75), and covering some to 80. Kind C does not move the score. This is the only
   part that changes rankings.

## 2. Evidence available today (134 London destinations, stored own pages only)

- **14 venues** have credible evidence: 10 permanent provision (B) and 3 scheduled programmes (C), plus Burgess Park,
  Belmont Children's Farm and London Museum Docklands from the earlier age audit (all B).
- Read by hand from a search of the stored pages; the rejected candidates are listed in section 6.
- **Kind B:** RAF Museum London, Battersea Park, Chiswick House, Discover Children's Story Centre, Flip Out Watford, Babylon
  Park, Hobbledown Heath, Swanley Park, Burgess Park, Belmont Children's Farm, London Museum Docklands.
- **Kind C:** Beckenham Place Park, Frameless, William Morris Gallery.

## 3. Measured impact

**Method.** 134 destinations, 8 homes and 7 households, with no stated limit or budget: 7,504 pairs. This is the harness of
`EXCELLENT_ELIGIBILITY.md`, extended with the evidence above. Prototyped in a scratch copy of the engine, never committed.
Facts are as served on 8 October, before the display, identity and extraction PRs.

| | Today (R0) | R3 (rejected) | **R4** | R4 + score |
| --- | ---: | ---: | ---: | ---: |
| Excellent pairs | 49 | 28 | **60** | 68 |
| of which households with a child of 12 months or more | 21 | 0 | **32** | 40 |
| Good | 767 | 788 | **798** | 794 |
| Possible | 3,016 | 3,016 | **2,974** | 2,970 |
| Pairs whose headline names a child as suited | 0 | 0 | **368** | 368 |
| Venues that can show "Excellent" to a family with a child of 12 months or more | 2 | 0 | **1** (RAF Museum) | 1 |
| Ranking: top-10 overlap with today, average (minimum) | | 10 (10) | **10 (10)** | 8.7 (7) |
| Evidence venues that move in a household's list | | 0 | **0** | 333 moves, 221 of them up |

By household (Excellent / Good):

| Household | Today | R3 | **R4** | R4 + score |
| --- | --- | --- | --- | --- |
| baby (2 months), baby (10 months) | 14 / 10 | 14 / 10 | 14 / 10 | 14 / 10 |
| toddler (3) | 7 / 17 | 0 / 24 | **7 / 17** | 8 / 16 |
| school (7) | 0 / 240 | 0 / 240 | **6 / 247** | 8 / 248 |
| two kids (4, 7) | 0 / 240 | 0 / 240 | **6 / 255** | 8 / 254 |
| baby + toddler | 14 / 10 | 0 / 24 | **7 / 17** | 8 / 16 |
| teen (13) | 0 / 240 | 0 / 240 | **6 / 242** | 8 / 240 |

**What changes, in words:**

- SEA LIFE stays Excellent only as an easy visit for babies: no activity evidence covers older children (see section 6).
- The RAF Museum becomes Excellent for every household, because its own page states hands-on provision "from toddlers to
  teens". Today it is Excellent for a 3-year-old on logistics alone, the case R3 was written to stop.
- About 40 Possible pairs become Good, because an activity line is a confirmed positive about the child.
- Rankings do not move under R4 (the verdict is a label, ordering is by score). With the optional score step, a family's
  top ten keeps 8 or 9 places on average.

## 4. What a parent reads (R4, home in Islington)

| Venue | Household | Badge | Headline and the activity line |
| --- | --- | --- | --- |
| RAF Museum London | 4 and 7 | **Excellent** | "Excellent for Kit and Maya": hands-on activities for toddlers to teens, for Kit's age (and Maya's); toilets and parking confirmed |
| RAF Museum London | 3 and a baby | **Excellent** | "Excellent for Sloane, and easy to visit with Ozzie" |
| Beckenham Place Park | 7 | Good | "Good for Maya": Junior parkrun for ages 4 to 14 (on set days), for Maya's age. Not Excellent: a scheduled run is not there every day |
| Chiswick House | 4 and 7 | Good | "Good for Kit, but we haven't yet confirmed whether this activity suits Maya": Under-7s playground, for Kit's age |
| Chiswick House | 7 | Possible | no activity line: the under-7s playground does not cover Maya, and that is not held against the place |
| Burgess Park | 3 | Possible | "Playground for children up to 14, for Sloane's age"; buggy access still to check |
| Discover | 3 | Possible | no activity line: the baby and toddler space is for 0 to 2 |

## 5. Adversarial notes, and what the rule refuses

1. **A weekly run is not a venue.** In the first draft, Beckenham Place Park became "Excellent for Maya" on its junior
   parkrun. That is why scheduled programmes (C) name a child but never make Excellent.
2. **SEA LIFE's "the recommended age of the attraction is children aged 6 and over"** would be kind A. It stays out, as
   the source inspection in #167 decided: the same page sells free entry to under-2s, and publishing a range that excludes
   them needs a person's decision.
3. **Literal upper ends.** Burgess Park's "up to 14" names a 13-year-old as suited to the playground. The words are the
   venue's own; the line says "Playground for children up to 14", so the parent sees what it rests on.
4. **Bands are only what the page says.** "Older children" (Swanley Park) is 7 to 12, never a teenager. "Young people" and
   "kids" are never a band.
5. **Rejected candidates from the search:**
   - Gunnersbury's one-off "Relaxed Sessions: Spooky Season On 26/10/2026" (dated);
   - The Wallace Collection's "activities to do at home with children aged 6–11";
   - Paradox's "Ages 14 - 17: May visit the museum independently";
   - Flip Out's "under 1.2m";
   - the London Eye's and SEA LIFE's DLA "under 16";
   - Rickmansworth's water-ski club;
   - the Design Museum's "workshops for adults and young people";
   - Hackney Marshes' junior football pitches.

## 6. Building it (after your go)

1. **Store the evidence as claims, not code.** An `activityEvidence` claim per venue: kind, minimum and maximum months,
   label, excerpt, URL and date.
   - It is approved through the existing review path. Nothing is auto-approved from a regex, because each item above
     needed a person's reading.
   - The 14 items here become the first reviewed batch.
2. **Family Fit.** The per-child activity line, the Excellent gate (A or B for every child of 12 months or more), the "Easy
   visit" badge word for babies, and tests per household as in section 3.
3. **Venue Detail.** A provision row shows its stated ages ("Playground: Under 7s"), and "On site, ages not stated" stays
   where none are stated.
4. **Separately, only if you want rankings to move:** the score step in section 1.
