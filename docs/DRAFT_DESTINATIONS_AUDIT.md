# The 63 draft destinations: why each has no published facts

2026-10-08. Read-only. The source is production (the stored readings and jobs, read on 8 October), re-run with the
extractor from #177. Nothing was published, fetched or sent to Google.

Row-by-row data: `docs/data/draft-destinations-2026-10-08.csv`.

## 1. What `ai_draft` means here

A venue is `ai_draft` when its latest evidence draft is waiting and **no claim was ever approved** for it.

None of the 63 holds an active claim, and none has an eligible, high-confidence fact waiting that auto-approval failed
to take. So **no venue is stuck in the publishing workflow**: in every case there was nothing to publish.

The status costs nothing extra today. A draft venue shows exactly what a venue with no facts shows.

**Draft venues are not published automatically, and this audit proposes nothing that would do so.** A draft venue
leaves draft only when a fact on its own pages passes the same rules as everywhere else.

## 2. Causes

| | Cause | Venues | Recoverable without Google? |
| --- | --- | ---: | --- |
| A | No website on record | 4 | No. A person must add a reviewed official site, or the venue leaves the catalogue |
| B | The website on record is a Historic England listing, not the venue | 5 | Yes, once a person adds the council or friends-group page as a reviewed official root |
| C | Every read is refused or fails | 26 | **Possibly, for many of them (§3)** |
| D | The pages read belong to another venue or organisation | 5 | Yes, for 3 now via #175 |
| E | Own pages read, but nearly empty (script-rendered or stubs) | 6 | No, from these pages; needs another page or a person |
| F | Own pages read; they state no family facility | 16 | No: the website doesn't say. The venue or a person must |
| G | A fact is on a stored page; recovered by the v6 rules | 1 | Yes (#177) |

**A: no website on record.**
- Platform 9¾, Streatham Vale Park, Kingston Museum.
- Troubadour Wembley Park Theatre, which is also catalogued as a *park*. That's a catalogue error to fix whatever
  happens.

**B: Historic England listing on record.** Clissold Park, Broomfield Park, Belair Park, Danson Park, Walpole Park.
Google's website field for each points to a listed-building entry, which describes the landscape, not visiting.

**C: every read refused or failed.**
- **Big destinations:** British Museum, Science Museum, Natural History Museum (one truncated page read), Kew, London
  Zoo, Imperial War Museum, Churchill War Rooms, Royal Academy, National Portrait Gallery, Postal Museum, Freud Museum,
  Moco.
- **Parks and others:** Alexandra Park, Alexandra Palace Ice Rink, Holland Park, Kensington Memorial Park, Southwark
  Park, Russell Square, Highbury Fields, Barnet's Victoria / Sunny Hill / Oak Hill parks, Crystal Palace Park Farm,
  St Katharine Docks, Paddington Recreation Ground, both AirHop parks.

**D: another venue's or organisation's pages.**
- Walthamstow Wetlands, Madame Tussauds and Tooting Commons: #175's identity fix makes their own pages eligible. 11 of
  #175's 17 reviewed facts are at these three.
- Horniman Butterfly House: its pages are the Horniman Museum's. Sharing facts needs a reviewed parent-venue link.
- Crossrail Place Roof Garden: Canary Wharf's pages, with nothing stated.

**E: nearly empty pages.** Burgh House (14 pages, 106 characters in all), Wimbledon Lawn Tennis Museum (4 pages, no
text), Trent Park, Boston Manor Park, Stonebridge Recreation Ground, The Regent's Park.

**F: pages state no facility.**
- Five Royal Parks: Hyde, Green, St James's, Greenwich, Bushy.
- Richmond Park, Hanwell Zoo, Sherlock Holmes Museum, Rowans Tenpin Bowl, Lane7 Camden, The Rookery, Clapham Common,
  Golders Hill Park Zoo, London Cable Car, Hyde Park Winter Wonderland, Natural History Museum.

Every sentence on these pages that mentions a facility was read. Each one is deliberately unknown under existing rules:

- "limited parking" (Hanwell Zoo);
- cafés "nearby" (Sherlock Holmes);
- "waterfront cafés" in a description (Hyde Park);
- step-free *stations* (Winter Wonderland).

The one arguable miss is the Natural History Museum's "the Central Cafe near Hintze Hall", in a sentence about a clock.

**G: recovered by v6.** Museum of the Home: "Step-free access is available to the Museum and to our galleries."

## 3. The finding that matters most: C may be a detector, not the websites

Most "refused" reads are stored as `blocked / cloudflare_challenge`: **399 rows across 39 venues, none with an HTTP
status or any text.**

The detector treats the substring `challenge-platform` as proof of a bot challenge. Cloudflare uses that path both for
its interstitial and for the detection script it injects into **ordinary, successfully served pages**. So a museum's
real homepage would be stored as blocked, and nothing stored could show the difference.

Some of these are certainly real:

- Barnet's parks serve Imperva's "Pardon Our Interruption" shell.
- Brockwell Park and Roundwood Park alternate between readable and blocked.

**But the twelve national and major museums have never had a single page read.** That is the pattern a false positive
would produce.

**I could not test it:** this environment cannot reach those sites.

**#181** narrows the detector and makes blocked reads keep their HTTP status. If the hypothesis is right, the next
refetch reads these sites. That's up to 26 of the most-visited destinations in London, going through the same rules as
everything else.

**It needs your go, because it changes what the scheduled refetch reads.** The first proof would be one
`refetch_official` (no Google) of three of them; the command is in `PRODUCTION_RECOVERY_PLAN.md`.

## 4. Realistic outlook without Google

| Route | Destinations that could gain a first fact | When |
| --- | ---: | --- |
| #177 (v6 rules) | 1 (Museum of the Home) | after merge, by `reextract` before 15 Oct or the scheduled refetch from 22 Oct |
| #175 (identity) | 3 (Walthamstow Wetlands, Madame Tussauds, Tooting Commons) | after merge and the approved rescope write |
| #181 (detector), if the hypothesis holds | up to 26, realistically fewer: some sites are truly protected, and some pages won't state facilities | after merge; first proof from 3 refetches |
| Reviewed official roots for B | up to 5 | a person picks each page; then a refetch |
| A, E, F | 0 from websites | needs the venue (the verification email in `docs/venue-verification/`), a licensed dataset, or a person's visit notes |

**About 26 of the 63 can't be helped from their websites at all** (A, E, F). The website says nothing, says it in
script, or isn't known. These need a different evidence source:

- the venues themselves;
- open datasets with facilities, such as council park facility registers;
- for Royal Parks, the Royal Parks' own facility pages, if they turn out to be separate, readable pages.

## 5. Not done, and why

- **Nothing was published or un-drafted.**
- **No site was fetched.** The hypothesis in §3 is untested for exactly that reason.
- **No catalogue entry was changed or removed**, not even Troubadour's category. That's a catalogue edit for you to
  approve.
