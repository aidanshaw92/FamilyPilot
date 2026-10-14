# Using OpenStreetMap-derived venue records: licence review

2026-10-14. **This is a technical review, not legal advice.** I could not open the ODbL text or the OpenStreetMap Foundation's pages from
this environment (network policy). The findings below come from search summaries of those pages and from my own reading of how the
licence is commonly applied. Where I am unsure I say so in section 6. Counsel should read the primary texts before the first import.

## 1. Decision asked of this review

You approved using OSM-derived venue records in principle, provided the implementation complies with the licence. The questions were:
ODbL requirements and attribution, share-alike implications for our stored venue database, source and provenance retention, acceptable
access methods and rate limits, and whether the proposed sources can be combined in our database.

## 2. What the licence asks (ODbL 1.0)

| Topic | What I found | Source type |
|---|---|---|
| **Use for any purpose** | The OSMF Licence and Legal FAQ states the ODbL allows use of OSM data for any purpose, commercial included | search summary of the FAQ |
| **Attribution** | Where the data, or something made from it, is publicly used, a notice is required that the content came from OpenStreetMap under the ODbL. The usual form is "© OpenStreetMap contributors" with a link to the copyright page. OSMF's own attribution guideline from 2020 is still only a draft | summaries of the FAQ and the draft guideline |
| **Share-alike** | If you publicly use a **Derivative Database**, you must offer it to recipients under the ODbL (or a compatible licence). A **Produced Work** made from a database, such as a map, does not have to be ODbL, but the notice is required, and the underlying data may have to be offered on request | summaries of the FAQ and Community Guidelines |
| **Internal use** | If you make no public use, nothing needs to be shared | summary of the FAQ; I could not confirm the clause directly |
| **Substantial** | Taking a substantial part of the contents, by quantity or quality, is what makes something a derivative. Repeated, systematic taking of insubstantial parts can add up to a substantial part | legal-talk archive summaries |
| **Collective Database** | A database held as one of several independent databases assembled into a whole, in unmodified form, is not itself a Derivative Database | my knowledge of the licence definitions; confirm |
| **Layered maps** | Combining OSM with other layers on a map does not by itself create a Derivative Database (ODbL 4.5(b)) | Community Guidelines summary |

The OSMF's Community Guidelines are its stated interpretation. They are not law, and a court would decide.

## 3. What this means for FamilyPilot

**Attribution and notice.** The app already credits OpenStreetMap on the list surfaces where an OSM-derived place appears (the provider
credit checked by `verify-place-credits`). That mechanism extends to a new batch: each batch records the attribution text it needs.

**Is our venue database a Derivative Database?** A few OSM-derived points shown one at a time are not a substantial extraction. A stored
set of several hundred London playgrounds, parks, museums and farms taken from OSM, classified and kept in our database, probably is
substantial in quality if not in quantity, and it is a systematic extraction. **Plan as though it is a Derivative Database.**

**Is it publicly used?** The app shows these places to the public, and `place_records` is readable with the public key. I would treat
that as public use. Internal use only is not what this is.

**So the obligation to plan for** is: attribution and the ODbL notice, and offering the OSM-derived dataset to recipients under the ODbL.
That is workable, **if the dataset being offered contains only what can be offered.**

## 4. The real constraint: do not merge OSM-derived rows with Google content

`place_records` holds Google content (names, positions, hours, website, phone) under Google's terms, which forbid keeping or
relicensing it beyond a 30-day window. If OSM-derived rows lived in the same table and the table were treated as one Derivative Database,
share-alike would be asked to reach content that cannot be shared under the ODbL. That is a licence conflict, not a technicality.

Today `place_records` already holds 19 OSM-derived rows (17 food places and 2 museums). At that size I would not call it a substantial
extraction, so I do not see a present problem. It stops being comfortable at several hundred rows.

**Recommended design (see [LEDGER_MIGRATION_PROPOSAL.md](LEDGER_MIGRATION_PROPOSAL.md)):**

1. OSM-derived and other open-data rows go in **their own table**, with their own batch provenance, **not in `place_records`**. They are
   a separate database, assembled with ours at read time (a Collective Database use, as I read it).
2. **No Google value is copied into an open-data row**, and no open-data value into a Google row. They are linked by identifier only
   (a Google place ID against an open-data id), through a link table.
3. **Our own derived facts** (classification, evidence from a venue's website) sit in our own tables, keyed to the venue. They are ours.
   The OSM-derived table holds only what the source said, plus the group we assigned from its tags.
4. **An ODbL export** of the OSM-derived rows, and only those, is published at a stable address and linked from the credits, with the notice
   and the retrieval version. That is the "offer" in section 3.
5. Rows from **OGL** (OS, boroughs), **CC0** (Wikidata) and **CC BY** (Mapping Museums) sit in the same open-data table with their own
   attribution. OGL is described as compatible with the ODbL (the OGL text and the OSM wiki), so mixing them there is fine. CC0 needs
   nothing. CC BY needs credit.

## 5. Provenance we must keep

Per batch: source, source version or file date, source URL, licence and its URL, the exact attribution text, retrieval time, who or what
retrieved it (the script and its commit), and the row count. Per row: the batch, the source's own id (for OSM the element type and id
with its version), and the **source tags kept verbatim** for the tags that decided its group or supplied a fact. Contributor names are
not in the public extract and are not stored.

## 6. Remaining legal uncertainty

I cannot resolve these from here. Counsel, or the OSMF's licensing working group, can.

1. Whether our combined venue database is a Derivative Database or a Collective Database. The separate-table design is meant to make the
   Collective reading the natural one, but the line is the licence's, not mine.
2. Where "substantial" falls for a few hundred venues from a city of millions of features, and how repeated refreshes count.
3. Whether a publicly readable table and an API serving it is "publicly using" the database in the licence's sense, as against only
   publicly using a Produced Work.
4. What the notice must say, and where it must appear, in a mobile or web app. The OSMF's own guideline is a draft.
5. Whether tag-level facts (`wheelchair`, `toilets`, `opening_hours`) are better presented as OSM's statement with a date than as ours.
6. Future relicensing risk of combining OGL data with ODbL data, flagged on the OSM wiki.
7. The UK database right as it applies alongside the licence.

## 7. Access methods and limits

| Method | Rule | Our use |
|---|---|---|
| Geofabrik extract | free, ODbL; download once, update with a diff tool, do not loop | **Preferred.** One download for the dry run |
| Overpass API | about 10,000 requests and 1 GB a day, parallel slots per address | A handful of bounded checks at most, as the existing food backfill does |
| Nominatim | one request a second, no bulk | **Not used** |

## 8. Recommendation

Proceed to the dry run with OSM as one source among several, **in its own table, attributed per batch, never mixed with Google content,
with an ODbL export**. Have counsel read the ODbL and the OSMF guidance before the first import, and ask them the seven questions in
section 6. Nothing is stored until you approve the migration.
