# Pack C: AI-assisted source verification (awaiting founder approval)

**Classification: AI-assisted source verification, awaiting founder approval. NOT independent human-reviewed evidence. NOT a passed Pack C control check.**

Pack C was reviewed twice by the founder through the hidden-control interface: round 1 caught 1 of 4 planted errors, round 2 caught 0 of 4 (bar 3). Neither round counts as validated evidence, and the founder has said so. This record replaces them. Each of the nine claims was re-examined against the stored official-page text by an AI model (Claude), not by a person.

Standards applied to every claim: (1) say exactly what the source establishes; (2) remove wording or inference the source does not support; (3) confirm the source is the venue's own site, read recently, and relevant to the field; (4) mark unsupported or ambiguous information Unknown; (5) keep the exact source and reasoning here and in the chained audit file `audit-packC-ai.jsonl`.

Reading date for every source: 2026-10-08 (verification date 2026-10-09, so one day old). Every quotation was found in the stored page text and, where the page is held, the stored text matches the recorded SHA-256 prefix.

Nine claims and two companion decisions (the companions replace two general-toilet inferences with the accessible-toilet facts the sources do state).

## 1. London Zoo `toilets.toilets`

- **Decision:** UNKNOWN (AI-assisted, awaiting founder approval)
- **Original proposal:** Accessible toilets around the zoo: opposite Tiny Giants, next to the Reptile House, near the main entrance next to the African Aviary, and at The Terrace Restaurant.
- **Published wording:** none (Unknown)
- **What the source establishes:** London Zoo has a Changing Places toilet (Animal Adventure) and accessible toilets at four named locations.
- **What it does not establish:** That the zoo has ordinary (non-accessible) toilets. The page is an accessibility page and describes only accessible provision; the earlier profile recorded this as "Derived: accessible toilets are toilets".
- **Removed:** The inference accessible toilets => toilets in general
- **Source:** https://www.londonzoo.org/plan-your-visit/accessibility (read 2026-10-08; page sha256 prefix `c827fbfab53284aa`; quotation checked against stored page text; venue's own domain: yes)
- **Exact quotation:** “we also have a number of accessible toilets around the zoo. These are located: Opposite Tiny Giants Next to the Reptile House Near main entrance next to African Aviary The Terrace Restaurant”
- **Expiry:** not published
- **Outcome:** General toilets are Unknown. The supported accessible-toilet fact is decided separately (companion decision below).

## 2. London Zoo `toilets.accessibleToilet` (companion decision)

- **Decision:** APPROVE (AI-assisted, awaiting founder approval)
- **Original proposal:** The zoo has a Changing Places toilet and a number of accessible toilets around the Zoo.
- **Published wording:** Accessible toilets around the zoo: opposite Tiny Giants, next to the Reptile House, near the main entrance next to the African Aviary, and at The Terrace Restaurant. A Changing Places toilet is at Animal Adventure. (`accessibility.accessibleToilet = yes`)
- **What the source establishes:** Accessible toilets at four named locations, plus a Changing Places toilet at Animal Adventure.
- **What it does not establish:** General toilets; baby-changing tables (the profile already records baby changing as Unknown).
- **Removed:** nothing
- **Source:** https://www.londonzoo.org/plan-your-visit/accessibility (read 2026-10-08; page sha256 prefix `c827fbfab53284aa`; quotation checked against stored page text; venue's own domain: yes)
- **Exact quotation:** “As well as our changing place toilet, we also have a number of accessible toilets around the Zoo.”
- **Expiry:** facility claim, 30 days from the reading, to 2026-11-07
- **Outcome:** Published as accessibility.accessibleToilet = yes. Replaces the general-toilets claim above.

## 3. Science Museum `activities.the-garden`

- **Decision:** EDIT (AI-assisted, awaiting founder approval)
- **Original proposal:** The Garden is a hands-on play gallery for 3 to 6 year olds.
- **Published wording:** The Garden: play-based science in four interactive areas (construction, water, light and sound), recommended for 3 to 6 (activity, ages 36 to under 84 months)
- **What the source establishes:** The museum names The Garden (level -1) as a family favourite and "a must-visit for 3-6-year-olds", and describes it as science through play in four interactive areas: construction, water, light and sound. A second official page (school groups) gives the same age range, 3-6.
- **What it does not establish:** That it is a "gallery" in the museum's words on this page, or "hands-on" (the phrase appears only on the separate school-groups page, for the group product). That it is for 3-6 only: the page recommends it for that age, it does not exclude others.
- **Removed:** "hands-on"; "play gallery"
- **Source:** https://www.sciencemuseum.org.uk/visit/young-explorers-guide-science-museum (read 2026-10-08; page sha256 prefix `519ad9faf34b5181`; quotation checked against stored page text; venue's own domain: yes)
- **Exact quotation:** “check out one of our family favourites and a must-visit for 3–6-year-olds, The Garden”
- **Expiry:** activity evidence, 90 days from the reading, to 2027-01-06
- **Outcome:** Edited to the page's own description. Counts as a permanent provision for ages 3 to 6 (months 36 to under 84).

## 4. London Zoo `activities.zootown`

- **Decision:** EDIT (AI-assisted, awaiting founder approval)
- **Original proposal:** ZooTown is an indoor role-play adventure aimed at children aged up to 8; tickets must be booked online in advance; Silver members and non-members pay £1 per child.
- **Published wording:** ZooTown: indoor role-play adventure, best suited to children up to 8 (activity, ages 0 to under 108 months)
- **What the source establishes:** ZooTown is an indoor role-play adventure inside London Zoo, aimed at children up to 8; every child is welcome; babes in arms have a separate ticket category; a valid zoo admission ticket or membership is needed; sessions are 45 minutes and subject to availability.
- **What it does not establish:** That tickets must be booked in advance. The same FAQ contradicts itself: "ZooTown tickets must be purchased online in advance and is not available to buy in the zoo" (last online sales 9am on the day), yet elsewhere "There may be some availability on the day (bookable at the kiosk near the ZooTown entrance), but this cannot be guaranteed". The booking rule is therefore ambiguous and is left out. The £1 fee is a ticket price for non-members and Silver members; it is not an activity fact and has no field here, so it is not published.
- **Removed:** "tickets must be booked online in advance" (source contradicts itself); "Silver members and non-members pay £1 per child" (price, not activity evidence; not published)
- **Source:** https://www.londonzoo.org/plan-your-visit/frequently-asked-questions (read 2026-10-08; page sha256 prefix `2eb390649a853e57`; quotation checked against stored page text; venue's own domain: yes)
- **Exact quotation:** “ZooTown is a brand new indoor role play adventure for kids in the heart of London Zoo aimed at children aged up to 8. … Silver members and non-members pay £1 per child”
- **Expiry:** activity evidence, 90 days from the reading, to 2027-01-06
- **Outcome:** Edited. Booking requirement and session fee are Unknown. (An admission ticket or membership is also needed per the page; kept in the review notes, not the label.) Counts as a provision for ages 0 to 8 inclusive (months 0 to under 108): the FAQ asks "my child is aged over 8, can they attend?", which treats 8 as inside the stated range.

## 5. London Zoo `transport.parking`

- **Decision:** APPROVE (AI-assisted, awaiting founder approval)
- **Original proposal:** Zoo car park: £16 in term time, £17.50 at weekends and in bank or school holidays, paid on the day.
- **Published wording:** Zoo car park: £16 in term time, £17.50 at weekends and in bank or school holidays, paid on the day. (`familyFacilities.parking = yes`)
- **What the source establishes:** The zoo has a car park; £16 in term time, £17.50 on weekends and bank or school holidays, payable on the day. The same answer adds no height restrictions and that the zoo is outside the Congestion Charge zone.
- **What it does not establish:** Nothing beyond the sentence is claimed. The fee is time-sensitive, which is why the claim expires in 30 days.
- **Removed:** nothing
- **Source:** https://www.londonzoo.org/plan-your-visit/frequently-asked-questions (read 2026-10-08; page sha256 prefix `2eb390649a853e57`; quotation checked against stored page text; venue's own domain: yes)
- **Exact quotation:** “Parking is available in the Zoo’s car park at a cost of £16 in term time or £17.50 on weekends and bank or school holidays, payable on the day.”
- **Expiry:** facility claim, 30 days from the reading, to 2026-11-07
- **Outcome:** Published exactly as proposed (parking = yes; the fee wording stays in the evidence excerpt).

## 6. Discover Children's Story Centre `toilets.toilets`

- **Decision:** APPROVE (AI-assisted, awaiting founder approval)
- **Original proposal:** Toilets on all main floors.
- **Published wording:** Toilets on all main floors. (`familyFacilities.toilets = yes`)
- **What the source establishes:** "We have toilets with baby changing facilities on all of our main floors." (FAQ: Do you have baby changing facilities?) Also states wheelchair accessible toilets and no Changing Places toilet.
- **What it does not establish:** Baby changing is also stated but is a separate field and is not part of this decision.
- **Removed:** nothing
- **Source:** https://discover.org.uk/your-visit/faqs/ (read 2026-10-08; page sha256 prefix `7755ba53483f5d77`; quotation checked against stored page text; venue's own domain: yes)
- **Exact quotation:** “We have toilets with baby changing facilities on all of our main floors.”
- **Expiry:** facility claim, 30 days from the reading, to 2026-11-07
- **Outcome:** Published exactly as proposed.

## 7. Science Museum `transport.parking`

- **Decision:** APPROVE (AI-assisted, awaiting founder approval)
- **Original proposal:** No car parking at the museum and local parking is very limited; nearest pay and display is in Prince Consort Road and Queen's Gate.
- **Published wording:** No car parking at the museum and local parking is very limited; the nearest pay and display is in Prince Consort Road and Queen's Gate. (`familyFacilities.parking = no`)
- **What the source establishes:** "We do not have car parking facilities and local parking is very limited." The same page continues: no visitor parking in Exhibition Road; the nearest pay and display car parking is in Prince Consort Road and Queen's Gate; a small number of disabled bays on Exhibition Road for Blue Badge holders (already published separately as accessible parking).
- **What it does not establish:** Nothing beyond the sentence. LIMITATION: the page text itself is not held in the local corpus (the site blocks the crawler); the quotation and the surrounding words are verified from the recorded read of 2026-10-08 (page hash 751a89c00ea27a0f) kept with the review card, not from a fresh fetch.
- **Removed:** nothing
- **Source:** https://www.sciencemuseum.org.uk/visit/getting-here (read 2026-10-08; page sha256 prefix `751a89c00ea27a0f`; quotation checked against recorded page context on the review card (page text not held locally); venue's own domain: yes)
- **Exact quotation:** “We do not have car parking facilities and local parking is very limited.”
- **Expiry:** facility claim, 30 days from the reading, to 2026-11-07
- **Outcome:** Published with the road names included as in the source. Re-read by hand before it expires.

## 8. Horniman Museum and Gardens `transport.parking`

- **Decision:** APPROVE (AI-assisted, awaiting founder approval)
- **Original proposal:** No on-site parking except limited Blue Badge parking.
- **Published wording:** No on-site parking except limited Blue Badge parking. (`familyFacilities.parking = no`)
- **What the source establishes:** "We have no onsite parking, other than limited parking for Blue Badge holders."
- **What it does not establish:** Where the Blue Badge bays are or how many. A general-parking "no" is accurate for the general visitor; the Blue Badge exception is in the wording and the quotation but is not published as a separate accessible-parking claim (not in this batch).
- **Removed:** nothing
- **Source:** https://www.horniman.ac.uk/plan-your-visit/ (read 2026-10-08; page sha256 prefix `07c4f7f88813cd83`; quotation checked against stored page text; venue's own domain: yes)
- **Exact quotation:** “We have no onsite parking, other than limited parking for Blue Badge holders.”
- **Expiry:** facility claim, 30 days from the reading, to 2026-11-07
- **Outcome:** Published exactly as proposed.

## 9. Discover Children's Story Centre `transport.parking`

- **Decision:** EDIT (AI-assisted, awaiting founder approval)
- **Original proposal:** No parking on site; Stratford multi-storey car park is a 5 minute walk. Blue Badge bays nearby.
- **Published wording:** No parking on the Discover site. The closest car park is Stratford multi-storey, a 5 minute walk. Blue Badge holder bays are close to Discover, on Bridge Terrace off Bridge Road. (`familyFacilities.parking = no`)
- **What the source establishes:** "There is no parking available on the Discover site. The closest car parks are: Stratford multi-story car park. (5 min walk)." A later line on the same page: "There are blue badge holder bays in the immediate vicinity of Discover, on Bridge Terrace, off Bridge Road, which are clearly marked."
- **What it does not establish:** The first wording said "nearby" for the bays and omitted where they are. Edited to the page's own location. The page also lists Stratford Westfield Shopping Centre (10 min walk) as a further car park; not added.
- **Removed:** "nearby" (replaced by the page's location)
- **Source:** https://discover.org.uk/getting-here/ (read 2026-10-08; page sha256 prefix `9d230072cea688a5`; quotation checked against stored page text; venue's own domain: yes)
- **Exact quotation:** “There is no parking available on the Discover site. The closest car parks are: Stratford multi-story car park. (5 min walk).”
- **Expiry:** facility claim, 30 days from the reading, to 2026-11-07
- **Outcome:** Edited wording; the claim is parking = no.

## 10. Science Museum `toilets.toilets`

- **Decision:** UNKNOWN (AI-assisted, awaiting founder approval)
- **Original proposal:** Toilets on every level (the page describes the accessible ones).
- **Published wording:** none (Unknown)
- **What the source establishes:** "Accessible toilets are available on all levels of the museum." A Changing Places toilet is on level 0.
- **What it does not establish:** General toilets on every level. The proposal said "every" and generalised from accessible to all toilets; the profile itself noted "General toilet blocks are not described separately".
- **Removed:** "Toilets on every level" (accessible generalised to all)
- **Source:** https://www.sciencemuseum.org.uk/visit/accessibility (read 2026-10-08; page sha256 prefix `6f7f7ce4b8756f29`; quotation checked against stored page text; venue's own domain: yes)
- **Exact quotation:** “Accessible toilets are available on all levels of the museum.”
- **Expiry:** not published
- **Outcome:** General toilets are Unknown. The supported accessible-toilet fact is decided separately (companion decision).

## 11. Science Museum `toilets.accessibleToilet` (companion decision)

- **Decision:** EDIT (AI-assisted, awaiting founder approval)
- **Original proposal:** Accessible toilets on every level.
- **Published wording:** Accessible toilets are available on all levels of the museum. (`accessibility.accessibleToilet = yes`)
- **What the source establishes:** Accessible toilets on all levels.
- **What it does not establish:** General toilets. Baby changing is separately stated on the museum's visit guides ("throughout all floors") and is not part of this decision.
- **Removed:** "every" replaced by the source's "all levels"
- **Source:** https://www.sciencemuseum.org.uk/visit/accessibility (read 2026-10-08; page sha256 prefix `6f7f7ce4b8756f29`; quotation checked against stored page text; venue's own domain: yes)
- **Exact quotation:** “Accessible toilets are available on all levels of the museum.”
- **Expiry:** facility claim, 30 days from the reading, to 2026-11-07
- **Outcome:** Published as accessibility.accessibleToilet = yes. Replaces the general-toilets claim above.

## Does any claim genuinely need independent human verification?

No claim is blocked on it. Two points a person may want to glance at, neither of which holds back the batch:

- **Science Museum parking:** verified from the recorded read and its surrounding text, not a fresh fetch (the site blocks our crawler). A 10-second look at https://www.sciencemuseum.org.uk/visit/getting-here confirms it, and it must be re-read by hand before it expires on 7 Nov anyway.
- **London Zoo ZooTown booking:** left out because the zoo's FAQ contradicts itself; only the zoo can resolve that, so the booking rule stays Unknown.

