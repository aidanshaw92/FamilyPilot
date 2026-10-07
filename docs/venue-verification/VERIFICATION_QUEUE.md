# Launch venue verification queue

Status: working list for the first 30 venues around the testing area (Mill Hill, NW7). It was written on 7 Oct 2026 from
read-only production data and the evidence replay set. **No venue has been contacted.** Nothing here sends email,
places a call or publishes anything.

London-wide discovery is unchanged. This list only decides where a person's time goes first.

## How the list was made

1. **Launch set.** The destinations in the stored catalogue nearest Mill Hill (51.615, −0.245): parks, farms, museums,
   zoos, play centres and attractions. Restaurants are excluded. The set runs nearest first, out to Watford, London
   Colney and Regent's Park.
2. **What the pipeline can already recover.** Each venue's stored pages went through the extractor on this branch
   (`node familypilot/scripts/replay-evidence-corpus.cjs`). Once the branch is deployed and refetched, the launch set
   should go from **11 to 31** confirmed values out of 150 (30 venues × five core fields). See
   [VENUE_EVIDENCE_RECOVERY.md](../VENUE_EVIDENCE_RECOVERY.md).
3. **What still needs a person.** Each remaining gap is placed in exactly one tier, cheapest first:
   - **Refetch:** fixed in code. The next crawl should fill it, so do nothing yet.
   - **Browser check:** the venue publishes a page, but the crawler cannot read it. Reasons include a bot challenge,
     a JavaScript-only site or an unattributable shared page. A person opens the page in an ordinary browser and
     records what it says. This is still published information, with its URL and date. The crawler's access limits
     are not bypassed, and the page is read the way any visitor reads it.
   - **Contact:** the venue's own published pages, read in full, do not answer a question that matters to a family
     with a baby and a toddler. Contact is only recommended when the venue is near the top of the list, so it is shown
     often, and when the answer would change the decision.

The five core fields are: baby changing, toilets, café or food on site, parking, and buggy access. Age is handled
separately (see the end of this document).

## The 30 launch venues: what is known after this branch

"Own text" means at least one readable page from the venue's own site or operator page is stored. Values are what the
branch publishes from that text. A dash means unknown, and unknown is never shown as no.

| # | Venue | Own text | Baby changing | Toilets | Café | Parking | Buggy | Tier |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Belmont Children's Farm | yes | – | – | yes | yes | – | **Contact** |
| 2 | RAF Museum London | yes | yes | yes | yes | yes | good | done |
| 3 | Sunny Hill Park | bot challenge | – | – | – | – | – | **Browser check** (Barnet) |
| 4 | Victoria Park, Finchley | bot challenge | – | – | – | – | – | **Browser check** (Barnet) |
| 5 | Fryent Country Park | yes | – | – | – | yes | – | **Contact** (Brent) |
| 6 | Jump In Elstree | JS-only | – | – | – | – | – | **Browser check** |
| 7 | Flip Out Brent Cross | yes | – | – | – | no | – | **Contact** |
| 8 | Byron Park (Harrow) | yes, silent | – | – | – | – | – | later |
| 9 | Gladstone Park | yes | – | – | yes | yes | – | **Contact** (Brent) |
| 10 | Northwick Park | yes | – | – | – | yes | – | **Contact** (Brent) |
| 11 | Golders Hill Park | yes | yes | yes | yes | Blue Badge only → – | – | **Contact** (City of London) |
| 12 | Golders Hill Park Zoo | yes, silent | – | – | – | – | – | covered by #11 |
| 13 | Oak Hill Park | bot challenge | – | – | – | – | – | **Browser check** (Barnet) |
| 14 | King Edward VII Park | yes, silent | – | – | – | – | – | **Contact** (Brent) |
| 15 | Highgate Wood | yes | – | yes | yes | no | – | **Contact** (City of London) |
| 16 | Headstone Manor & Museum | yes | – | – | yes | yes (free) | – | **Contact** |
| 17 | Burgh House | hollow pages | – | – | – | – | – | **Browser check**, then contact |
| 18 | Roundwood Park | override added | – | – | – | – | – | **Refetch** |
| 19 | Alexandra Park | blocked | – | – | – | – | – | **Browser check** |
| 20 | Hampstead Heath | yes | yes | yes | – | – | – | covered by #11 |
| 21 | Waterlow Park | yes, silent | – | – | – | – | – | later |
| 22 | Broomfield Park | override added | – | – | – | – | – | **Refetch** |
| 23 | Trent Park | 2 short pages | – | – | – | – | – | **Refetch**, then browser check |
| 24 | Kentish Town City Farm | yes | – | yes | – | no | good | later |
| 25 | Primrose Hill | shared page | – | – | – | – | – | **Browser check** (Royal Parks) |
| 26 | Babylon Park London | 1 of 18 pages readable | – | – | – | no | – | **Browser check** |
| 27 | De Havilland Aircraft Museum | yes | – | yes | yes | yes (free) | – | later |
| 28 | London Zoo | blocked | – | – | – | – | – | **Browser check** |
| 29 | The Regent's Park | yes, silent | – | – | – | – | – | **Browser check** (Royal Parks) |
| 30 | Flip Out Watford | yes | yes | – | – | – | good | later |

Golders Hill Park parking: its page says "eight bays in the park for Blue Badge holders only". That is now withheld
instead of being shown as general parking. Babylon Park's parking quote is "There is no dedicated parking at Babylon
Park." Kentish Town City Farm's says there is no parking at the farm.

## The queue

The table is in priority order. Each row covers one phone call, email or browsing session, and some cover several
venues. Contact routes are only those already held: a phone number from the stored Google record, or the operator's
own website. None has been invented.

| Priority | Who | Venues | Missing | Sources already checked | Why it matters | Public contact route |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | **Barnet Council parks pages** (browser check) | Sunny Hill Park, Victoria Park (Finchley), Oak Hill Park | All five | 18 pages on barnet.gov.uk. Every one came back as an Imperva "Pardon our interruption" page, so none is counted as read. | Three of the five nearest venues to Mill Hill, and all three are unknown. A park with no known toilet is the first thing a parent with a baby asks about. | barnet.gov.uk/directories/parks/… (the venue's own page). No phone held. |
| 2 | **Belmont Children's Farm** (contact) | Belmont Children's Farm | Baby changing, toilets, buggy | 12 pages on belmontfarm.co.uk: 3 readable, 9 failed. The readable ones cover the café, soft play and car parks. | The nearest destination of all, a farm with soft play. Café and parking are now confirmed, but its own text says nothing about changing or toilets. | 020 7318 4421 (Google record) |
| 3 | **Brent Council parks** (contact) | Gladstone Park, Fryent Country Park, Northwick Park, King Edward VII Park, and Roundwood Park if the refetch is still silent | Toilets, baby changing, buggy access; café at Fryent, Northwick and King Edward VII | Brent park-finder page for each park (6–8 pages each, readable). They list facilities, but the lists do not mention toilets. | Five nearby parks with one operator, so one conversation covers all five. The facility lists are the source of the new café and parking facts. Silence about toilets in a list is not a no, so they stay unknown. | 020 8937 1234 (Google record for Gladstone Park) |
| 4 | **Flip Out Brent Cross** (contact) | Flip Out Brent Cross | Baby changing, toilets, café or snacks, where buggies go, any published age range for under-fives' sessions | 14 pages on flipout.co.uk: 2 readable, 12 failed. The readable text confirms there is no on-site parking. | An indoor option for wet days, close to Mill Hill. Without changing or toilets confirmed, Family Fit can only list them as unknowns for a baby. | 020 8432 7163 (Google record) |
| 5 | **Jump In Elstree, Babylon Park, London Zoo, Alexandra Park** (browser check) | the four venues | All five; venue-recommended ages for Jump In and Babylon Park | gojumpin.com: 10 pages fetched, but each is an empty JavaScript shell. babylonpark.com: 17 blocked. londonzoo.org: 5 blocked. alexandrapalace.com: 9 blocked. | All four publish visitor information that a browser can read. A person reading it is cheaper and more accurate than a call. | The venue's own website |
| 6 | **City of London, Hampstead Heath team** (contact) | Golders Hill Park, Golders Hill Park Zoo, Highgate Wood, Hampstead Heath | General parking at Golders Hill Park (only Blue Badge bays are published); buggy routes; baby changing at Highgate Wood | cityoflondon.gov.uk pages for each, read in part (`fetched_truncated`), with 1–2 blocked each. | These are well-evidenced already. One call would close the remaining questions for four venues. | 020 7332 3511 (Google record for Golders Hill Park) |
| 7 | **Headstone Manor & Museum** (contact) | Headstone Manor & Museum | Baby changing, toilets, buggy access inside the buildings | 7 pages on headstonemanor.org, all readable. They cover the café, free car park and opening times. | Café and free parking are known, but the museum says nothing about changing. A buggy question matters for a historic building. | 020 8863 6720 (Google record) |
| 8 | **Royal Parks** (browser check) | The Regent's Park, Primrose Hill | All five, per park | royalparks.org.uk: the Regent's Park page (930 characters, no facility statements), plus the Primrose Hill page. The Primrose Hill page is filed under Regent's Park, so its facts cannot be attributed to Primrose Hill alone. | High-traffic parks. The facilities pages for each park are public. | The venue's own page on royalparks.org.uk |
| 9 | **Burgh House** (browser check, then contact) | Burgh House | All five | 5 pages on burghhouse.org.uk. Every stored body is 15–34 characters, so the content is loaded by script. | A museum with a café, near Hampstead Heath. Read it in a browser first, and call only if that is silent. | 020 7431 0144 (Google record) |

**Not queued yet:** Byron Park, Waterlow Park, Kentish Town City Farm, De Havilland Aircraft Museum and Flip Out
Watford. They are either further out, already have three or more facts, or have readable pages that are silent and an
operator that is unlikely to answer by email (Waterlow: Camden switchboard 020 7974 4444). Revisit after launch, using
the venues parents actually open.

**Wait for the refetch:** Roundwood Park and Broomfield Park. Their Google "websites" are Historic England register
entries. This branch points them at their councils' park pages (Brent park-finder; Enfield directory 216446), and the
first crawl after deploy reads those. Trent Park also needs its refetch: speculative guesses were being built inside
`Welcome.html` and are fixed on this branch.

## Venue-specific questions

Ask each venue only its own questions. Every question asks where the facility is, and when, so that a restriction is
recorded rather than lost.

**Belmont Children's Farm**
1. Is there a baby changing table, and where is it?
2. Are visitor toilets open throughout opening hours?
3. Can a pushchair get from the car parks around the farm and into the café and soft play, or are there steps?

**Brent Council (Gladstone, Fryent, Northwick, King Edward VII, Roundwood)**
1. Which of these parks have public toilets, and are any of them closed on some days or in winter?
2. Do any of those toilets have baby changing?
3. Is there a café or kiosk in Fryent Country Park, Northwick Park or King Edward VII Park?
4. Are the main paths to each park's playground suitable for a pushchair?

**Flip Out Brent Cross**
1. Is there baby changing, and are toilets inside the venue?
2. Do you publish an age range for any sessions for babies or under-fives?
3. Where can parents leave a pushchair, or can it come into the café area?
4. Is food or drink available on site?

**City of London, Hampstead Heath (Golders Hill Park, Golders Hill Park Zoo, Highgate Wood)**
1. Is the Golders Hill Park car park only for Blue Badge holders, or is there general visitor parking nearby that you
   recommend?
2. Is there a step-free route from the park's entrances to the café, play area and zoo?
3. Do the toilets in Highgate Wood have baby changing?

**Headstone Manor & Museum**
1. Is there a baby changing table, and where?
2. Are the toilets in the museum or the café building?
3. Can pushchairs go into the museum buildings, or should they be left somewhere?

**Burgh House** (only if its website is silent when read in a browser)
1. Is there baby changing and are toilets available to café visitors?
2. Can a pushchair get into the café and garden, and into the museum rooms?

**Browser checks.** For each venue, read its visitor information, accessibility, facilities and FAQ pages. For every
field, record either the venue's exact words with the page URL or "not stated". "Not stated" stays unknown.

## Recording answers

- Use [answers-template.csv](answers-template.csv): one row per venue per field. Record the venue's exact words, any
  restriction (days, area, who may use it), the source and the date.
- For a browser check, `source_type` is `official_website` and `source_url_or_contact_role` is the page URL.
- For an email or call, `source_type` is `venue_staff`. Record the person's role, not their name, for example "visitor
  services, by email".
- The email is in [venue-email-template.md](venue-email-template.md).

**How answers reach the app (a decision is needed).** A browser-checked page can go into the existing evidence path as
it stands: add the page as the venue's source override in `server/enrichment/_lib/official-source-overrides.js`, and
the next crawl reads and quotes it under the normal approval rules. A venue's emailed or phoned answer has no source
type in the claims schema today. `venue_staff` would need a migration, and an expiry rule, before it can be published.
Until that is agreed, staff answers should be kept in the CSV and used to choose which pages to point the crawler at.
They should not be typed in as claims.

## Age

Age is not in the queue as a general question. Across the replay set's real pages there is one venue-recommended age:
SEA LIFE's "recommended age … 6 and over". Parks do not publish one, and an invented range would be worse than none.
Only ask a venue for an age where it runs age-limited sessions (Flip Out Brent Cross, if it runs sessions for under-fives;
Jump In and Babylon Park, from their own pages). Record the age exactly as the venue states it. A venue's recommended age is a different
fact from FamilyPilot's editorial view of who a place suits, and must stay separate.
