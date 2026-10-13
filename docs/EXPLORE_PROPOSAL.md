# Explore proposal: Nearby | Search all, categories, filters, one state

**Proposal for approval. Nothing is built.** Figma page "10 — Explore: Nearby, categories, filters (proposal)":
https://www.figma.com/design/LNpbdnuAWcfWf9spvB7jBz/?node-id=372-2. The catalogue facts behind it are in
`docs/EXPLORE_CATALOGUE_AUDIT.md`. The five-tab bar is unchanged; Explore is the second tab.

## The screen, top to bottom

1. **Explore** heading.
2. **Nearby | Search all** switch. Nearby (default) is the places within a distance of where you are looking; Search all is the
   whole catalogue (and, for a typed town or postcode, the existing live area search).
3. **Where you are looking**, with **Change**: home area (default), current location (asked only when tapped; the position stays on
   the phone, is used only to measure distance, and is never sent or stored), or a postcode or town through the free lookup the
   profile already uses. Denied permission falls back to the home area with a notice.
4. **Search**: venue names, and the categories' own words and synonyms (soft play, trampoline, playground, gallery, zoo, farm,
   aquarium) through the taxonomy. "soft play" turns the Soft play & trampolines chip on; "London Eye" lists the place by name.
5. **Activity categories** (chips, offered only with at least three places in hand): All · Parks & playgrounds · Museums &
   galleries · Farms & animals · Soft play & trampolines · Attractions & activities. Swimming and Classes are not offered: nothing
   is stored for them.
6. **Quick filters**: distance in miles (Within 1, 2, 5, 10, 20, any), Indoor, Outdoor, Open now, Free, **More**.
7. **More filters** (a sheet): distance, setting, suitable for your children, must-have facilities (buggy friendly, baby changing,
   parking, toilets, playground, café or food), price (only when enough places carry one), open now. Each says what it reads.
8. **Results**: count, then **List | Map** (the on-device map from Meet halfway: rough circle, numbered pins, no tiles). Every
   card: category, setting (confirmed or "usual for a …"), miles, "about N min drive (estimated)", Family Fit badge, listed facts.
9. **Hidden, counted**: places with a confirmed hard age conflict or a must-have confirmed missing are hidden by default with a
   count and a reason; **Show** reveals them as "Not recommended" with why. Unknown is never treated as unsuitable.

## How the three questions work together

Search text, category, every filter and the location are **one state**. Nearby | Search all changes the place set; List | Map
changes the drawing. Switching any of them never resets the others. A removed filter removes only itself (each active filter is a
chip with ×); Clear all clears all. Changing location keeps the category. So "an indoor museum suitable for a three-year-old
within five miles" is: Museums & galleries → Indoor → Within 5 miles (the suitable-for-children filter is on in More), no restart.

## What the data supports, and what it does not (from the audit)

- 168 places: parks 70, museums 42, attractions 12, farms 8, activities 7, soft play 6 (five are trampoline parks), zoos 6.
- Opening hours for 125; facilities listed for 72 (café 40, playground 35, toilets 35, baby changing 26, parking 21); environment
  confirmed for 9 and inferred from category for the rest; **age limits on record for 0**. The age filter therefore hides nothing
  today, and the proposal says so on the control rather than pretend.
- Coverage is north and central London; south, east and outside the M25 are thin. The empty state says the catalogue is the
  limit and offers Search all; it never says there is nothing there.
- A filter on a facility keeps only places where it is **listed**; the rest are counted as "not checked", never shown as lacking it.
- Overlaps to consolidate: Farms and Animals (every farm is in both) → Farms & animals. Activities (bowling, an ice rink, a theme
  park, the London Eye) → Attractions & activities. Misclassified rows (trampoline parks as soft play; a recreation ground as an
  activity; a tulip field as a farm; a wetland as an attraction; two Harry Potter entries) are editorial fixes in the enrichment
  tool, listed in the audit, not code.

## Journeys the implementation will prove (browser, fixture data)

A Soft play nearby · B Museums + Indoor + suitable → venue · C Farms + Parking + Baby changing → evidence-backed results and the
"not checked" count · D Parks within 5 miles → Map → select → venue · E named attraction → venue → Create a plan · F location
denied → home area or postcode → browsing continues · G restrictive filters → explanation → relax one filter without restarting.
Plus: state kept across Nearby/Search all/List/Map, hidden-with-count and Show, accessibility audit 320 to 430, larger text, no
request to Google (`googleCalls` 0), privacy test unchanged.

## Not in scope

No sixth tab. No new provider, API, migration or paid call. No live search from Nearby. No change to Family Fit scoring, Meet
halfway, Together or the plan. Live area search stays where it is, behind a typed town or postcode in Search all.

## Decisions needed

1. Category labels: approve the five above (Farms & animals, Attractions & activities, Soft play & trampolines, Parks &
   playgrounds, Museums & galleries), or keep today's.
2. Editorial reclassifications in the enrichment tool (listed in the audit): approve or leave.
3. Ship the age filter with its honest wording now (recommended) or wait for reviewed ages.
4. Default distance: Within 5 miles (recommended) or 2 miles.
5. Area outside the catalogue: say the limit and offer Search all (recommended), or also an explicit live-search button.

Size if the recommendations are taken: about 6 to 8 days including tests. Implementation starts only after approval, in its own
draft PR.
