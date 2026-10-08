# Bot-challenge detector: the bounded pilot against real official sites

2026-10-08. Run 37759015386 of `.github/workflows/detector-pilot.yml` on this branch (commit `4000af7`), from a GitHub
runner: **36 requests, one GET per listed URL**, the production fetcher's own User-Agent, 6-second timeout, 12-second
page budget and 512 KB cap, a 1.5-second pause between requests, no retry, no link-following, no Google request, no
database access. The JSON record is the run's `detector-pilot-result` artifact.

Every URL is one already stored for a catalogue venue whose latest reading is `blocked`. The question was whether the
site refuses us or whether the old rule, which read Cloudflare's injected detection script path (`challenge-platform`)
as a challenge on its own, refused the page for us.

## The answer

| | Pages | Venues covered |
| --- | ---: | --- |
| **Readable now; the OLD rule alone called them challenges (false positives)** | **12** | Science Museum, London Zoo, Natural History Museum (2), Alexandra Park and the Ice Rink, Freud Museum, Royal Academy, Russell Square (Camden), Tulleys Tulip Fields, Hertfordshire Zoo, Holland Park and Kensington Memorial Park (RBKC), St Katharine Docks |
| Readable now; neither rule objects (the stored block was a refusal at the time, from Vercel's address) | 8 | Imperial War Museum and Churchill War Rooms, Moco Museum, Lane7 Camden, Hampstead Heath (and the City's three other sites), Thorpe Park, Crystal Palace Park Farm, Babylon Park, Paradox Museum |
| **Refused: HTTP 403 with a real 16-character interstitial, both rules agree** | 7 | **The British Museum (2), Kew (2)**, Historic England (Belair, Broomfield, Clissold, Danson, Walpole), National Portrait Gallery, The Postal Museum, Willows Activity Farm |
| Refused: HTTP 200 shell with no page text, both rules agree | 2 | Crossrail Place Roof Garden (Canary Wharf), Barnet parks (Oak Hill, Sunny Hill, Victoria Park) |
| Refused: HTTP 403 challenge the new rule catches and the old one missed | 1 | Paddington Recreation Ground (Everyone Active) |
| Refused: plain HTTP 403, no page | 2 | Jump In Elstree, AirHop Enfield |
| Not found (HTTP 404): a guessed section URL, not a page the site has | 3 | Science Museum `/plan-your-visit`, London Zoo `/visit`, Southwark Park (council URL moved) |

**The new rule produced no false negative in this set:** every page it passed has between 1,790 and 12,790 characters
of visible text and a title, and every page it blocked is a 403 or an empty shell. It also produced no new false
positive: no readable page was marked blocked.

## What the priority four actually do

| Venue | What the site returned | Verdict |
| --- | --- | --- |
| Science Museum | 200, 4,605 characters of real homepage text; the old rule called it a challenge because the page loads Cloudflare's detection script | **Wrongly blocked for us since 26 September.** Readable with the new rule. Its `/plan-your-visit` guess is a 404; the real pages come from the homepage's links. |
| London Zoo | 200, 1,994 characters of homepage text | **Wrongly blocked.** Readable with the new rule. |
| Natural History Museum | 200, 5,260 (home) and 4,687 (`/visit.html`) characters; the visit page yields toilets and café at once | **Wrongly blocked.** Readable with the new rule. |
| The British Museum | 403 on `/` and `/visit`, 16 characters: a Cloudflare interstitial | **Genuinely refuses automated reads.** Not a detector problem. |
| Royal Botanic Gardens, Kew | 403 on `/` and `/visit`, 16 characters | **Genuinely refuses.** Not a detector problem. |

## Facts a single page already yields

On the 20 readable pages the v6 extractor found **18 high-confidence facts on 8 pages** without following a single
link: toilets and café at the NHM visit page; toilets, café and playground on Camden's parks page; toilets, café,
accessible toilet and playground on RBKC's Holland Park page; parking and playground at Hertfordshire Zoo; parking at
Thorpe Park; toilets at Crystal Palace Park Farm; "no parking" at Babylon Park. A crawl reads a venue's facilities,
access and family pages too, so this is a floor, not the yield.

One warning from the same run: Paradox Museum's page gave `wheelchairAccessible` as both yes and no. The publication
rule treats a conflict as unknown, so nothing would be served; it is listed here so no one reads the raw count as
publishable facts.

## How many of the blocked venues become readable

Of the 39 catalogue venues whose latest stored readings are `blocked` (32 of them still `ai_draft`):

- **22 venues** answered with a readable page from the runner (14 of them only because of the new rule; 8 whose
  earlier refusal did not recur);
- **14 venues** still refuse: the British Museum, Kew, the National Portrait Gallery, the Postal Museum, Willows,
  Paddington Rec, Jump In, AirHop, Crossrail Place, three Barnet parks, and the five Historic England-listed parks
  (whose correct source is their council page, not the register);
- **3 venues** need a corrected URL rather than a detector change (Southwark Park and the two 404 guesses).

Two things keep this from being read as a production forecast:

1. **The runner's address is not Vercel's.** Production crawls leave from Vercel's egress, and a site may challenge
   that address while answering a GitHub runner. The 12 false positives are a property of the rule, not the address,
   so they carry over; the 8 "no longer refused" pages may not.
2. **One page is not a crawl.** The pilot read the homepage (or one stored section page). Readability of the family,
   access and facilities pages follows the same rule but was not exercised here.

So the honest claim for this PR is: **the old rule has been refusing at least 14 venues' real pages on its own,
including three of the four the brief named**, and the new rule reads them while still refusing every real interstitial
in the set.

## What should happen next (no production write without approval)

1. Merge this PR and let it deploy.
2. Step 3 of `PRODUCTION_RECOVERY_PLAN.md`, with the list corrected by this pilot: a `refetch_official` read (no Google)
   of the Science Museum, London Zoo and the Natural History Museum first, then the other 11 wrongly blocked venues.
   The British Museum and Kew are left out: they refuse, and refetching them only records another refusal.
3. For the British Museum and Kew, a different permitted evidence source is needed (an official PDF visitor guide or
   accessibility guide served from another host, a structured data feed, or the operator's own answer). That is an
   evidence-sourcing task, not a fetching one, and nothing here should try to get round the refusal.
4. Southwark Park, Belair, Broomfield, Clissold, Danson and Walpole: their stored website is the wrong page (a moved
   council URL or the Historic England register). Their council pages are the fix, under the website-identity work.
