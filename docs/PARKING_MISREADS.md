# Two wrong parking facts, how they happened, and the fix

2026-10-08. Extractor change plus a replay over every stored page.

- No page was fetched, no Google request was made, and nothing was written to production.

## What parents are shown today, and what is true

| Venue | Served | The page actually says | Correct |
| --- | --- | --- | --- |
| Colne Valley Regional Park | **parking: none on site** | "Parking. There are two carparks run by Bucks County Council. Parking charges apply year round. **Parking is not permitted on Denham Court Drive.**" | parking: yes; free parking: no (already served, correct) |
| Queen Elizabeth Olympic Park | **parking: on site** | "There is no general parking at London Stadium ... **Lee Valley VeloPark Venue car parking is available for up to 3 hours for facility users** ... Any vehicles using the car parks without visiting a venue will be subject to the full charge of up to £49.50." | parking: unknown (only the venues' users may park) |
| Queen Elizabeth Olympic Park | free parking: no | "The **nearby** Olympic Park Avenue has **on-street** pay and display spaces" | unknown (a road's charge, not the park's) |
| Whitechapel Gallery | free parking: no (not displayed) | "Buckle Street **Multistorey** Car Park ... Free parking for Blue Badge holders..." | unknown (a public car park's charge) |

The last two were found while investigating the first two.

## How each became wrong

All four came from the automatic extractor (`source_evidence_auto_v2`, approved 1 October 2026), from the venues' own
pages. So identity worked; the extractor read the sentence wrongly.

1. **Colne Valley.**
   - The negative pattern `parking is not permitted` fired on a sentence about a named road.
   - The street-restriction guard knew yellow lines and parking zones, not "not permitted on <Road>".
   - The positive in the same paragraph was missed because "carparks" is written as one word and counted ("two
     carparks"), which no pattern accepted.
2. **Olympic Park, parking.** "Venue car parking is available" matched the general positive. Nothing recognised parking
   stated "for facility users" of a named sub-venue.
3. **Olympic Park and Whitechapel, free parking.** The off-site guard ("nearby", "multistorey") was applied to positives
   only, so somebody else's charge became the venue's "not free".

## The fix (extractor rules v5)

1. **Road-only prohibitions are not the venue's parking.** This covers "not permitted / not allowed / prohibited on
   <Named> Road|Drive|Street…", "in the surrounding streets" and "on-street".
   - A sentence that also speaks about the venue keeps its negative. Tate Modern: "There are no parking facilities at
     Tate Modern or in the surrounding streets". Kentish Town City Farm: "No parking directly outside the farm…".
   - A prohibition AT a place still counts. The Graffiti Tunnel: "car parking is not allowed at Leake Street Arches".
2. **Parking for others is not the venue's parking.** This covers parking "for facility / venue / club / hotel users",
   and parking for "members / residents / staff only".
3. **Off-site wording now also blocks a free-parking "no".** It does not block a parking "no", so Madame Tussauds keeps
   "There is no parking onsite but there are numerous car parks near".
4. **"There are two carparks"** (one word, counted) is the venue's own car park.

## Replay: old rules against new, every stored page (634 latest readings, venue's own pages only)

| Venue | Change |
| --- | --- |
| Colne Valley Regional Park | − parking no ("not permitted on Denham Court Drive"); + parking yes ("There are two carparks run by Bucks County Council") |
| Queen Elizabeth Olympic Park | − parking yes (VeloPark and Hockey Centre user parking); − free parking no (nearby on-street bays) |
| Whitechapel Gallery | − free parking no (public multistorey) |

Nothing else changes anywhere in the corpus. The replay suite's pinned coverage moves accordingly (parking 36 → 35,
free parking 15 → 13), with the reasons in the test.

**Tests:**
- `parking-misreads.test.ts` (15). It covers the stored sentences verbatim, plus the true negatives and positives that
  must not move (Tate Modern, Kentish Town City Farm, Madame Tussauds, the Graffiti Tunnel, Streatham Common, Chiltern).
- Full suite: 2,825 passed.
- Two first drafts of the rule broke Tate Modern's and Kentish Town's true "no". The existing tests caught both before
  this was committed.

## Correcting production (your approval; not run)

1. Merge this PR (rules v5).
2. Run `reextract` (stored pages, no network) for Colne Valley Regional Park, Queen Elizabeth Olympic Park and
   Whitechapel Gallery.
   - Reconciliation disputes the four wrong claims, because each page is a complete reading that no longer yields them.
   - The same run approves Colne Valley's "parking: yes", from the 1 October reading.
   - The 14-day window for that reading closes on 15 October. After that, a `refetch_official` read of the park's page
     (no Google) does the same.
3. Check that Colne Valley shows "Parking: On site" and the Olympic Park shows parking as not confirmed.

If the re-read cannot run in time, the three wrong claims can be withdrawn directly. Not run:

```sql
-- reviewed withdrawal of three misread claims (8 Oct 2026); keeps every row, changes status only
update venue_claims set status = 'disputed', updated_at = now()
where id in ('eabed57d-f4e9-45a7-a8b6-f2746451cb89',  -- Colne Valley parking=no
             '37cf3fa6-7b0f-4905-b2e8-9b3dbd85cead',  -- QEOP parking=yes
             'be6f2b75-2265-4e2a-ae87-1e7021c5eb9b')  -- QEOP freeParking=no
  and status = 'active';
```

The projection must then be rebuilt for those venues, which the re-read does as part of its run.
