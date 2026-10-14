# Discovery rules: judge a place by what it is, not by every service it offers

Status: draft PR, **not merged**. Changes `server/places/lib/places-quality.js` only. No database change, no data correction, no new
Google request, no scheduled job. Replay and fixtures run locally with no network.

Part of the catalogue work in [CATALOGUE_BOTTLENECKS.md](CATALOGUE_BOTTLENECKS.md) and [CATALOGUE_CORRECTIONS.md](CATALOGUE_CORRECTIONS.md)
(rules R1 to R4).

## The defect

A Google place was rejected if **any one** of its types was on an exclusion list that includes `cafe`, `restaurant`, `library`,
`lodging`, `school` and `university`. Family venues very often carry one of those as a secondary type, so a museum with a cafe, a farm
with a cafe, a museum inside a university, or the Natural History Museum (Google also tags it `library`) was dropped before it was
stored, and could never be refreshed either. The same code runs on the by-ID refresh path, so a venue already stored could not be
renewed.

A second, smaller defect sat in the same function: when Google's primary type was broad, the **primary type did not compete** with the
secondary ones. A tourist attraction with an on-site cafe was filed as a cafe and dropped from Explore.

## The rule now

Explore judges a place by what it **is**:

1. **Adult premises anywhere** (`night_club`, `casino`, `liquor_store`) rejects, even on a place whose primary type looks like a
   family one.
2. **A primary type on the exclusion list** rejects (the place is a hotel, a cafe, a library, a school, a theatre).
3. **A primary type that is a family destination accepts**, whatever else Google also lists (a park, museum, gallery, zoo, farm,
   aquarium, funfair, indoor play centre, bowling alley and the like). A cafe, a library, a university department or a hotel on the
   same estate says what the place offers, not what it is.
4. **A broad or unknown primary type** (`tourist_attraction`, `cultural_center`, `marina`, `campground`, or none): nothing says what the
   place is, so any other disqualifying type still rejects. **On-site food is the one exception**: a cafe or restaurant never rejects.

The restaurant intent keeps the original any-type rule unchanged.

Classification (which group) changed in four ways, each backed by a decided correction in the ledger:

- A **park is a park.** Pitches, a gym, a museum in the grounds or a visitor centre no longer re-file it. Only a type that names the main
  draw replaces it: a zoo, a farm, a funfair, an indoor play centre (so Mudchute Park and Farm stays a farm).
- Any **museum subtype is a museum** (`history_museum` joins `art_museum`, `childrens_museum`).
- `nature_preserve`, `wildlife_refuge` and `garden` are **green space**, not a generic attraction.
- On a broad primary type, **the primary type competes** with the secondary ones.

## Replay against the 149 stored non-restaurant Google rows

`node scripts/replay-discovery-rules.mjs rows.json --before <old places-quality.js>`. The rows are Google content and are not committed;
the script prints the SQL that exports them. Types are the Google types FamilyPilot stored for each row.

| | Before | After |
|---|---:|---:|
| Rows replayed | 149 | 149 |
| Accepted for Explore | 146 | 147 |
| Rejected | 3 | 2 |
| Rows whose group changes | | 4 |
| Rows unchanged | | 143 |

Every row that changes, and why:

| Venue | Before | After | Primary type | Decided |
|---|---|---|---|---|
| Natural History Museum | rejected | museum | museum | museum, must stay accepted (secondary `library`) |
| Paddington Recreation Ground | activity | park | park | park (pitches and a gym are facilities) |
| Walthamstow Wetlands | attraction | park | nature_preserve | park |
| Churchill War Rooms | attraction | museum | history_museum | museum |
| Gunnersbury Park | museum | park | park | park (museum is on site) |

Still rejected, both correctly and both before and after: **Troubadour Wembley Park Theatre** (primary theatre) and **College Lane
Campus LRC** (primary library). Both are legacy rows from before the exclusion list and neither is served today.

**The eight known corrections** from the ledger are: three recategorisations (Paddington, Walthamstow, Churchill), two exclusions
(Troubadour, College Lane) and three Flip Out venues whose soft play and trampoline status is decided from their own pages. The first
five are produced by the rules above. The Flip Out three are deliberately **not** a discovery decision; see the next section.

### False positives and false negatives

Measured against the seven decided outcomes, with every other row expected to be left alone:

| | Count |
|---|---:|
| False positives (accepted or grouped against the decision) | 0 |
| False negatives (rejected against the decision) | 0 |
| Changes nobody decided | 0 |

**What this does not measure.** A place the old rule rejected was never stored, so the stored rows cannot show what else was lost.
Measuring that needs the raw Google results, which means a Google request, and none was made. The only evidence on the recovery side is
the real Natural History Museum type set and the fixtures below. The first production run after merge is the real test, and it will
add (not remove) places.

### Fixtures: old rule against new

Marked REAL are the stored types of a venue FamilyPilot already holds. Marked HYPOTHETICAL are the shapes the old rule dropped; none
is stored, because a rejected place is never stored.

| Case | Old | New |
|---|---|---|
| REAL Natural History Museum (museum, library, event venue) | rejected | museum |
| REAL Royal Academy of Arts (gallery, educational institution) | museum | museum |
| HYPOTHETICAL museum with a cafe | rejected | museum |
| HYPOTHETICAL museum inside a university | rejected | museum |
| HYPOTHETICAL farm with a cafe and restaurant | rejected | farm |
| HYPOTHETICAL zoo on a hotel estate | rejected | zoo |
| HYPOTHETICAL soft play centre with a cafe | rejected | soft_play |
| HYPOTHETICAL park with a cafe and a library | rejected | park |
| HYPOTHETICAL aquarium with a restaurant | rejected | attraction |
| HYPOTHETICAL tourist attraction with a cafe | rejected | attraction |
| A hotel Google also calls a tourist attraction | rejected | rejected |
| A restaurant beside a park | rejected | rejected |
| A library Google also tags museum | rejected | rejected |
| A school with a playground | rejected | rejected |
| A church that is a tourist attraction | rejected | rejected |
| A broad tourist attraction that is a hotel, a place of worship or a bar | rejected | rejected |
| A cultural centre that is a temple | rejected | rejected |
| A bowling alley that is a night club | rejected | rejected |
| An amusement park that is a casino | rejected | rejected |

The old rule rejected all ten mixed-use shapes. The new one accepts those ten and still rejects every negative control.

## Trampoline parks stay distinguishable from toddler soft play

Both still land in the `soft_play` group, as before. The distinction is made from the venue's own pages and the reviewed map in the
Explore change (#203), and **this change does not touch what that decision reads**: the primary type, the full type list and the name
are recorded exactly as before. Tests pin that a `trampoline_park` and an `indoor_playground` keep their different types, that a trampoline
park Google files under `park` is still found by its name, and that a cafe on site no longer rejects a soft play centre.

Checked against the Explore classifier (from #203) over the same 149 rows: **all 147 accepted rows keep exactly the group, label and
soft play and trampoline status they have today.** The six soft play venues are identical before and after (two trampoline-only parks,
two trampoline parks with soft play, one indoor play centre with soft play, one indoor play centre with no trampolines).

## Judgement calls and residual risk

- **Tourist attraction plus cafe or restaurant only** is now accepted as an attraction. A restaurant that Google also calls a tourist
  attraction could slip in. It would carry the provider-only Family Fit cap, show "not reviewed", and pass through chain and alias
  de-duplication like any other place. This is the one rule I would watch on the first run.
- **A bowling alley or ice rink that also has a bar** is accepted (bar is not an adult-premises type here). Age and door policies still
  come from evidence, not from the type list.
- **A holiday park or zoo on a hotel estate** is accepted. That is intended.
- `library`, `school` and `university` on a **broad** primary type still reject, as before.

## What merging does and does not change

- Stored rows are **not** touched. Four stored venues get a different group the next time discovery or a refresh rewrites them (the
  four above). Until then the Explore reviewed map already shows the correct groups.
- The Natural History Museum **does not reappear on merge.** It returns when a discovery or by-ID refresh fetches it, which is a Google
  request this change does not make. See [FRESHNESS_DISCOVERABILITY.md](FRESHNESS_DISCOVERABILITY.md).
- No change to the restaurant intent, ranking, de-duplication, the budget gate or what Google is asked for.

## Rollback

Revert the merge commit. Nothing is stored by this change. Rows rewritten by a discovery run in the meantime keep the group they were
given, which is the corrected one.

## Not in this change

Subtype storage for soft play and trampolines (R5), serving older rows with a "last checked" label (R6), the ledger migration and any
production data correction. Each is a separate decision.
