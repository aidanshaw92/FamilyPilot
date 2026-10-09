# Step 1: approval-ready (9 October)

Status: **not executed.** Read-only checks at 9 October 02:59 UTC: the 21 venues still hold exactly the 76 active claims the analysis used (same id fingerprint `882b02667bf8e90022b7c0150b8c2fae`), no job is open, and the function's own selection returns 17 for the command below. One unrelated venue (Headstone Manor) was refreshed by the normal scheduler at 00:17 UTC; none of the 21 was touched. No Google usage is recorded today.

**Deadline:** Museum of the Home stops being eligible at **10 October 00:36 UTC**. After that the command returns 16 and only that venue's wheelchair fact is lost.

## The Colne Valley question

The catalogue entry "Colne Valley Regional Park" is not the regional park. Its address is Denham Court Drive, UB9 5PG, and its pin is the visitor centre in Denham Country Park. Every claim it already serves (toilets, baby changing, playground, "parking charges apply year round") comes from the visitor-centre pages. The page behind the proposed "parking: yes" says "Sat Nav: UB9 5PG Parking There are two carparks run by Bucks County Council", the same postcode. So the fact is true of the place the app sends a family to.

What it is not is a statement about the rest of a very large park, and the app's name for the place says "Regional Park". The claim system cannot carry that scope, and I will not publish a parking "yes" under that name on the strength of one page. So **Colne Valley is taken out of the job, and only its wrong claim is withdrawn**:

- "Parking: no" (`eabed57d…`) rests on "Parking is not permitted on Denham Court Drive", a rule about one road. It is withdrawn, which returns parking to unknown. It also contradicts the claim already served at this place that parking is charged.
- Nothing is published in its place. Parking at Colne Valley stays unknown until a person approves a scoped statement, or the catalogue entry is renamed to the visitor centre.
- **Known limit:** the ordinary scheduled refresh (next slot 24 October) uses the same extractor and would publish "parking: yes" from that sentence automatically. Closing that for good needs either the rename or a scoping rule in the extractor. Neither is part of this approval; both are listed in the beta plan.

## Run A: the 17-venue job

Expected return **17**. A second call returns 0. No network, model or Google call is possible (`FINAL_GATE.md`).

```sql
select public.enqueue_reextract_jobs('official-source-rules-v6', 25, array[
  'fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY','fp-google-ChIJKUrjG7wcdkgRbfTuKDBgWXI','fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc',
  'fp-google-ChIJs_wmr0cWa0gRZpEqERRReXQ','fp-google-ChIJs_wmr0cWa0gRHr60qjwn1Mo','fp-google-ChIJ97pX3M0EdkgR8YFd4G1GZJ8',
  'fp-google-ChIJczuZfc0adkgRc8X-u3ZiHcE','fp-google-ChIJf9LtmOcddkgRRv6MezIdvSM','fp-google-ChIJc2nSALkEdkgRkuoJJBfzkUI',
  'fp-google-ChIJAVlhMIUCdkgRCJEgHVbITq4','fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI','fp-google-ChIJvS60MMEcdkgRSMlH5VxD51Y',
  'fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54','fp-google-ChIJN3hATcsSdkgRPscumUj6FqU','fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY',
  'fp-google-ChIJkf4NDG8ddkgRXEINXuEbip8','fp-google-ChIJzZtNX7UcdkgRzycysU2TrhM'
]);
```

## Run B: Colne Valley, withdraw only

Run once. Expected **UPDATE 1** twice. Running it again changes nothing.

```sql
-- Colne Valley: withdraw the wrong "no" only. Publishes nothing about parking. Run once, after the enqueue.
-- Expected: UPDATE 1, UPDATE 1.
begin;
update public.venue_claims
   set status = 'disputed', updated_at = now()
 where id = 'eabed57d-f4e9-45a7-a8b6-f2746451cb89' and status = 'active' and field_key = 'familyFacilities.parking';
update public.venue_family_metadata
   set family_facilities = family_facilities - 'parking', updated_at = now()
 where familypilot_place_id = 'fp-google-ChIJq-jJARlxdkgRNLTE490EqVU' and family_facilities ->> 'parking' = 'no';
commit;
```

## The four withdrawals (done by Run A)

| Venue, fact | Claim | The page's own words |
|---|---|---|
| Sydenham Hill Wood, accessible toilet: yes | `24a699e3-1e99-46ac-8f45-b50e8d4e536a` | "The **nearest** Changing Places Toilet can be found in **Dulwich Park**" |
| Queen Elizabeth Olympic Park, parking: yes | `37cf3fa6-7b0f-4905-b2e8-9b3dbd85cead` | "**Lee Valley VeloPark** Venue car parking is available… **for facility users**" |
| Queen Elizabeth Olympic Park, free parking: no | `be6f2b75-2265-4e2a-ae87-1e7021c5eb9b` | "The nearby **Olympic Park Avenue** has on-street pay and display spaces **and Blue Badge spaces**" |
| Whitechapel Gallery, free parking: no | `e7f221fa-9e6f-406e-8645-d7557cdc00a9` | "**Free parking for Blue Badge holders** is available at the top of Osborn Street" |

## Expected resulting claims

Active claims at the 21 venues: **87** (76 − 4 withdrawn − 1 Colne Valley + 16 added; one same-value re-quote at the London Eye nets to zero). The 16 additions, all from the venue's own pages read on 1 to 2 October, each valid for 30 days from its reading:

| Venue | Fact | The page's words (start) |
|---|---|---|
| Gunnersbury Park | wheelchair access: yes | Step-free access is available throughout the museum, with some ramps and slopes |
| Museum of the Home | wheelchair access: yes | There is step-free access to all our galleries. |
| Royal Air Force Museum London | wheelchair access: yes | We have step free access around our site and lifts to upper levels |
| Queen's House | wheelchair access: yes | All floors of the Queen's House have lift access. |
| National Maritime Museum | wheelchair access: yes | The building has accessible lifts to every floor. |
| Saatchi Gallery | wheelchair access: yes | All floors have lifts and there is level access between the galleries on each floor. |
| The Wallace Collection | wheelchair access: yes | Lift access is available to all floors. |
| William Morris Gallery | wheelchair access: yes | …an entrance with a ramp, accessible toilets and lift access to all floors. |
| London Eye | wheelchair access: yes | …a wheelchair-friendly attraction with full accessibility throughout. |
| Cutty Sark | toilets: yes | There are accessible cubicles in both the men's and the women's toilets. |
| Cutty Sark | café: yes | The main toilets are next to the cafe in the Dry Berth (indirect) |
| Mudchute Park and Farm | toilets: yes | Toilets, including a disabled toilet, are available in the courtyard |
| Hackney City Farm | toilets: yes | There is an accessible toilet and baby changing facilities in the cafe. |
| Hackney City Farm | café: yes | one outside near the cafe entrance and there are two inside the cafe (indirect) |
| Victoria and Albert Museum | café: yes | Main Café, Patisserie, Garden Café with opening times |
| Northala Fields | parking: yes | car parks are locked in accordance with park locking times |

Nine of the sixteen are wheelchair-access "yes" claims written by the automatic v6 rule you approved on 7 October ("a venue-wide lift or step-free statement"). They are positive statements, not restrictions. If you would rather have a person review those nine first, say so and I will drop those nine venues' additions into the review queue instead of this run; the four withdrawals and the other seven additions do not depend on them.

## Rollback

One transaction, tested on a local PostgreSQL seeded with the real 76 claim ids and a simulated run, including Run B: it returned 76 active claims with the same fingerprint and restored Colne Valley's served parking. Paste `rollback-2026-10-08.sql` as one run; it commits only if the count and fingerprint it prints are **76** and **`882b02667bf8e90022b7c0150b8c2fae`** (otherwise run `rollback;`). Its snapshot of the served rows was taken on 8 October and hash-checked against production; use it only if nothing else has edited these venues since the run.

## After the run

`post-run-checks.sql` (read-only): 17 jobs complete, 17 drafts, the five claims not active, 17 new rows (16 additions and the re-quote), **87** active, the three left-out venues unchanged, Colne Valley with no parking key, no `place_details` usage. I run it about 30 minutes after you tell me Run A is done, and report; I do not repair anything by hand.
