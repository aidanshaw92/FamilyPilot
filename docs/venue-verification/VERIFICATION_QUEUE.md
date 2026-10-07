# Launch venue verification queue

Status: working list for the first 30 venues around the testing area (Mill Hill, NW7). First written on 7 Oct 2026
from the evidence replay set; **rebuilt the same evening from production** after the deploy, the stored-evidence
re-reads (extractor v3, then v4) and the Google-free refetch of every launch venue that had no readable text. The
table and the queue below are the remaining unknowns as the production database holds them, not a prediction.
**No venue has been contacted.** Nothing here sends email, places a call or publishes anything.

London-wide discovery is unchanged. This list only decides where a person's time goes first.

## How the list was made

1. **Launch set.** The destinations in the stored catalogue nearest Mill Hill (51.615, −0.245): parks, farms, museums,
   zoos, play centres and attractions. Restaurants are excluded. The set runs nearest first, out to Watford, London
   Colney and Regent's Park.
2. **What the pipeline recovered.** Every launch venue's stored pages were re-read in production with the current
   extractor, and the twelve with no readable text were re-crawled with Google disabled. The launch set went from
   **11 to 33** served values out of 150 (30 venues × five core fields); the replay had predicted 31. Section 9 of
   [VENUE_EVIDENCE_RECOVERY.md](../VENUE_EVIDENCE_RECOVERY.md) has the figures. There is no "wait for the refetch"
   tier any more: the refetch has run, and what it could read is in the table.
3. **What still needs a person.** Each remaining gap is placed in exactly one tier, cheapest first:
   - **Browser check:** the venue publishes a page, but the crawler cannot read it. Reasons include a bot challenge,
     a JavaScript-only site or an unattributable shared page. A person opens the page in an ordinary browser and
     records what it says. This is still published information, with its URL and date. The crawler's access limits
     are not bypassed, and the page is read the way any visitor reads it.
   - **Contact:** the venue's own published pages, read in full, do not answer a question that matters to a family
     with a baby and a toddler. Contact is only recommended when the venue is near the top of the list, so it is shown
     often, and when the answer would change the decision.

The five core fields are: baby changing, toilets, café or food on site, parking, and buggy access. Age is handled
separately (see the end of this document).

## The 30 launch venues: what production serves after the pass

"Own text" is what the newest stored reading of each of the venue's pages looks like in production on the evening of
7 Oct 2026. Values are the served claims (active, inside `valid_until`, approved from official text). A dash means
unknown, and unknown is never shown as no.

| # | Venue | Own text | Baby changing | Toilets | Café | Parking | Buggy | Tier |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Belmont Children's Farm | 3 of 12 pages readable | – | – | yes | yes | – | **Contact** |
| 2 | RAF Museum London | yes | yes | yes | yes | yes | good | done |
| 3 | Sunny Hill Park | bot challenge, 10 of 10 pages, re-crawled today | – | – | – | – | – | **Browser check** (Barnet) |
| 4 | Victoria Park, Finchley | bot challenge, 10 of 10, re-crawled today | – | – | – | – | – | **Browser check** (Barnet) |
| 5 | Fryent Country Park | yes (Brent park-finder) | – | – | – | yes | – | **Contact** (Brent) |
| 6 | Jump In Elstree | blocked, 14 of 14, re-crawled today | – | – | – | – | – | **Browser check** |
| 7 | Flip Out Brent Cross | 2 of 14 readable | – | – | – | no | – | **Contact** |
| 8 | Byron Park (Harrow) | yes, silent | – | – | – | – | – | later |
| 9 | Gladstone Park | yes (Brent park-finder) | – | – | yes | yes | – | **Contact** (Brent) |
| 10 | Northwick Park | yes (Brent park-finder) | – | – | – | yes | – | **Contact** (Brent) |
| 11 | Golders Hill Park | yes | yes | yes | yes | Blue Badge bays only → – | – | **Contact** (City of London) |
| 12 | Golders Hill Park Zoo | yes, silent (last read 30 Sep) | – | – | – | – | – | covered by #11 |
| 13 | Oak Hill Park | bot challenge, 10 of 10, re-crawled today | – | – | – | – | – | **Browser check** (Barnet) |
| 14 | King Edward VII Park | yes, silent | – | – | – | – | – | **Contact** (Brent) |
| 15 | Highgate Wood | yes | – | yes | yes | no | – | **Contact** (City of London) |
| 16 | Headstone Manor & Museum | yes, 7 of 7 readable | – | – | yes | yes (free) | – | **Contact** |
| 17 | Burgh House | 14 script shells, re-read today | – | – | – | – | – | **Browser check**, then contact |
| 18 | Roundwood Park | yes (Brent park-finder, read today) | – | yes | yes | – | – | **Contact** (Brent) |
| 19 | Alexandra Park | blocked, 18 of 18, re-crawled today | – | – | – | – | – | **Browser check** |
| 20 | Hampstead Heath | yes | yes | yes | – | – | – | covered by #11 |
| 21 | Waterlow Park | yes, silent (4 pages) | – | – | – | – | – | later |
| 22 | Broomfield Park | blocked, 19 of 19, re-crawled today | – | – | – | – | – | **Browser check** (Enfield) |
| 23 | Trent Park | 1 shared page, 1 shell, 14 failed; re-read today | – | – | – | – | – | **Browser check** |
| 24 | Kentish Town City Farm | yes | – | yes | – | no | good | later |
| 25 | Primrose Hill | 8 readable pages, all filed under Regent's Park | – | – | – | – | – | **Browser check** (Royal Parks) |
| 26 | Babylon Park London | 1 of 18 readable, 17 blocked | – | – | – | no | – | **Browser check** |
| 27 | De Havilland Aircraft Museum | yes | – | yes | yes | yes (free) | – | later |
| 28 | London Zoo | blocked, 14 of 14, re-crawled today | – | – | – | – | – | **Browser check** |
| 29 | The Regent's Park | yes, silent (last read 26 Sep) | – | – | – | – | – | **Browser check** (Royal Parks) |
| 30 | Flip Out Watford | 2 of 16 readable | yes | – | – | – | good | later |

**33 of 150 values served.** 15 venues have at least one; 15 have none. Of those 15, nine are unreadable to the
crawler (seven bot-blocked, Burgh House's script shells, Trent Park's failed and shared pages), one publishes only a
page shared with another park (Primrose Hill), and five have readable text that says nothing the rules can publish
(Byron Park, Golders Hill Park Zoo, King Edward VII Park, Waterlow Park, The Regent's Park).

Golders Hill Park parking: its page says "eight bays in the park for Blue Badge holders only". That is withheld rather
than shown as general parking, and after the v4 rules it stays withheld. Babylon Park's parking quote is "There is no
dedicated parking at Babylon Park." Kentish Town City Farm's says there is no parking at the farm. Roundwood Park and
Broomfield Park were pointed at their councils' pages before the deploy: Brent's page was read today and gave
Roundwood its toilets and café; Enfield's directory returned a bot challenge on every page.

## The queue

The table is in priority order. Each row covers one phone call, email or browsing session, and some cover several
venues. Contact routes are only those already held: a phone number from the stored Google record, or the operator's
own website. None has been invented. A gap goes to **Contact** only when the venue's own pages were read in full
today and do not answer it; a venue whose pages the crawler could not read goes to **Browser check** first, because
the answer is probably already published.

| Priority | Who | Venues | Missing | Sources already checked (production, 7 Oct) | Why it matters | Public contact route |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | **Barnet Council parks pages** (browser check) | Sunny Hill Park, Victoria Park (Finchley), Oak Hill Park | All five | 30 pages on barnet.gov.uk across the three parks, re-requested today with Google disabled. Every one came back as an Imperva "Pardon our interruption" page, so none is counted as read. | Three of the five nearest venues to Mill Hill, and all three are unknown. A park with no known toilet is the first thing a parent with a baby asks about. | barnet.gov.uk/directories/parks/… (the venue's own page). No phone held. |
| 2 | **Belmont Children's Farm** (contact) | Belmont Children's Farm | Baby changing, toilets, buggy | 12 pages on belmontfarm.co.uk: 3 readable (café, soft play, car parks), 9 failed. Re-read today; nothing new. | The nearest destination of all, a farm with soft play. Café and parking are confirmed, but its own text says nothing about changing or toilets. | 020 7318 4421 (Google record) |
| 3 | **Brent Council parks** (contact) | Gladstone Park, Fryent Country Park, Northwick Park, King Edward VII Park, Roundwood Park | Toilets and baby changing at Gladstone, Fryent, Northwick and King Edward VII; baby changing and parking at Roundwood; buggy access at all five; café at Fryent, Northwick and King Edward VII | Brent park-finder page for each park (6 to 8 pages each, readable, re-read today). The facility lists gave the café and parking facts, and Roundwood's toilets, but say nothing about toilets at the other four. | Five nearby parks with one operator, so one conversation covers all five. Silence about toilets in a list is not a no, so they stay unknown. | 020 8937 1234 (Google record for Gladstone Park) |
| 4 | **Flip Out Brent Cross** (contact) | Flip Out Brent Cross | Baby changing, toilets, café or snacks, where buggies go, any published age range for under-fives' sessions | 14 pages on flipout.co.uk: 2 readable, 12 failed. The readable text confirms there is no on-site parking. | An indoor option for wet days, close to Mill Hill. Without changing or toilets confirmed, Family Fit can only list them as unknowns for a baby. | 020 8432 7163 (Google record) |
| 5 | **Jump In Elstree, Babylon Park, London Zoo, Alexandra Park, Broomfield Park** (browser check) | the five venues | All five; venue-recommended ages for Jump In and Babylon Park | Re-crawled today with Google disabled: gojumpin.com 14 blocked; babylonpark.com 17 of 18 blocked; londonzoo.org 14 blocked; alexandrapalace.com 18 blocked; Enfield's directory page for Broomfield 19 blocked. | All five publish visitor information that a browser can read. A person reading it is cheaper and more accurate than a call. | The venue's own website |
| 6 | **City of London, Hampstead Heath team** (contact) | Golders Hill Park, Golders Hill Park Zoo, Highgate Wood, Hampstead Heath | General parking at Golders Hill Park (only Blue Badge bays are published); buggy routes; baby changing at Highgate Wood; café and parking at Hampstead Heath | cityoflondon.gov.uk pages for each, read in part (`fetched_truncated`), with 1 or 2 blocked each. Re-read today. | These are well-evidenced already. One call would close the remaining questions for four venues. | 020 7332 3511 (Google record for Golders Hill Park) |
| 7 | **Headstone Manor & Museum** (contact) | Headstone Manor & Museum | Baby changing, toilets, buggy access inside the buildings | 7 pages on headstonemanor.org, all readable, re-read today. They cover the café, free car park and opening times. | Café and free parking are known, but the museum says nothing about changing. A buggy question matters for a historic building. | 020 8863 6720 (Google record) |
| 8 | **Royal Parks** (browser check) | The Regent's Park, Primrose Hill | All five, per park | royalparks.org.uk: the Regent's Park page (short, no facility statements, last read 26 Sep), and 8 Primrose Hill pages re-read today, all filed under Regent's Park so their facts cannot be attributed to Primrose Hill alone. | High-traffic parks. The facilities pages for each park are public. | The venue's own page on royalparks.org.uk |
| 9 | **Trent Park** (browser check) | Trent Park | All five | 16 pages: 1 readable but shared with the operator, 1 script shell, 14 failed. Re-read today. | A large country park with a café and car parks that its site describes; the crawler cannot reach the text. | The venue's own website |
| 10 | **Burgh House** (browser check, then contact) | Burgh House | All five | 14 pages on burghhouse.org.uk, re-read today. Every stored body is under 200 characters, so the content is loaded by script. | A museum with a café, near Hampstead Heath. Read it in a browser first, and call only if that is silent. | 020 7431 0144 (Google record) |

**Not queued yet:** Byron Park, Waterlow Park, Kentish Town City Farm, De Havilland Aircraft Museum and Flip Out
Watford. They are either further out, already have three or more facts, or have readable pages that are silent and an
operator that is unlikely to answer by email (Waterlow: Camden switchboard 020 7974 4444). Revisit after launch, using
the venues parents actually open.

**Nothing is waiting on a refetch.** Roundwood Park, Broomfield Park and Trent Park were all re-crawled today. Roundwood
is resolved as far as its council page goes; Broomfield and Trent Park moved to browser checks because their pages
cannot be read by the crawler.

## Venue-specific questions

Ask each venue only its own questions. Every question asks where the facility is, and when, so that a restriction is
recorded rather than lost.

**Belmont Children's Farm**
1. Is there a baby changing table, and where is it?
2. Are visitor toilets open throughout opening hours?
3. Can a pushchair get from the car parks around the farm and into the café and soft play, or are there steps?

**Brent Council (Gladstone, Fryent, Northwick, King Edward VII, Roundwood)**
1. Which of these parks have public toilets, and are any of them closed on some days or in winter? (Roundwood's are
   already published; the other four are unknown.)
2. Do any of those toilets have baby changing?
3. Is there a café or kiosk in Fryent Country Park, Northwick Park or King Edward VII Park?
4. Is there visitor parking at Roundwood Park?
5. Are the main paths to each park's playground suitable for a pushchair?

**Flip Out Brent Cross**
1. Is there baby changing, and are toilets inside the venue?
2. Do you publish an age range for any sessions for babies or under-fives?
3. Where can parents leave a pushchair, or can it come into the café area?
4. Is food or drink available on site?

**City of London, Hampstead Heath (Golders Hill Park, Golders Hill Park Zoo, Highgate Wood, Hampstead Heath)**
1. Is the Golders Hill Park car park only for Blue Badge holders, or is there general visitor parking nearby that you
   recommend?
2. Is there a step-free route from the park's entrances to the café, play area and zoo?
3. Do the toilets in Highgate Wood have baby changing?
4. Which Hampstead Heath entrances have a café and a car park nearby?

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
