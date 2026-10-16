# Tranche validation

234 of 234 entries pass every check (registry shape, source fidelity, Google independence, selector gates, hygiene, duplicates), after 3 removed by a person (below).

By source: wikidata 103, os-greenspace 131. By category: museum 58, attraction 31, zoo 5, farm 4, park 136.

Checked against: OS Open Greenspace extract (1311 parks); Wikidata extract (1438 items); 149 stored rows, for comparison only.

## 3 entries removed during validation

| Entry | Name | Category | Reason |
|---|---|---|---|
| fp-os-49e9c86c-6b89-a491-e063-8ccaa00a0ef3 | Royal Botanic Gardens | park | The same place as Royal Botanic Gardens, Kew (fp-wd-q18748726), which is kept; the OS polygon is dropped so Kew is listed once. |
| fp-wd-q1628509 | Royal Hospital Chelsea | museum | The Wikidata item is the institution (a home for veterans). Wikidata files it under museum, and the source does not say whether or when visitors may enter, so its classification as a family visit is not defensible. |
| fp-wd-q1464767 | Royal United Services Institute | museum | Royal United Services Institute is a research institution. Wikidata files it under museum, but the source gives no sign of a visit the app could describe. |

## 12 entries reclassified during validation

| Entry | Name | From | To | Reason |
|---|---|---|---|---|
| fp-wd-q186309 | Madame Tussauds | museum | attraction | Wikidata's only class is museum (a wax museum); the name has no museum or gallery wording, and the venue we hold was an attraction; kept as an attraction. |
| fp-wd-q564981 | Queen's House | attraction | museum | Wikidata lists Queen's House as a museum as well as a palace, and the venue we hold was a museum; nothing supports moving it, so it stays a museum. |
| fp-wd-q1067909 | Chartwell | museum | attraction | Wikidata's only class is museum, but the name has no museum or gallery wording and it is a historic house and estate; classed as an attraction, as the app does for a house. |
| fp-wd-q2464716 | Cliveden | museum | attraction | Wikidata's only class is museum, but the name has no museum or gallery wording and it is a historic house and estate; classed as an attraction. |
| fp-wd-q1753590 | Old Royal Naval College | museum | attraction | Wikidata's only class is museum, but the name has no museum or gallery wording and it is a historic site; classed as an attraction. |
| fp-wd-q5102117 | Chislehurst Caves | museum | attraction | Wikidata's only class is museum, but the name has no museum or gallery wording and it is a cave system; classed as an attraction. |
| fp-wd-q222881 | 2 Willow Road | museum | attraction | Wikidata's only class is museum, but the name has no museum or gallery wording and it is a house; classed as an attraction. |
| fp-wd-q1254903 | Ightham Mote | museum | attraction | Wikidata's only class is museum, but the name has no museum or gallery wording and it is a historic moated house; classed as an attraction. |
| fp-wd-q5298112 | Dorney Court | museum | attraction | Wikidata calls it a historic house museum; the name has no museum or gallery wording and it is a manor house; classed as an attraction. |
| fp-wd-q1099856 | Epping Ongar Railway | museum | attraction | Wikidata's only class is museum, but the name says a railway; a heritage railway is a day out, not a museum visit; classed as an attraction. |
| fp-wd-q2281943 | Henry Moore Foundation | museum | attraction | Wikidata lists it as an art museum, but the name is a foundation's, not a gallery's; classed as an attraction until its public programme is checked. |
| fp-wd-q6860889 | Milton's Cottage | museum | attraction | Wikidata's only class is museum, but the name has no museum or gallery wording and it is a cottage; classed as an attraction. |

## 5 accepted exceptions (a rule overruled, with the reason)

| Entry | Name | Rule | Reason |
|---|---|---|---|
| fp-wd-q270920 | Royal Academy of Arts | gate: the source class is held back by the selector (an arts or events venue that Wikidata files under museum); hygiene: the name says a club, school, cemetery or similar | Wikidata classes it as an art museum. 'Arts' and 'Academy' here are the name of the Royal Academy of Arts itself, not an arts centre or a school. |
| fp-wd-q180788 | National Gallery | batch: similar name (National Portrait Gallery) within 65 m of fp-wd-q238587 | A different gallery from the National Portrait Gallery, 65 m away. |
| fp-os-49e9c726-852c-a491-e063-8ccaa00a0ef3 | Crystal Palace Park | batch: similar name (Crystal Palace Park Farm) within 319 m of fp-wd-q139906047 | The park and the farm inside it are different venues, each with its own record. |
| fp-wd-q56856819 | Golders Hill Park Zoo | batch: similar name (Golders Hill Park) within 43 m of fp-os-49e9c766-d611-a491-e063-8ccaa00a0ef3 | A zoo inside Golders Hill Park: a different venue from the park, with its own record. |
| fp-wd-q4947974 | Boston Manor | batch: similar name (Boston Manor Park) within 346 m of fp-os-49e9c756-b660-a491-e063-8ccaa00a0ef3 | The house and the park around it are different visits, each with its own record. |

No entry failed a check.
