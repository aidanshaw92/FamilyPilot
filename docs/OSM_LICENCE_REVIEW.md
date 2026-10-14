# Using OpenStreetMap-derived venue records: licence review

2026-10-14, revised the same day for the P0 recovery. **This is a technical review, not legal advice.** I could not open the ODbL text or
the OpenStreetMap Foundation's pages from this environment (network policy). The findings below come from search summaries of those pages
and from my own reading of how the licence is commonly applied. Where I am unsure I say so in section 6. Counsel should read the primary
texts before the first import.

> **What changed in this revision.** The first version said that putting OSM-derived rows in their own table makes the combined
> database a Collective Database "as I read it". That was too confident and I withdraw it. **Separate tables (or files) are a technical
> measure that makes the licence easy to honour. They do not decide the legal question.** What the OSMF's own guidelines say (as
> summarised by search, not read) makes the question harder, not easier. See section 4A.

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

1. OSM-derived and other open-data rows go in **their own table** (or their own file, in the recovery registry), with their own batch
   provenance, **not in `place_records`**. This keeps what must be offered separable. It does not by itself make the whole a Collective
   Database; see 4A.
2. **No Google value is copied into an open-data row**, and no open-data value into a Google row. They are linked by identifier only
   (a Google place ID against an open-data id), through a link table.
3. **Our own derived facts** (classification, evidence from a venue's website) sit in our own tables, keyed to the venue. They are ours.
   The OSM-derived table holds only what the source said, plus the group we assigned from its tags.
4. **An ODbL export** of the OSM-derived rows, and only those, is published at a stable address and linked from the credits, with the notice
   and the retrieval version. That is the "offer" in section 3.
5. Rows from **OGL** (OS, boroughs), **CC0** (Wikidata) and **CC BY** (Mapping Museums) sit in the same open-data table with their own
   attribution. OGL is described as compatible with the ODbL (the OGL text and the OSM wiki), so mixing them there is fine. CC0 needs
   nothing. CC BY needs credit.

## 4A. What the OSMF's guidelines add, and why separate tables are not enough

Summaries of the ODbL definitions and the OSMF Community Guidelines (not the primary pages) give me this:

1. **The definition.** A *Collective Database* is the database "in unmodified form" as part of a collection of independent databases
   assembled into a whole, and a Collective Database is not a Derivative Database. A *Derivative Database* includes any adaptation,
   arrangement or alteration of the database or of a Substantial part of its contents, and includes extracting a Substantial part into a
   new database. **We would alter what we take** (select a subset by tag, assign our own group, drop tags), so "unmodified form" does not
   obviously describe the OSM-derived rows. I would plan on them being a Derivative Database.
2. **The OSMF Collective Database Guideline** (endorsed June 2016, as summarised). OSM and non-OSM data are treated as independent when,
   for each data type within a regional cut, the data is *entirely OSM or entirely non-OSM*; share-alike then reaches only the OSM parts. It
   is not triggered when the datasets *do not reference each other*, or when non-OSM data wholly replaces a geometry type.
   - **Mixing.** A Museums list that holds some Google rows and some OSM rows for London mixes the two within one data type and region.
     That is the situation the guideline says does *not* qualify. Serving Google and OSM entries side by side, even from separate tables,
     is such a mix.
   - **References.** A table linking a Google place ID to an OSM element is a reference between the datasets. So is an OSM-derived entry
     keyed by a Google place ID, which the recovery registry does today to keep saved plans working.
3. **The OSMF Geocoding Guideline** (endorsed August 2017, as summarised). Results made of names, addresses and coordinates, that are not
   "a systematic attempt to aggregate all or substantially all primary features of a type within a city-sized or larger area", are not a
   substantial extract. **Importing every museum or playground in Greater London is exactly that systematic aggregate**, so I cannot rely
   on this guideline for the import. It does support a handful of one-off lookups.
4. **The Substantial Guideline** and the numeric threshold I remembered (about 100 features): I could not find its wording and will not
   rely on a number.

**So the position is:** treat the OSM-derived entries as a Derivative Database that must be offered under the ODbL; do not count on the
Collective reading; and avoid, rather than argue about, the two situations the guideline names. The design consequences:

- **Cut over by category; do not blend.** Serve a category from OSM (and the other open sources) *instead of* Google for that category,
  rather than one list that mixes both. In steady state the Google rows are gone, so there is no mix. The blend that is only transitional
  (20 October to 8 November, while Google rows remain) is the part to take to counsel, and the safest course is to switch a category when
  its open-data coverage is at least what Google's was, not before.
- **Do not cross-reference more than continuity needs.** Saved plans and saved places hold `fp-google-...` ids. Keeping those working
  needs an alias from the old id to the new one. That alias is a reference between the datasets. Whether it can live in our own tables
  (our fact about two records) or must be avoided is a question for counsel. Until it is answered, the registry is built but empty.
- **`osm.json` is the thing to offer.** All OSM-derived entries are in one file (and nowhere else), with batch, version and attribution,
  so the offer is a file at a stable address linked from the credits.

None of this changes the recommendation to proceed with the **dry run**, which stores nothing and serves nothing. It does mean no OSM
entry should be served until counsel has answered the questions in section 6 and you have approved the approach.

## 5. Provenance we must keep

Per batch: source, source version or file date, source URL, licence and its URL, the exact attribution text, retrieval time, who or what
retrieved it (the script and its commit), and the row count. Per row: the batch, the source's own id (for OSM the element type and id
with its version), and the **source tags kept verbatim** for the tags that decided its group or supplied a fact. Contributor names are
not in the public extract and are not stored.

## 6. Remaining legal uncertainty

I cannot resolve these from here. Counsel, or the OSMF's licensing working group, can.

1. Whether our combined venue database is a Derivative Database or a Collective Database. Separate tables do not settle it, the
   OSMF Collective Database Guideline asks for "entirely OSM or entirely non-OSM" per data type and region and for datasets that do not
   reference each other (4A), and we alter what we take.
2. Where "substantial" falls for a few hundred venues from a city of millions of features, and how repeated refreshes count.
3. Whether a publicly readable table and an API serving it is "publicly using" the database in the licence's sense, as against only
   publicly using a Produced Work.
4. What the notice must say, and where it must appear, in a mobile or web app. The OSMF's own guideline is a draft.
5. Whether tag-level facts (`wheelchair`, `toilets`, `opening_hours`) are better presented as OSM's statement with a date than as ours.
6. Future relicensing risk of combining OGL data with ODbL data, flagged on the OSM wiki.
7. The UK database right as it applies alongside the licence.
8. Whether an alias from a Google-derived id to an OSM-derived one, kept for saved plans, is a reference between the datasets in the
   guideline's sense, and where it may live.
9. Whether serving Google rows and OSM entries side by side for a few weeks, while a category is switched over, is acceptable.
10. Whether a position taken from OSM for a venue we first found through Google is the venue's independent position, or still a
    Google-seeded match (we use only OSM's name, position and website; no Google value is copied).

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
