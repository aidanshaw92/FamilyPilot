const { cleanEvidenceSnippet, isInterrogativeSentence, decodeHtmlEntities } = require('./evidence-text-utils');
const { extractPushchairEvidence } = require('./pushchair-evidence');
const { extractEnvironmentEvidence } = require('./environment-evidence');
const { isEligibleScope } = require('./source-identity');
const { isBotChallengeText } = require('./html-text-extractor');

/**
 * The version of the rules in this file, recorded on every draft the rules produce (`venue_enrichment_drafts.model`).
 *
 * Bump it whenever a change here can alter what a stored page yields. That record is what lets stored evidence be
 * re-read after a deploy without crawling anything: `enqueue_reextract_jobs(version)` queues exactly the venues whose
 * newest draft was produced by an older version and whose stored pages are still inside the approval window. Before
 * this existed the improved rules of PR #159 reached one venue in two days, because nothing knew which venues they had
 * not yet been applied to (see docs/VENUE_EVIDENCE_RECOVERY.md).
 *
 *   v2  the rules as deployed up to 7 Oct 2026
 *   v3  entity decoding, multi-window reading, facility lists, parking and buggy wording, day restrictions, the
 *       navigation-chrome guard
 *   v4  parking stated "for disabled visitors" and "accessible car parking" headings are restricted parking, not
 *       general parking (Tate Modern, Tate Britain)
 *   v5  a road's rule ("Parking is not permitted on Denham Court Drive") is not the venue's parking; parking for another
 *       facility's users ("VeloPark Venue car parking ... for facility users") is not the venue's; on-street and nearby
 *       pay-and-display is not the venue's charge; "There are two carparks" is the venue's own car park (Colne Valley
 *       Regional Park and Queen Elizabeth Olympic Park, both serving a wrong parking fact until this version)
 *   v6  the extraction pilot of 8 Oct 2026: venue-wide step-free and lift statements, placed toilets ("the main toilets
 *       are next to the cafe"), a café with its own hours or as the place something is, a venue's own car parks being
 *       locked or counted; and "the nearest Changing Places toilet can be found in Dulwich Park" is not the venue's
 *       accessible toilet (Sydenham Hill Wood served one from it)
 */
const EXTRACTOR_VERSION = 'official-source-rules-v6';

/**
 * What makes a sentence say this venue has a playground.
 *
 * Named rather than inlined because `isSoftPlayOnlyPlayground` below re-tests exactly these against
 * the same sentence with the soft-play wording removed. Two copies of this list would drift, and a
 * drift would reopen the false positive quietly.
 */
/**
 * Parking that is somewhere else.
 *
 * `familyFacilities.parking = yes` means the venue has parking ON SITE, and that is not an
 * interpretation -- `match-explanations.formatTriStateReason` renders the value to parents as
 * "Parking confirmed **on site**". The nuance has its own home too: `parkingInfo` is a free-text
 * field whose own examples are "Small car park behind the building", "Street parking only" and "Free
 * parking on site". So the boolean is the strict claim and the prose carries the rest, exactly as
 * `soft_play` sits beside `playground` and `mixed` beside `outdoor`.
 *
 * The extractor accepted off-site parking as the venue's own. Measured in production on 2026-10-01,
 * four served claims say "confirmed on site" about somebody else's car park:
 *
 *   Flip Out Watford   parking=yes      "Parking is available at the Harlequin Shopping Centre car parks"
 *   Nando's            parking=yes      "Nearby ... free parking at Finchley Lido Leisure Centre and
 *                                        we're a one-minute walk away"
 *   Nando's            freeParking=yes  same sentence
 *   Whitechapel Gallery parking=yes     "Buckle Street Multistorey Car Park, Buckle Street, London"
 *
 * The defect was asymmetric, which is the interesting part: the extractor already reads a NEGATIVE
 * on-site statement correctly -- Flip Out Brent Cross is `parking = no` from "We do not have on-site
 * parking, however, there is a small retail park opposite" -- but accepted a positive off-site one.
 *
 * Two signal families, both taken from that corpus rather than imagined. Adjacency, because a venue
 * describing a walk to the car park is describing someone else's; and the named third-party facility
 * types that actually appear. Deliberately NOT a general "at <place name>" rule: "free parking at the
 * farm" and "parking at the visitor centre" are the venue's own, and no reliable signal separates a
 * venue's own named building from a neighbour's.
 */
const OFF_SITE_ADJACENCY = [
  /\bnear\s?by\b/i,
  // "The nearest car park is Britannia Parking on Upper Marsh" (Leake Street Arches); "the nearest public car parks
  // are at Drury Lane" (the Courtauld). The nearest car park is, by construction, not this venue's own.
  /\bnearest\b/i,
  /\bwalking\s+distance\b/i,
  /\bnearby\b/i,
  /\b\d+[\s-]?minutes?[\s'’]*\s*walk\b/i,
  /\bminutes?[\s'’]+\s*walk\b/i,
  /\bacross\s+the\s+road\b/i,
  /\bopposite\b/i,
  /\bin\s+the\s+local\s+area\b/i,
  /\ba\s+short\s+walk\b/i,
  /\bdown\s+the\s+road\b/i,
  /\baround\s+the\s+corner\b/i,
];

const OFF_SITE_FACILITY = [
  /\bshopping\s+cent(?:re|er)\b/i,
  // "Public car parking is available at Sloane Square Car Park, Cheltenham Terrace" (Saatchi Gallery): a public car
  // park, and a NAMED one, is somebody else's. A venue's own car park is "our car park" or "the car park".
  /\bpublic\s+car\s+park/i,
  /\bat\s+(?:[A-Z][\w'\u2019-]*\s+){1,4}Car\s+Park\b/,
  // Parking "available on Seagrave Road" is a public road's parking (the Design Museum, whose own page also says "The
  // museum does not have a car park"). A venue's own car park is reached FROM a road, it is not ON one.
  /\bavailable\s+(?:on|along)\s+(?:[A-Z][\w'\u2019-]*\s+){1,3}(?:Road|Street|Lane|Avenue|Way|Drive|Crescent|Square|Place|Hill)\b/,
  /\bleisure\s+cent(?:re|er)\b/i,
  /\bretail\s+park\b/i,
  /\bNCP\b/,
  /\bmulti[\s-]?stor(?:e)?y\b/i,
];

/**
 * Does this sentence put the parking somewhere other than here? Suppresses a positive only; a
 * negative on-site statement is decided before this is consulted and is unaffected.
 */
function hasOffSiteParking(sentence) {
  return (
    OFF_SITE_ADJACENCY.some((re) => re.test(sentence)) ||
    OFF_SITE_FACILITY.some((re) => re.test(sentence))
  );
}

/**
 * Parking for things that are not cars, in the forms venues' own pages write it.
 *
 * `familyFacilities.parking = yes` renders to a parent as "Parking confirmed on site", so it is a
 * claim about somewhere to leave a CAR. A buggy park is somewhere to leave a pushchair, and a bike
 * rack is somewhere to leave a bicycle; a family driving to either is no better off.
 *
 * Measured in production on 2026-10-01, three served claims rest on this wording alone:
 *
 *   Horniman Museum and Gardens  parking=yes  "Buggy parking is available in Gallery Square."
 *   Young V&A                    parking=yes  "Buggy park  Buggy parking is available in the Welcome
 *                                              Area near the main entrance."
 *   William Morris Gallery       parking=yes  "Cycling Bicycle parking is available at the Gallery."
 *
 * The qualifier and noun lists are corpus-derived rather than imagined. Occurrences across all stored
 * evidence: buggy park 85, buggy parking 38, bike parking 21, bicycle parking 13, bike racks 11,
 * cycle racks 9, cycle parking 6, buggy bay 5, buggy storage 3, pushchair storage 2, pram storage 2,
 * bicycle rack 2, cycle bays 1.
 *
 * Deliberately NOT included, because every one of them IS car parking and together they are the bulk
 * of the corpus: accessible parking (92), blue badge parking (73), priority parking (66), controlled
 * parking (44), resident parking (22), coach parking (18), permit parking. A guard that swept
 * "<word> parking" generally would delete more true facts than false ones.
 */
const NON_VEHICLE_PARKING_PHRASE =
  /\b(?:buggy|buggies|pram|prams|pushchair|pushchairs|stroller|strollers|bike|bikes|bicycle|bicycles|cycle|cycles)\s+(?:park(?:ing)?|bay|bays|storage|store|rack|racks|shelter)\b/gi;

/**
 * Is the only parking in this sentence for something other than a car?
 *
 * Takes the phrase OUT and re-tests the field's own availability patterns, exactly as
 * `isSoftPlayOnlyPlayground` does, rather than rejecting the whole sentence. Sites glue the two
 * together -- "Bicycle parking is available at the Gallery" sits one clause from a car park on more
 * than one page in the cohort -- and dropping a sentence that states both would cost a true fact.
 *
 * Suppresses a positive only. The `no` patterns are decided before the `yes` loop runs, so Kentish
 * Town City Farm's "No parking directly outside the farm ... Bicycle parking inside the farm" keeps
 * its correct `parking = no`, which a sentence-rejecting guard would have disturbed.
 */
function isNonVehicleParkingOnly(sentence, yesPatterns) {
  const withoutNonVehicle = String(sentence ?? '').replace(NON_VEHICLE_PARKING_PHRASE, ' ');
  return !(yesPatterns ?? []).some((re) => re.test(withoutNonVehicle));
}

/**
 * How a page says "arrive by bike", and how it says "arrive by car".
 *
 * Both lists are matched on the sentence AFTER `NON_VEHICLE_PARKING_PHRASE` has been taken out, which
 * is what makes the pair safe. "Free parking is available and there are cycle racks too" loses its
 * only cycling word to the mask and keeps its true `yes`; a sentence that still names a bike after
 * masking is naming it as the way the visitor travelled.
 *
 * Occurrences across every stored page on 2026-10-01. Cycling side: cycling 45, bike 35, cycle 35,
 * bicycle 22, bikes 12, bicycles 10, cyclists 5; `biking`, `cycles` and `cyclist` appear zero times
 * and are morphological completions rather than observed wording. Motor side: car 443, vehicle 141,
 * coach 115, bus 89, vehicles 55, drive 44, cars 35, buses 31, coaches 19, drivers 16, van 16,
 * driving 14, motorcycle 5, minibuses 3, motorists 2, driver 1. `parked` is left OFF it:
 * it is a parking word rather than a travel-mode one, and on the motor side it would spare
 * "Bikes can be parked by the gate and parking is available" for no reason.
 *
 * The two lists are deliberately asymmetric. A term on the cycling side can SUPPRESS a positive, so
 * that side stays close to the morphology actually seen. A term on the motor side only ever KEEPS a
 * positive, so that side is generous -- `bus` and `coach` are in it even though a bus is not the
 * family's car, because a sentence about motor transport in general is not one we want to call cycle
 * parking. Measured against the live corpus that generosity costs nothing: the rule still reaches
 * every false positive the phrase guard cannot see.
 */
const CYCLE_TRAVEL_TERM =
  /\b(?:bike|bikes|biking|bicycle|bicycles|cycle|cycles|cycling|cyclist|cyclists)\b/i;

const MOTOR_TRAVEL_TERM =
  /\b(?:car|cars|vehicle|vehicles|coach|coaches|minibus|minibuses|bus|buses|van|vans|lorry|lorries|motorbike|motorbikes|motorcycle|motorcycles|drive|drives|driving|driver|drivers|motorist|motorists)\b/i;

/**
 * Is the parking in this sentence the cycle parking a cyclist is being told about?
 *
 * The phrase guard above needs the two words next to each other. One page in the cohort never writes
 * them that way:
 *
 *   the Design Museum  parking=yes  "Using a bike is a fantastic way to travel to the museum safely
 *                                    where a number of parking spaces are provided."
 *
 * Nothing in "a number of parking spaces are provided" is wrong on its own -- it is `parking spaces
 * (are) provided`, a pattern that earns a `yes` on dozens of real car parks. What makes it false here
 * is the subject of the sentence, which is a bike and only a bike.
 *
 * So the rule is about travel mode, not about parking wording: a sentence that names a bike and names
 * no motor vehicle is describing somewhere to leave a bike. Measured over every stored page on
 * 2026-10-01, five distinct parking-positive sentences across three venues are in that shape, and
 * four of them the phrase guard or the interrogative filter already rejects. It changes exactly one
 * verdict, and no sentence in the corpus loses a car park to it.
 */
function isCycleTravelContext(sentence) {
  const masked = String(sentence ?? '').replace(NON_VEHICLE_PARKING_PHRASE, ' ');
  return CYCLE_TRAVEL_TERM.test(masked) && !MOTOR_TRAVEL_TERM.test(masked);
}

/**
 * Whose accessibility is this sentence about?
 *
 * `accessibility.wheelchairAccessible` is a claim about THE VENUE: a wheelchair user can visit it.
 * The field had no guard at all -- any sentence containing "wheelchair accessible" published `yes` --
 * so a sentence about one café, one toilet, or somebody else's bus route spoke for the whole place.
 * Measured on 2026-10-01, 5 of the 16 served claims were that:
 *
 *   The Wallace Collection   "All bus routes are wheelchair accessible."          <- about buses
 *   Rickmansworth Aquadrome  "There is a wheelchair accessible fishing swim
 *                             located on Batchworth Lake."                        <- one platform
 *   National Maritime Museum "All our cafés are wheelchair accessible and
 *                             welcome Guide Dogs ..."                             <- the cafés
 *   Victoria Park            "toilets have an accessible cubicle and both our
 *                             cafés are accessible for wheelchair users."         <- toilets, cafés
 *   Horniman                 "Toilets are located off Gallery Square downstairs,
 *                             and they are wheelchair accessible."                <- the toilets
 *
 * This is the same subject-of-the-statement problem as `hasOffSiteParking`, and it suppresses a
 * positive only, the same way. `patterns.no` is matched and returned BEFORE the `yes` loop this
 * guard sits in, so a legitimate venue-level `no` -- "Hyde Park Corner is not wheelchair
 * accessible" -- can never be suppressed here.
 *
 * The negative side has the same subject problem and is deliberately NOT fixed here. Sydenham Hill
 * Wood's page says "The station is not wheelchair accessible on either side", which publishes `no`
 * about a railway station. That costs no false fact: the same page also says its entrances are
 * accessible, the two values conflict, and reconciliation disputes both, so the field reads unknown.
 * Suppressing the station would publish the surviving positive instead -- and that positive is about
 * "the two entrances into Dulwich Wood", a neighbouring wood, which is the other-venue problem
 * rather than evidence about this one. Unknown is the correct answer here, so it is left alone.
 *
 * THE LIST IS CORPUS-DERIVED, AND WHAT IS LEFT OUT MATTERS MORE THAN WHAT IS IN. The stored corpus
 * holds 97 wheelchair-accessible spans across 27 venues. Every noun below is one of those spans'
 * actual subjects. Nouns are NOT added speculatively, for two reasons.
 *
 *   An unattested noun cannot be tested against anything real. A test for it can only restate the
 *   regex, and a test that restates the regex passes however wrong the regex is.
 *
 *   Worse, a noun that can name the venue ITSELF turns this guard into a false negative. The
 *   catalogue holds 14 restaurants and 3 cafés, and a café's own page says "our café is wheelchair
 *   accessible" about the very place the parent is reading about. So `restaurant` is absent, and
 *   `café` is matched only in the PLURAL -- which is how both real facility sentences put it ("All
 *   our cafés", "both our cafés"), and is not how a single café describes itself.
 *
 *   `entrance` is absent for that same reason, and it is the most common noun of all: 25 of the 97
 *   spans. "Our entrance is step-free and wheelchair accessible" is how the V&A, Young V&A and V&A
 *   East Storehouse each say that a wheelchair user can get in, and each serves a correct `yes`
 *   from it.
 *
 * `lift` is absent because the corpus never makes a lift the SUBJECT of the claim: it appears as the
 * means ("all are wheelchair accessible via separate standard lifts") or as a neighbouring fact
 * ("There is a lift in the House, and the rooms are wheelchair-accessible"). Neither sentence backs
 * a served claim: SEA LIFE's served `yes` comes from a different sentence on the same page ("our
 * aquarium is fully wheelchair accessible throughout"), and Hatfield Park's claim from the lift
 * sentence is DISPUTED, not served. So neither is evidence for a rule about lifts in either
 * direction.
 */
const WHEELCHAIR_NON_VENUE_SUBJECT =
  'toilets?|bathrooms?|caf(?:e|\u00e9)s|fishing\\s+swims?|bus(?:es)?|stations?';

const WHEELCHAIR_CLAIM = '(?:wheelchair[\\s-]accessible|accessible\\s+(?:for|to)\\s+wheelchair)';

/**
 * Both word orders, because the corpus uses both. The 70-character window on the subject-first shape
 * is not arbitrary: Horniman's sentence puts 52 characters and a pronoun between "Toilets" and the
 * verb that carries the claim ("Toilets are located off Gallery Square downstairs, and they are
 * wheelchair accessible"), and a tighter window misses it.
 */
const WHEELCHAIR_SUBJECT_FIRST = new RegExp(
  `\\b(?:${WHEELCHAIR_NON_VENUE_SUBJECT})\\b[^.!?]{0,70}\\b(?:is|are)\\b[^.!?]{0,20}${WHEELCHAIR_CLAIM}`,
  'i',
);

const WHEELCHAIR_CLAIM_FIRST = new RegExp(
  `\\bwheelchair[\\s-]accessible\\s+(?:${WHEELCHAIR_NON_VENUE_SUBJECT})\\b`,
  'i',
);

/**
 * There is deliberately NO "but this sentence sounds venue-level" escape hatch. An earlier draft had
 * one, and it was both useless and dangerous: useless because, once the noun list holds only
 * attested non-venue nouns, no sentence in the corpus needs rescuing (Headstone Manor's "The Great
 * Barn, Small Barn and Visitor Centre/The Moat Cafe are all wheelchair accessible" is spared by the
 * plural-only café pattern, and Frameless's and Flip Out's toilets come AFTER the claim, where no
 * subject can sit); dangerous because the escape hatch is what let a false positive through -- it
 * allowed `gallery`, and the Horniman's toilets are "located off Gallery Square".
 */

/** Is the thing described as wheelchair accessible something other than this venue? */
function isNonVenueWheelchairSubject(sentence) {
  const text = String(sentence ?? '');
  return WHEELCHAIR_SUBJECT_FIRST.test(text) || WHEELCHAIR_CLAIM_FIRST.test(text);
}

/**
 * Step-free or lift access stated for the WHOLE venue, the way venues' accessibility pages actually say it when they never
 * use the words "wheelchair accessible". Each is from the stored corpus (8 Oct 2026), and none of their venues served a
 * wheelchair fact:
 *
 *   Gunnersbury Park           "Step-free access is available throughout the museum, with some ramps and slopes"
 *   Museum of the Home         "Step-free access is available to the Museum and to our galleries."
 *   RAF Museum London          "We have step free access around our site and lifts to upper levels."
 *   Queen's House              "All floors of the Queen's House have lift access."
 *   National Maritime Museum   "The building has accessible lifts to every floor."
 *   William Morris Gallery     "...an entrance with a ramp, accessible toilets and lift access to all floors."
 *   Saatchi Gallery            "All floors have lifts and there is level access between the galleries on each floor."
 *   London Eye                 "...a wheelchair-friendly attraction with full accessibility throughout."
 *
 * Refused by `isNonVenueStepFree`: a station's or a bus's step-free access ("Hoxton Station has step-free access", "Our
 * nearest step-free station is Paddington"), one building or one room ("Both our community buildings offer step-free
 * access", "The toilets ... are step-free"), and picnic tables.
 */
const VENUE_STEP_FREE_PATTERNS = [
  /\bstep[\s-]free\s+access\s+(?:is\s+available\s+)?(?:throughout|to\s+all\b|around\s+(?:our|the)\s+site|to\s+the\s+(?:museum|gallery|galleries|building|house|venue)\b)/i,
  /\b(?:accessible\s+)?lifts?\s+(?:access\s+)?(?:is\s+available\s+)?to\s+(?:all|every|each)\s+(?:floors?|levels?)\b/i,
  /\ball\s+floors\b[^.!?]{0,40}\b(?:have|has)\s+(?:lifts?|lift\s+access)\b/i,
  /\blevel\s+access\s+(?:throughout|between\s+the\s+galleries|to\s+all)\b/i,
  /\bwheelchair[\s-]friendly\b[^.!?]{0,40}\bfull\s+accessibility\b/i,
];

function isNonVenueStepFree(sentence) {
  const text = String(sentence ?? '');
  return /\bnearest\b|\bstations?\b|\bbus(?:es)?\b|\btube\b|\boverground\b|\bcommunity\s+buildings?\b|\bpicnic\b/i.test(text)
    || /\b(?:toilets?|caf(?:e|\u00e9)s|rooms?|cubicles?)\b[^.!?]{0,60}\b(?:are|is)\s+step[\s-]free\b/i.test(text);
}

const PLAYGROUND_PATTERNS = [/playground/i, /play\s+area/i];

/**
 * Soft play, in the forms a venue's own page writes it. Used only to take the phrase OUT of a
 * sentence before the playground patterns are re-tested; it never publishes anything itself.
 *
 * The optional noun is listed explicitly rather than matched loosely, because the whole point is to
 * remove "soft play area" without also removing the second "play area" in "soft play area and a
 * large play area outside".
 */
const SOFT_PLAY_PHRASE =
  /\bsoft[\s-]?play(?:\s+(?:area|areas|zone|zones|centre|center|room|rooms|frame|structure|barn|village|session|sessions))?\b/gi;

/**
 * Is the only play facility in this sentence a soft play one?
 *
 * FamilyPilot has already decided that soft play and a playground are different things, in every
 * place the decision shows up: `FacilityType` carries both `playground` and `soft_play`,
 * `FacilityGrid` draws them as separate chips with separate labels, `format-category` names soft play
 * in its own right, `plan-categories` filters `soft_play` by venue category, and -- the one that
 * settles it -- `buildFacilityMissingCaution` matches a parent's must-haves by exact membership, so a
 * family who asked for a playground is NOT satisfied by soft play. The extractor was the only part of
 * the system that disagreed: `play\s+area` matched "our Soft Play area" and published
 * `playground = yes` at high confidence, which is served to parents.
 *
 * Measured in production on 2026-10-01: of 38 active, served `familyFacilities.playground` claims,
 * three have excerpts mentioning soft play, and exactly one -- Belmont Children's Farm, from
 * "...before visiting our Soft Play area." -- rests on soft-play wording alone. The other two are
 * Flip Out venues whose pages list a "Ninja Playground" by name alongside their soft play, so the
 * literal word is present and this guard leaves them untouched. Whether a trampoline park's indoor
 * "Ninja Playground" is a playground in FamilyPilot's sense is a narrower, separate question; it is
 * recorded rather than answered here, because widening a guess past the wording the product contract
 * actually settles is how the original false positive got in.
 */
function isSoftPlayOnlyPlayground(sentence) {
  const withoutSoftPlay = sentence.replace(SOFT_PLAY_PHRASE, ' ');
  return !PLAYGROUND_PATTERNS.some((re) => re.test(withoutSoftPlay));
}

/**
 * An indoor attraction that has the word "playground" in its NAME.
 *
 * `playground` means outdoor play equipment at the venue, which is why it sits beside `soft_play` as
 * a separate field rather than subsuming it. Three wordings defeat that, and all three are served in
 * production on 2026-10-01:
 *
 *   Babylon Park London      "rack up high scores in an epic arcade playground!"
 *   Flip Out Canary Wharf    "Ninja Playground, Soft Play, Ball Pits"
 *   Flip Out Watford         "Sportz Zone, Ninja Playground, Soft Play"
 *   London Museum Docklands  "Get hands-on in our interactive play area for under-8s"
 *
 * Babylon Park is an indoor amusement arcade and the phrase is a marketing metaphor; the Flip Out
 * "Ninja Playground" is a named attraction inside a trampoline park; Docklands' is a gallery exhibit.
 * A parent who filtered for a playground and was sent to any of them has been told something false.
 *
 * The list is exactly what the corpus attests, counted across every stored page: ninja playground 7,
 * interactive play area 2, arcade playground 1. `indoor play area`, `indoor playground`,
 * `virtual play`, `digital playground`, `sensory play area` and `ninja warrior` all appear ZERO times
 * and are left out rather than imagined.
 *
 * What it must NOT touch, and why the mask-and-retest shape matters: children's play(ground|area) 27,
 * nature play area 14, outdoor play area 5, adventure playground 2, natural play area 2. Those are
 * real playgrounds, several of them in the same sentence as other facilities, so the phrase is taken
 * OUT and the playground patterns re-tested -- exactly as `isSoftPlayOnlyPlayground` does -- rather
 * than the sentence being rejected.
 */
const INDOOR_ATTRACTION_PLAY_PHRASE =
  /\b(?:arcade|ninja)\s+playgrounds?\b|\binteractive\s+play\s+areas?\b/gi;

function isIndoorAttractionOnlyPlayground(sentence) {
  const withoutAttraction = String(sentence ?? '').replace(INDOOR_ATTRACTION_PLAY_PHRASE, ' ');
  return !PLAYGROUND_PATTERNS.some((re) => re.test(withoutAttraction));
}

/**
 * "baby-changing facilities" written with a hyphen, as the National Maritime Museum's page writes it: "Toilets,
 * baby-changing facilities and an accessible toilet are located near the Romney Road entrance". The plain
 * `baby\s+chang` patterns cannot see it.
 *
 * Deliberately narrower than the spaced form. A hyphenated token is also what a CSS class looks like
 * (".baby-changing { display: none }"), and flattened page markup has produced false facility claims that way
 * before, so the hyphenated form only counts when it (a) does not follow a class or id marker or another word
 * character and (b) is followed by a noun that makes it a facility in prose.
 */
const HYPHENATED_CHANGING =
  /(?<![.#\w-])(?:baby|nappy)-chang(?:e|ing)\s+(?:facilit|room|area|table|unit|station|provision)/i;

/**
 * The venue's OWN café, stated in the first person or by name, on the venue's own pages.
 *
 * The cohort audit of 5 Oct 2026 found 51 of 138 browsable venues whose own pages mention a café and only 5 with a
 * café claim. The misses were not vague mentions; they were plain statements the original patterns could not read:
 *
 *   Discover Children's Story Centre  "Take a break in our cafe and bookshop"
 *   De Havilland Aircraft Museum      "The museum cafe serves hot and cold drinks as well as a selection of sandwiches"
 *   Horniman Museum and Gardens       "Our Cafes and kiosks serve specialty coffee daily"
 *                                     "The Gardens Cafe is located next to the Kusuma Nature Play Area"
 *   Harry Potter Studio               "Visit the Dragon Roasted Café for coffee, pastries or sandwiches"
 *   William Morris Gallery            "Relax at Deeney's Cafe, located on the ground floor"
 *   Woodside Animal Farm              "the heated indoor soft play centre and cafe serving fresh sandwiches"
 *
 * What these have in common, and what the patterns therefore require, is that the café is the venue's own: "our",
 * "the museum/farm/park ... cafe", a proper-named café with a verb that places or opens it, or a "visit the <Name>
 * Café for" invitation. They stay conservative on purpose. A café that merely appears in the text still does not
 * count (Golders Hill's "Forget Me Not Memory Cafe", Winter Wonderland's "Serpentine Bar & Kitchen cafe"), and
 * `isOffSiteCafe` removes the sentences about somebody else's café even when they say "our" or "the cafe serves".
 *
 * The proper-name forms are case-SENSITIVE (no `i` flag): a capitalised name is what separates "The Gardens Cafe is
 * located next to the play area" from "the cafe is located near the station".
 */
const OWN_CAFE_PATTERNS = [
  // No trailing \b: "é" is not a word character, so a boundary after "Café" never matches.
  /\bour\s+(?:[\w'\u2019&-]+\s+){0,3}caf[e\u00e9]s?(?![A-Za-z])/i,
  /\bthe\s+(?:museum|gallery|farm|park|zoo|garden|gardens|centre|center|house|studio|site|venue)\s+caf[e\u00e9]s?\s+(?:serves?|offers?|sells?|is\s+open|has)\b/i,
  /\bThe\s+(?:[A-Z][\w'\u2019&-]+\s+){0,3}Caf[e\u00e9]\s+(?:is\s+open|opens\s+(?:at|from|daily)|is\s+(?:located|situated)\s+(?:on|in|at|within|next\s+to|beside|by)|serves|offers)\b/,
  /\b(?:[Vv]isit|[Tt]ry|[Ee]njoy|[Cc]heck\s+out|[Hh]ead\s+to)\s+the\s+(?:[A-Z][\w'\u2019&-]+\s+){1,3}Caf[e\u00e9]\s+for\b/,
  /\bcaf[e\u00e9]s?\s+(?:serving|serves|offering)\s+(?:fresh|hot|a\s+range|a\s+selection|sandwiches|coffee|cakes|lunch|snacks|drinks)/i,
  /\bCaf[e\u00e9],?\s+(?:which\s+is\s+)?(?:located|situated)\s+(?:on|in|at|within|next\s+to|beside)\b/,
];

/**
 * Sentences about a café that is not the venue's own, or not here: "our sister site", "the cafe nearby", "a
 * recommended café across the road". Applied to every café pattern, old and new.
 */
function isOffSiteCafe(sentence) {
  return /\b(?:nearby|near\s+the\s+(?:station|gates?|entrance\s+road)|across\s+the\s+(?:road|street)|down\s+the\s+(?:road|street)|round\s+the\s+corner|minutes?\s+(?:walk|away|from)|neighbouring|sister\s+(?:site|venue|museum|farm)|other\s+(?:sites?|venues?|locations?)|elsewhere|local\s+caf|find\s+(?:a\s+)?caf|recommend(?:ed)?\s+caf|in\s+the\s+(?:town|village|high\s+street))\b/i.test(sentence);
}

/**
 * The venue's OWN car park, described rather than announced.
 *
 * The parking patterns wanted the words "parking (is) available"; venues' own pages rarely use them. Read on 7 Oct
 * 2026 from the stored corpus, every one of these is a venue describing its own car park and none served a fact:
 *
 *   Belmont Children's Farm   "You can park in the top car park and walk down to reception"
 *   Chiltern Open Air Museum  "We have a large car park with dedicated disabled parking."
 *   Streatham Common          "There is a small car park at the top of Streatham Common South"
 *   Beckenham Place Park      "there is a 'park and pay' car park within Beckenham Place Park with 108 parking places"
 *   Northwick Park (Brent)    "Children's playground or play area Onsite car park Pavilion"
 *   Gladstone Park (Brent)    "A small surfaced car park, open from 6am to 9pm, is accessed from Dollis Hill Lane."
 *
 * Every sentence still passes the parking guards in `matchField`: off-site wording ("nearby", "nearest", a public or
 * named car park), buggy, bike and coach bays, cycling directions, and limited or Blue Badge-only parking.
 */
const OWN_CAR_PARK_PATTERNS = [
  /\byou\s+can\s+park\s+(?:in|at)\s+(?:the|our)\b[^.!?]{0,30}\bcar\s+park\b/i,
  /\b(?:we\s+have|there\s+is|there's)\s+(?:a|an|our)\s+(?:[\w'\u2018\u2019-]+\s+){0,4}car\s+park\b/i,
  // "There are two carparks run by Bucks County Council." (Colne Valley Regional Park's visitor centre page, under
  // "Parking"): the venue's own car parks, written as one word and counted.
  /\b(?:we\s+have|there\s+are)\s+(?:two|three|four|several|\d+)\s+(?:[\w'\u2018\u2019-]+\s+){0,2}car\s?parks\b/i,
  // v6: "car parks will be locked at 9pm" (Swanley Park), "car parks are locked in accordance with park locking times"
  // (Northala Fields), "parking: 2 car parks" (Northala Fields): the venue's own car parks, by their opening rules.
  /\bcar\s?parks?\s+(?:will\s+be|are|is)\s+locked\b/i,
  /\bparking:\s*\d+\s+car\s?parks?\b/i,
  /\bon[\s-]?site\s+car\s+park\b/i,
  // "a car park within Beckenham Place Park"; never "a car park within suitable walking distance" (SEA LIFE London).
  /\bcar\s+park\s+within\s+(?:the\s+(?:park|grounds|site|gardens|estate|farm)\b|[A-Z])/,
  /\bcar\s+park\b[^.!?]{0,40}\bis\s+accessed\s+(?:from|via)\b/i,
];

/**
 * A café with its own hours (v6). Judged on the WHOLE sentence, not just the statement around the match: "the Design
 * Museum Cafe & Design Kitchen 10:00 – 17:00 ... we are rebuilding our cafe and shop spaces on Level G" publishes hours
 * for a café being rebuilt, and the rebuild is further along the sentence than the usual negation window reaches.
 */
const CAFE_HOURS_PATTERN = /\bcaf[e\u00e9](?![A-Za-z])[^.!?]{0,60}?\b\d{1,2}[.:]\d{2}\s*(?:-|\u2013|to)\s*\d{1,2}[.:]\d{2}\b/i;

const FIELD_PATTERNS = [
  {
    field: 'toilets',
    yes: [
      /toilet(s)?\s+(are\s+)?available/i,
      /toilet\s+facilities/i,
      /restroom(s)?\s+available/i,
      /public\s+toilets/i,
      /toilets?\s+(can\s+be\s+)?found/i,
      /toilets?\s+(are\s+)?to\s+be\s+found/i,
      /toilets?\s+(are\s+)?(now\s+)?open/i,
      /toilets?\s+(are\s+)?located/i,
      /toilets?\s+(are\s+)?situated/i,
      /toilets?\s+(are\s+)?provided/i,
      // "Toilets, including disabled and baby changing facilities, are available on site" (Colne Valley).
      /\btoilets?\b[^.!?]{0,60}\bare\s+available\s+(?:on[\s-]?site|at\s+the\s+(?:venue|site|park|museum|farm))\b/i,
      // "There are three accessible toilets in the park" (Golders Hill), "There is an accessible toilet in the
      // museum" (Gunnersbury): the venue's own toilets, placed.
      /\b(?:there\s+(?:is|are)|we\s+have|you(?:'ll|\s+will)\s+find)\s+(?:an?\s+|\d+\s+|two\s+|three\s+|four\s+|several\s+)?(?:(?:accessible|disabled|public|baby|family|unisex)\s+)*toilets?\s+(?:in|at|near|by|beside|within|inside|next\s+to)\b/i,
      // The same placed statement with the placements the 7 Oct 2026 replay found: "There are toilets on the ground,
      // second and third floors" (V&A East Storehouse), "There are toilets to the rear of the Gardens Cafe" (Horniman),
      // "Toilets are located at: Chumleigh Gardens" is already covered above.
      /\b(?:there\s+(?:is|are)|we\s+have)\s+(?:an?\s+|\d+\s+|two\s+|three\s+|several\s+)?(?:(?:accessible|disabled|public|unisex)\s+)*toilets?\s+(?:on\s+(?:the|every|each|all)\b|to\s+the\s+(?:rear|side|left|right)\s+of\b|opposite\b|available\b)/i,
      // v6, placed: "The main toilets are next to the cafe in the Dry Berth" (Cutty Sark), "There are accessible cubicles
      // in both the men's and the women's toilets" (Cutty Sark), "Toilets, including a disabled toilet, are available in
      // the courtyard" (Mudchute), "Baby changing is available in the toilets by the Café" (Chiswick House). The
      // nearest-elsewhere guard below still refuses "the nearest public toilets are at the village hall".
      /\b(?:the\s+)?(?:main\s+|public\s+)?toilets\s+are\s+(?:next\s+to|beside|by|behind|opposite|inside|underneath)\s+the\b/i,
      /\bcubicles?\s+in\s+(?:both\s+)?the\s+(?:men|women|ladies|gents)/i,
      /\btoilets?\b[^.!?]{0,60}\bare\s+available\s+in\s+the\b/i,
      /\bin\s+the\s+toilets\s+(?:by|next\s+to|near|beside|in)\s+the\b/i,
      // "There is an accessible toilet and baby changing facilities in the cafe." (Hackney City Farm)
      /\b(?:there\s+(?:is|are)|we\s+have)\s+(?:an?\s+)?(?:accessible|disabled)\s+toilets?\s+and\b[^.!?]{0,40}\b(?:in|at)\s+the\b/i,
      // "There are two wheelchair accessible toilets in the Wood." (Highgate Wood)
      /\b(?:there\s+(?:is|are)|we\s+have)\s+(?:an?\s+|\d+\s+|two\s+|three\s+|several\s+)?wheelchair[\s-]accessible\s+toilets?\s+(?:in|at|near|by|on)\b/i,
    ],
    no: [
      /no\s+toilet/i,
      /no\s+public\s+toilets/i,
      /toilets?\s+(are\s+)?closed/i,
      /toilets?\s+currently\s+closed/i,
      /toilets?\s+unavailable/i,
      /toilets?\s+out\s+of\s+service/i,
      /closed\s+public\s+toilets/i,
    ],
  },
  {
    field: 'babyChanging',
    yes: [
      /baby\s+chang(e|ing)/i,
      /nappy\s+chang(e|ing)/i,
      /baby\s+chang(e|ing)\s+facilit/i,
      /changing\s+table\s+for\s+babies/i,
      HYPHENATED_CHANGING,
    ],
    no: [/no\s+baby\s+chang/i],
  },
  {
    field: 'freeParking',
    yes: [
      /free\s+parking/i,
      // "Free car parking (see above opening times)" (Rickmansworth Aquadrome), "The Museum Car Park is FREE".
      /free\s+car\s+parking/i,
      /parking\s+is\s+free/i,
      // "Parking is provided free of charge in our car park directly outside the Studio Tour" (Warner Bros.).
      /parking\s+(?:is\s+)?(?:provided\s+)?free\s+of\s+charge/i,
      /no\s+parking\s+(?:fee|charge)/i,
      /complimentary\s+parking/i,
    ],
    no: [
      /paid\s+parking/i,
      /pay\s+and\s+display/i,
      /parking\s+charges/i,
      /parking\s+fee/i,
    ],
  },
  {
    field: 'parking',
    yes: [
      /parking\s+(is\s+)?available/i,
      /(?:free\s+)?parking\s+(is\s+)?provided/i,
      /on.?site\s+parking/i,
      /free\s+parking/i,
      /(?:large\s+)?free\s+car\s+park/i,
      /free\s+car\s+parking/i,
      /car\s+park(?:ing)?\s+(is\s+)?available/i,
      /car\s+park\s+(is\s+)?(?:provided|on site|on-site)/i,
      /visitors?\s+car\s+park/i,
      /parking\s+spaces\s+(are\s+)?provided/i,
      /(?:cars|vehicles|minibuses|coaches)\s+(?:are\s+)?welcome\s+to\s+use\s+(?:our\s+)?(?:large\s+)?(?:free\s+)?car\s+park/i,
      ...OWN_CAR_PARK_PATTERNS,
    ],
    no: [
      /no\s+parking/i,
      /no\s+on.?site\s+parking/i,
      /parking\s+is\s+not\s+available/i,
      // Graffiti Tunnel 562d8a7f: "car parking is not allowed at Leake Street Arches." An explicit
      // negative is as useful to a parent as a positive, and was being missed.
      /(?:car\s+)?parking\s+is\s+not\s+(?:allowed|permitted)/i,
      /(?:do\s+not|don't|does\s+not|doesn't)\s+(?:have|offer|provide)\s+(?:any\s+)?(?:on.?site\s+)?parking/i,
      // "The museum does not have a car park" (Design Museum), "Highgate Wood doesn't have a car park."
      /(?:do\s+not|don't|does\s+not|doesn't)\s+have\s+(?:a|any|its\s+own|our\s+own)\s+(?:visitor\s+)?car\s+park/i,
      /\bno\s+(?:visitor\s+)?car\s+park(?:ing)?\s+(?:spaces\s+)?(?:on.?site|at\s+the\s+(?:venue|site|museum|farm|park|gallery))/i,
      /\bthere\s+are\s+no\s+(?:car\s+)?parking\s+facilities\b/i,
      // "There is no dedicated parking at Babylon Park." "There is no designated Storehouse parking." (V&A East)
      /\bno\s+(?:dedicated|designated|on.?site|visitor|customer)\s+(?:[A-Z][\w'\u2019]*\s+)?(?:car\s+)?parking\b/i,
    ],
  },
  {
    field: 'cafe',
    /**
     * The two added patterns come from real cohort rows that stated a cafe plainly and were missed:
     *
     *   Courtauld 470f50cc  "the Courtauld Cafe all-day restaurant and cafe is located on the ground
     *                        floor across from the gallery entrance"
     *   Mudchute  fbf5e649  "The cafe is dog friendly so they are allowed in the courtyard"
     *
     * Both are tied to the venue's own cafe. What they must NOT do is promote a cafe that merely
     * appears in the text: Golders Hill's row names a City of London "Forget Me Not Memory Cafe", and
     * Winter Wonderland's names "the Serpentine Bar & Kitchen cafe" as the provider of a bicycle rack.
     * Neither is followed by `is <something>`, so neither matches.
     *
     * "is closed" is excluded: a permanently closed cafe is not a facility to tell a parent about.
     */
    yes: [
      /caf[eé]\s+(on\s+site|available)/i,
      /coffee\s+shop/i,
      /refreshments?\s+available/i,
      /caf[eé]\s+is\s+(?:located|situated)\s+(?:on|in|at|within)\b/i,
      // Narrowed to the construction the corpus actually demonstrated. The first version was
      // `the café is <any word>`, which publishes cafe=yes for "The cafe is nearby", "The cafe is
      // across the road" and "The cafe is five minutes away" -- all plausible sentences on a venue's own
      // visitor page, all describing somebody else's café. Exactly the false positive this workstream
      // exists to avoid, and it was mine. Generalising waits for corpus evidence that earns it.
      /\bthe\s+caf[eé]\s+is\s+dog[\s-]friendly/i,
      ...OWN_CAFE_PATTERNS,
      // The venue's own café, introduced as one of its features: "The Aquadrome also offers ... an excellent cafe"
      // (Rickmansworth Aquadrome), "With its diverse woodland habitat, popular café with terrace, large playground"
      // (Highgate Wood). "its" and "offers" bind the café to the subject of the page; `isOffSiteCafe` still removes
      // "a café nearby".
      /\b(?:offers|boasts|features)\b[^.!?]{0,80}\b(?:a|an)\s+(?:[\w'\u2019-]+\s+){0,2}caf[e\u00e9]s?(?![A-Za-z])/i,
      /\bwith\s+its\b[^.!?]{0,60}\bcaf[e\u00e9]s?(?![A-Za-z])/i,
      // "A temporary pop-up shop and cafe are open on Level G" (the Design Museum, while its main café is rebuilt),
      // "Our cafe and bookshop is open to everyone" (Discover). Open now is the strongest statement a café can make;
      // a closure or a plan in the same statement still withholds it.
      /\bcaf[e\u00e9]s?\s+(?:is|are)\s+(?:now\s+)?open\b/i,
      // A venue that publishes its café's opening times has a café: "Café Opening Times Tuesday – Sunday, 10am – 4pm"
      // (Headstone Manor & Museum, whose Moat Café no other sentence states in a readable way).
      /\bcaf[e\u00e9]\s+opening\s+(?:times|hours)\b/i,
      // v6. A café with its own hours: "Main Café 10.00 to 17.00" (V&A), "Corner Cafe, Bar, Venue Opening times Sunday to
      // Monday 10.00-18.00" (Tate Modern). A day-only café ("every Saturday 9am to 2pm") is still refused by
      // `isDayRestricted`.
      CAFE_HOURS_PATTERN,
      // The café as the place something is: "toilets are next to the cafe", "baby changing ... in the cafe", "in the
      // toilets by the Café". Never "provided by the Serpentine Bar & Kitchen cafe": the article must touch the word.
      // Not a what3words location tag ("By the cafe ///noting.fortunate.dots"): a map pin in a list of toilets, where the
      // same page's "In the Park, you can find: a café" is the statement to show a reviewer.
      /\b(?:in|inside|next\s+to|beside|by)\s+the\s+caf[e\u00e9](?![A-Za-z])(?!\s*\/{3})/i,
    ],
    no: [/no\s+caf[eé]/i],
  },
  {
    field: 'wheelchairAccessible',
    yes: [/wheelchair\s+accessible/i, /accessible\s+(?:for|to)\s+wheelchair\s+users/i, ...VENUE_STEP_FREE_PATTERNS],
    no: [/not\s+wheelchair/i],
  },
  {
    field: 'accessibleToilet',
    yes: [/accessible\s+toilet/i, /disabled\s+toilet/i, /changing\s+places/i],
    no: [/no\s+accessible\s+toilet/i],
  },
  {
    field: 'playground',
    yes: PLAYGROUND_PATTERNS,
    no: [/no\s+playground/i],
  },
  {
    field: 'sensoryFriendlySessions',
    yes: [/sensory\s+friendly/i, /quiet\s+session/i, /relaxed\s+performance/i],
    no: [],
  },
];

function splitSentences(text) {
  return text
    .split(/(?:\n|\r|•|·|\u2022|(?<=[.!?])\s+)/)
    .map((s) => s.replace(/^[\s\-–—*]+/, '').trim())
    .filter((s) => s.length > 15);
}

/** Parking=yes requires explicit availability language — not address, location, or transport context alone. */
function hasExplicitParkingAvailability(sentence) {
  return (
    OWN_CAR_PARK_PATTERNS.some((re) => re.test(sentence)) ||
    /free\s+car\s+park(?:ing)?/i.test(sentence) ||
    /parking\s+(is\s+)?available/i.test(sentence) ||
    /(?:free\s+)?parking\s+(is\s+)?provided/i.test(sentence) ||
    /on.?site\s+parking/i.test(sentence) ||
    /free\s+parking/i.test(sentence) ||
    /(?:large\s+)?free\s+car\s+park/i.test(sentence) ||
    /car\s+park(?:ing)?\s+(is\s+)?available/i.test(sentence) ||
    /car\s+park\s+(is\s+)?(?:provided|on site|on-site)/i.test(sentence) ||
    /visitors?\s+car\s+park/i.test(sentence) ||
    /parking\s+spaces\s+(are\s+)?provided/i.test(sentence) ||
    /(?:cars|vehicles|minibuses|coaches)\s+(?:are\s+)?welcome\s+to\s+use\s+(?:our\s+)?(?:large\s+)?(?:free\s+)?car\s+park/i.test(
      sentence,
    )
  );
}

function isExplicitParkingStatement(sentence) {
  const lower = sentence.toLowerCase();

  if (!hasExplicitParkingAvailability(sentence)) {
    return false;
  }

  if (/parking\s+(information|charges|fees|rates|policy|restrictions|advice|tips|updates)/i.test(sentence)) {
    if (!/available|provided|free|welcome to use|on site|on-site/i.test(lower)) {
      return false;
    }
  }

  if (/pay\s+and\s+display|parking\s+meters|parking\s+charge/i.test(sentence)) {
    if (!/free\s+parking|parking\s+(is\s+)?available|no charge/i.test(lower)) {
      return false;
    }
  }

  if (/surrounding streets|nearby streets|local streets|off.?site|street parking|near the venue/i.test(sentence)) {
    if (!/on site|on-site|our car park|venue car park|site parking|welcome to use our/i.test(lower)) {
      return false;
    }
  }

  if (
    /\bparking\s+(?:is\s+)?(?:located|can\s+be\s+found)\b/i.test(sentence) &&
    !/\bon.?site\b|\bvisitors?\s+car\s+park\b|\bparking\s+(?:is\s+)?available\b|\bparking\s+(?:is\s+)?provided\b/i.test(
      lower,
    )
  ) {
    return false;
  }

  if (
    /\blocated\s+on\s+[A-Za-z0-9\s]+(?:way|road|street|lane|avenue|drive)\b/i.test(sentence) &&
    !hasExplicitParkingAvailability(sentence)
  ) {
    return false;
  }

  return true;
}

/** Closure/unavailability must win over bare "public toilets" substring matches. */
function hasToiletNegation(sentence) {
  return (
    /\bclosed\s+public\s+toilets\b/i.test(sentence) ||
    /\bpublic\s+toilets\s+(?:are\s+)?closed\b/i.test(sentence) ||
    /\bnow\s+closed\s+public\s+toilets\b/i.test(sentence) ||
    /\btoilets?\s+(?:are\s+)?closed\b/i.test(sentence) ||
    /\btoilets?\s+currently\s+closed\b/i.test(sentence) ||
    /\btoilets?\s+unavailable\b/i.test(sentence) ||
    /\btoilets?\s+out\s+of\s+service\b/i.test(sentence) ||
    /\bno\s+public\s+toilets\b/i.test(sentence)
  );
}

/** Generic cloakroom/changing-room wording is not baby changing. */
function isExplicitBabyChangingStatement(sentence) {
  return (
    HYPHENATED_CHANGING.test(sentence) ||
    /baby\s+chang(e|ing)/i.test(sentence) ||
    /nappy\s+chang(e|ing)/i.test(sentence) ||
    /baby\s+chang(e|ing)\s+facilit/i.test(sentence) ||
    /changing\s+table\s+for\s+babies/i.test(sentence)
  );
}

/** Explicit negation must win over substring matches like "on-site parking" in "do not have on-site parking". */
function hasParkingNegation(sentence) {
  return (
    /\b(?:do\s+not|don't|does\s+not|doesn't)\s+(?:have|offer|provide)\b[^.!?]{0,40}\b(?:any\s+)?(?:on.?site\s+)?parking\b/i.test(
      sentence,
    ) ||
    /\bno\s+on.?site\s+parking\b/i.test(sentence) ||
    /\bparking\s+is\s+not\s+available\b/i.test(sentence) ||
    /\b(?:without|lack\s+of)\s+on.?site\s+parking\b/i.test(sentence)
  );
}

function hasLimitedParking(sentence) {
  return /\blimited\s+(?:on.?site\s+)?parking\b|\bparking\s+(?:is\s+)?limited\b/i.test(sentence);
}

/**
 * Blue Badge and disabled parking, as a phrase to take OUT of a sentence before the general parking patterns are
 * re-tested. `hasRestrictedParking` used to drop the whole sentence, which is right for "eight bays in the park for Blue
 * Badge holders only" and wrong for Belmont Children's Farm, whose contact page says "You can park in the top car park
 * ... the third car park in the bottom of the valley where there is further parking spaces and disabled parking":
 * general parking, with disabled parking as well. Same mask-and-retest shape as the buggy and bike bays above.
 */
const RESTRICTED_PARKING_PHRASE =
  /\b(?:blue\s+badge|disabled|accessible)\s+(?:holders?\s+)?(?:parking|car\s+park(?:ing)?|bays?|spaces?|spots?)(?:\s+(?:bays?|spaces?))?\b|\b(?:parking\s+)?(?:spaces?|bays?|places?)\s+(?:are\s+)?(?:provided\s+|reserved\s+|available\s+|set\s+aside\s+)?for\s+(?:disabled|blue\s+badge|wheelchair)\s+(?:visitors|drivers|guests|customers|users|people|badge\s+holders|holders)?\b/gi;

/**
 * A restriction that governs the WHOLE statement rather than naming one kind of bay: "Eight parking spaces are provided
 * for Blue Badge holders only." Nothing in such a sentence is general parking, so it is never masked and retested.
 */
const RESTRICTION_QUALIFIER =
  /\b(?:for|to)\s+(?:blue\s+badge|disabled)\s+(?:badge\s+)?holders?\b|\b(?:blue\s+badge|disabled)\s+(?:badge\s+)?holders?\s+only\b|\bfor\s+(?:disabled|blue\s+badge)\s+(?:visitors|drivers|guests|customers|users|people)\b/i;

/**
 * A reserved SUBSET of general parking: "108 parking places including 6 places reserved for blue badge holders"
 * (Beckenham Place Park). The qualifier that follows governs the subset, not the statement, so the general parking
 * before it still counts.
 */
const SUBSET_LEAD = /\b(?:including|incl\.|of\s+which|with\s+\d+|plus\s+\d+|some\s+of\s+(?:which|them))\b[^.!?]{0,40}$/i;

function isOnlyRestrictedParking(sentence, yesPatterns) {
  const text = String(sentence ?? '');
  const qualifier = RESTRICTION_QUALIFIER.exec(text);
  if (qualifier && !SUBSET_LEAD.test(text.slice(0, qualifier.index))) return true;
  // General parking must LEAD. "You can park in the top car park ... and disabled parking" states general parking and
  // adds disabled bays; "Disabled parking is available within the main Visitor car park" is about disabled parking,
  // whatever car park it is in, and stays unknown (Hatfield Park, pinned in non-vehicle-parking.test.ts).
  RESTRICTED_PARKING_PHRASE.lastIndex = 0;
  const restricted = RESTRICTED_PARKING_PHRASE.exec(text);
  RESTRICTED_PARKING_PHRASE.lastIndex = 0;
  const masked = text.replace(RESTRICTED_PARKING_PHRASE, (m) => ' '.repeat(m.length));
  const general = (yesPatterns ?? [])
    .map((re) => re.exec(masked))
    .filter(Boolean)
    .map((m) => m.index);
  if (general.length === 0) return true;
  return restricted ? Math.min(...general) > restricted.index : false;
}

/**
 * "No parking" that is a street restriction, not a statement about the venue.
 *
 * Streatham Common served `parking = no` from "Double yellow lines mean no parking at any time" and "Streatham High
 * Street has no parking" -- the roads around the common -- while its own Friends' page says "There is a small car park
 * at the top of Streatham Common South". The Saatchi Gallery's page has "(No parking Mon-Sat 7am to 7pm ...) Royal
 * Hospital Road". A negative read off a road's parking rules is as wrong as a positive read off somebody else's car
 * park, so it leaves the field unknown instead.
 *
 * Colne Valley Regional Park served `parking = no` from "Parking is not permitted on Denham Court Drive" -- the road to
 * the visitor centre -- two sentences after "There are two carparks run by Bucks County Council". The road is named, so
 * a prohibition ON a named road (never AT a place: "car parking is not allowed at Leake Street Arches" is the Graffiti
 * Tunnel's own rule and stays a no) is the road's rule.
 */
const ROAD_ONLY_RESTRICTION =
  /\b(?:not\s+(?:permitted|allowed)|prohibited|forbidden)\s+(?:on|along|in)\s+(?:the\s+)?(?:[A-Z][\w'\u2019-]*\s+){1,3}(?:Road|Drive|Street|Lane|Avenue|Way|Close|Crescent|Terrace|Rise|Hill|Gardens|Grove|Place)\b|\b(?:on|along|in)\s+(?:the\s+)?(?:surrounding|nearby|local|residential|neighbouring)\s+(?:roads|streets)\b|\bon[\s-]street\b/;
/**
 * A sentence that ALSO speaks about the venue itself keeps its negative: "There are no parking facilities at Tate Modern
 * or in the surrounding streets" (Tate Modern) and "No parking directly outside the farm, restricted parking in
 * surrounding streets" (Kentish Town City Farm) are each the venue's own true "no", which the street wording alone would
 * drop.
 */
const VENUE_LEVEL_PARKING_NEGATIVE = /\bno\s+(?:car\s+)?parking(?:\s+facilities)?\s+(?:directly\s+)?(?:at\s+(?!any\b)|outside\s+the\b|on[\s-]?site\b|in\s+the\s+grounds\b)|\bno\s+on[\s-]?site\s+parking\b/i;

function isStreetParkingRestriction(sentence) {
  const text = String(sentence ?? '');
  return (ROAD_ONLY_RESTRICTION.test(text) && !VENUE_LEVEL_PARKING_NEGATIVE.test(text)) || /\b(?:double|single)\s+yellow\b|\byellow\s+lines?\b|\bcontrolled\s+parking\b|\bparking\s+(?:zones?|permits?|restrictions?)\b|\bCPZ\b|\bno\s+parking\s+(?:at\s+any\s+time|mon|tue|wed|thu|fri|sat|sun|between|\d)|\b(?:High\s+Street|Road|Street|Lane|Avenue)\s+has\s+no\s+parking\b|\bno\s+loading\b/i.test(text);
}

/**
 * Parking stated FOR disabled visitors rather than as disabled bays: "There are twelve parking spaces for disabled
 * visitors, accessed via Park Street" under the heading "Accessible car parking" (Tate Modern and Tate Britain, found in
 * the production re-read of 7 Oct 2026). The adjective-first patterns below never saw it, so Tate Britain published
 * general parking from it and Tate Modern's true "no parking facilities" was withdrawn as a conflict with it.
 */
const PARKING_FOR_DISABLED =
  /\b(?:parking\s+)?(?:spaces?|bays?|places?)\s+(?:are\s+)?(?:provided\s+|reserved\s+|available\s+|set\s+aside\s+)?for\s+(?:disabled|blue\s+badge|wheelchair)\b|\bfor\s+(?:disabled|blue\s+badge)\s+(?:visitors|drivers|guests|customers|users|people|badge\s+holders|holders)\b/i;

/**
 * Parking that belongs to another facility's users, not to the venue's visitors.
 *
 * Queen Elizabeth Olympic Park served `parking = yes` from "Lee Valley VeloPark Venue car parking is available for up to
 * 3 hours for facility users" -- a venue inside the park, whose car park charges up to £49.50 to anyone "using the car
 * parks without visiting a venue". The same page says "There is no general parking at London Stadium". Parking stated
 * for a facility's, club's or hotel's users, or for members, residents or staff only, says nothing about whether a
 * family visiting the park can park.
 */
function isParkingForOthers(sentence) {
  return /\bfor\s+(?:facility|venue|centre|center|club|gym|hotel|leisure\s+centre)\s+(?:users|members|guests|customers)\b|\b(?:residents?|members|staff|permit\s+holders|season\s+ticket\s+holders)\s+only\b|\bfor\s+(?:residents|staff|hotel\s+guests)\b/i.test(String(sentence ?? ''));
}

function hasRestrictedParking(sentence) {
  return (
    /\baccessible\s+(?:car\s+)?parking\b/i.test(sentence) ||
    PARKING_FOR_DISABLED.test(sentence) ||
    /\b(?:blue\s+badge|disabled)\s+(?:holder\s+)?parking\b/i.test(sentence) ||
    /\bparking\b[^.!?]{0,80}\b(?:blue\s+badge|disabled)\s+holders?\s+only\b/i.test(sentence) ||
    /\b(?:blue\s+badge|disabled)\s+holders?\s+only\b[^.!?]{0,80}\bparking\b/i.test(sentence)
  );
}

/**
 * Is this "free parking" wording an entitlement that only some visitors, or only some times, get?
 *
 * A parent-facing "Free parking" badge is a promise to a family arriving by car on an ordinary day. It
 * must not be produced by a conditional entitlement. Every pattern below is taken from a sentence that
 * was live in production behind an active `freeParking = yes` claim:
 *
 *   package/booking   Thorpe Park            "Every Thorpe Park short break includes: An overnight stay
 *                                             ... Free parking Wi-Fi ... Free parking (worth £12)"
 *                                             -- while its own directions page prices day parking at £12
 *   time-limited      Flip Out Canary Wharf  "You can also enjoy 3 Hours FREE parking on Weekends &
 *                                             Bank Holidays!"
 *   accessibility     Stanborough Park       "Charges start at £1.50, with reduced rates for residents
 *                                             and free parking for Blue Badge holders"
 *   accessibility     Whitechapel Gallery    "Free parking for Blue Badge holders is available at the
 *                                             top of Osborn Street" (already `no` from other wording,
 *                                             so it stands as a counterexample rather than a fix)
 *
 * The condition is not modelled anywhere yet, so a conditional entitlement fails closed to unknown
 * rather than being flattened into yes or asserted as no.
 */
/**
 * The things "only" must bind to for it to restrict an ENTITLEMENT rather than a place.
 *
 * "Free parking is only available in the main car park" restricts WHERE the free parking is, not WHO
 * gets it or WHEN. That is the same semantic shape the product already accepts elsewhere: Headstone
 * Manor keeps its `yes` from "free parking to the rear of the building". A bare "only" anywhere after
 * the phrase cannot tell a location apart from a condition, so "only" is required to attach to one of
 * these instead: a class of visitor, a time, or a booking.
 *
 * A positive vocabulary rather than a blacklist of places, so an unlisted location ("only in the
 * lower field", "only at the north gate") keeps its claim by default instead of needing to be
 * enumerated.
 */
const ONLY_RESTRICTOR =
  '(?:members?|residents?|permit\\s+holders?|blue\\s+badge(?:\\s+(?:badge\\s+)?holders?)?' +
  '|disabled(?:\\s+(?:badge\\s+)?holders?|\\s+visitors?|\\s+drivers?)?' +
  '|season\\s+ticket(?:\\s+holders?)?|ticket\\s+holders?|staff|hotel\\s+guests?|guests?' +
  '|pre.?booked(?:\\s+\\w+)?|customers?|patrons?' +
  '|weekends?|weekdays?|bank\\s+holidays?|sundays?|saturdays?|off.?peak' +
  '|overnight\\s+stays?|short\\s+breaks?|packages?|bookings?' +
  '|\\d+\\s*(?:hours?|hrs?|minutes?|mins?))';

/** "... to members only", "... on weekends only", "... with overnight stays only". */
const ONLY_AFTER_RESTRICTOR = new RegExp(
  `\\bfree\\s+parking\\b[^.!?]{0,40}\\b(?:to|for|with|on|during)\\s+${ONLY_RESTRICTOR}\\b[^.!?]{0,20}\\bonly\\b`,
  'i',
);

/** "... only available to members", "... only for permit holders". */
const ONLY_BEFORE_RESTRICTOR = new RegExp(
  `\\bfree\\s+parking\\b[^.!?]{0,40}\\bonly\\b[^.!?]{0,30}\\b(?:to|for|with|on|during)\\s+${ONLY_RESTRICTOR}\\b`,
  'i',
);

function hasConditionalFreeParking(sentence) {
  return (
    // ---- Restricted to an entitlement class -------------------------------------------------
    // Proved by "holders", which names a class of permit rather than a kind of visitor. Requires
    // "for <class> holders", so "for all, including disabled visitors" is untouched: there the word
    // after "for" is "all", and "disabled" qualifies who is included, not who is eligible.
    /\bfree\s+parking\b[^.!?]{0,30}\bfor\s+(?:blue\s+badge|disabled)\s+(?:badge\s+)?holders?\b/i.test(
      sentence,
    ) ||
    // ---- Restricted by an explicit "only" ---------------------------------------------------
    // "only" must bind to a visitor class, a time or a booking -- see ONLY_RESTRICTOR. An earlier
    // version accepted "only" anywhere within 60 characters of the phrase, which suppressed four
    // location restrictions ("only available in the main car park", "available only in the rear car
    // park"), and a location says nothing about who is entitled to park free.
    ONLY_AFTER_RESTRICTOR.test(sentence) ||
    ONLY_BEFORE_RESTRICTOR.test(sentence) ||
    /\b(?:blue\s+badge|disabled|members?|residents?|season\s+ticket|permit)\s*(?:holders?)?\s+only\b[^.!?]{0,60}\bfree\s+parking\b/i.test(
      sentence,
    ) ||
    // ---- Restricted by a duration allowance -------------------------------------------------
    // A quantity of free time IS the condition, so a bare digit-plus-unit adjacent to the phrase is
    // enough. No sentence offering parking free of charge outright states an hour count.
    /\b\d+\s*(?:hours?|hrs?|minutes?|mins?)\s*(?:of\s+)?free\s+parking\b/i.test(sentence) ||
    /\bfree\s+parking\b[^.!?]{0,20}\bfor\s+(?:the\s+first\s+)?\d+\s*(?:hours?|hrs?|minutes?|mins?)\b/i.test(
      sentence,
    ) ||
    /\bfirst\s+\d+\s*(?:hours?|hrs?|minutes?|mins?)\b[^.!?]{0,30}\bfree\b/i.test(sentence) ||
    // ---- Restricted to named days -----------------------------------------------------------
    // Requires the restricting preposition "on <days>", not a day word in the vicinity. That is the
    // difference between "free parking ON weekends" and "free parking every day, INCLUDING
    // weekends" -- the first limits the offer, the second widens it, and proximity cannot tell them
    // apart. Flip Out Canary Wharf's live sentence is the first shape.
    /\bfree\s+parking\b[^.!?]{0,30}\bon\s+(?:weekends?|bank\s+holidays?|sundays?|saturdays?|off.?peak)\b/i.test(
      sentence,
    ) ||
    // ---- Bundled into a package or booking --------------------------------------------------
    // The package must be stated to CONTAIN the parking ("short break includes ... free parking"),
    // which is Thorpe Park's live wording, or the parking must be conditioned on booking.
    /\b(?:short\s+break|package|overnight\s+stay|room\s+rate)\b[^.!?]{0,140}\binclud(?:e|es|ed|ing)\b[^.!?]{0,180}\bfree\s+parking\b/i.test(
      sentence,
    ) ||
    /\bfree\s+parking\b[^.!?]{0,60}\b(?:with\s+(?:a|your)\s+(?:booking|ticket|stay)|when\s+you\s+book|pre.?booked\s+only)\b/i.test(
      sentence,
    )
  );
}

const EVIDENCE_ANCHORS = {
  toilets: /\b(?:public\s+)?toilets?|restrooms?\b/i,
  babyChanging: /\b(?:baby|nappy)\s+chang(?:e|ing)|changing\s+table\s+for\s+babies|parent\s+and\s+baby\s+facilit/i,
  parking: /\bparking|car\s+park\b/i,
  cafe: /\bcaf[eé]|coffee\s+shop|refreshments?\b/i,
  wheelchairAccessible: /\bwheelchair|step.?free|accessible\s+to\s+all\b/i,
  accessibleToilet: /\baccessible\s+toilet|disabled\s+toilet|changing\s+places\b/i,
  playground: /\bplayground|play\s+area\b/i,
  sensoryFriendlySessions: /\bsensory\s+friendly|quiet\s+session|relaxed\s+performance\b/i,
};

function extractEvidenceWindow(sentence, fieldId) {
  const anchor = EVIDENCE_ANCHORS[fieldId];
  const match = anchor?.exec(sentence);
  if (!match) return sentence;
  const start = Math.max(0, match.index - 80);
  const end = Math.min(sentence.length, match.index + match[0].length + 320);
  return sentence.slice(start, end).trim();
}

function isQuestionOnlyEvidence(sentence) {
  return isInterrogativeSentence(sentence);
}

function isSuspiciousEmbeddedContent(sentence) {
  return (
    // A line name that is part of a PLACE name is not a tube line: "All Victoria Park's public toilets have an
    // accessible cubicle" (Tower Hamlets) was discarded as Victoria-line contamination, and with it the park's toilets.
    /\b(?:bakerloo|piccadilly|jubilee|central|district|northern|victoria)\s+line\b|\b(?:bakerloo|piccadilly|jubilee|central|district|northern|victoria)\b(?!['\u2019]?s?\s+(?:park|gardens?|square|embankment|hall|house|museum)\b)[^.!?]{0,40}\btoilets?\b|\b(?:tube|railway|underground)\s+station\b|\bplatform\s+\d+\b|\btransport\s+for\s+london\b/i.test(
      sentence,
    )
  );
}

/**
 * Site furniture that survived the HTML cleaner: a footer or menu flattened into the text.
 *
 * "Back To Top Home News & Events The Park Activities - volunteering, play areas, sports The Friends Sitemap Friends of
 * Waterlow Park ... Site by diditon.com" (Waterlow Park, 7 Oct 2026 replay) read as a playground. A page's navigation
 * names its sections; it does not state that the venue has them. Two or more DIFFERENT markers in one window is the
 * threshold: a single "Newsletter" after a council's amenities list (London Fields) is still the list.
 */
const NAVIGATION_CHROME_MARKERS = [
  /\bsitemap\b/i,
  /\bback\s+to\s+top\b/i,
  /\bsite\s+by\b/i,
  /\bskip\s+to\s+(?:main\s+)?content\b/i,
  /\bnews\s*&\s*events\b/i,
  /\bcookie\s+(?:policy|settings|preferences)\b/i,
  /\bprivacy\s+(?:policy|notice)\b/i,
  /\bterms\s+(?:and|&)\s+conditions\b/i,
  /\ball\s+rights\s+reserved\b/i,
  /\bfollow\s+us\b/i,
  /\buncategorised\b/i,
];
function isNavigationChrome(sentence) {
  const text = String(sentence ?? '');
  let markers = 0;
  for (const marker of NAVIGATION_CHROME_MARKERS) if (marker.test(text)) markers += 1;
  return markers >= 2;
}

function isScopedToiletClosure(sentence) {
  return /\b(?:these|those|the|our|one|a|this)\s+(?:public\s+)?toilets?\b[^.!?]{0,80}\b(?:closed|unavailable|out\s+of\s+service)\b|\b(?:closed|unavailable|out\s+of\s+service)\b[^.!?]{0,80}\b(?:toilet\s+block|these|those|the)\b/i.test(sentence);
}

function hasVenueWideToiletAbsence(sentence) {
  return /\bno\s+(?:public\s+)?toilets?\s+(?:are\s+)?(?:available|provided|on.?site|at\s+(?:the|this)\s+(?:venue|site))\b|\b(?:the|this)\s+(?:venue|site)\s+(?:does\s+not|doesn't)\s+(?:have|provide|offer)\s+(?:any\s+)?toilets?\b/i.test(sentence);
}

/**
 * Words that stop a positive statement counting: a closure, a plan, a refusal, a refurbishment.
 *
 * Unchanged from the sentence-wide guard it came from, except for the refurbishment wording, which the 7 Oct 2026
 * replay found publishing a café from "we are rebuilding our cafe and shop spaces on Level G" (the Design Museum).
 */
const AVAILABILITY_NEGATION =
  /\b(?:not|without|unavailable|closed|broken|planned|proposed|soon|temporarily)\b|\bwill\b(?!\s+(?:find|see|notice|discover)\b)|\bno\s+(?!charge|fee)|\b(?:refurbishing|rebuilding|renovating|being\s+(?:refurbished|rebuilt|renovated)|under\s+construction|out\s+of\s+(?:use|order|service))\b/i;

/**
 * A weekly or holiday closure is a SCHEDULE, not unavailability: "Café Opening Times Tuesday – Sunday, 10am – 4pm
 * Closed: Monday" (Headstone Manor) states a café, and "the toilets will be closed on Christmas Day" states toilets.
 * Taken out of the scope before the closure words are looked for; "closed for refurbishment", "closed until further
 * notice" and "temporarily closed" are untouched.
 */
const SCHEDULE_DAY = '(?:mon|tues|wednes|thurs|fri|satur|sun)days?';
const SCHEDULE_CLOSURE = new RegExp(
  `\\bclosed:?\\s+(?:on\\s+)?(?:${SCHEDULE_DAY}(?:\\s*(?:-|\u2013|to|and|&|,)\\s*${SCHEDULE_DAY})*(?:\\s+except\\s+bank\\s+holidays)?|bank\\s+holidays?|christmas\\s+(?:day|eve)|boxing\\s+day|new\\s+years?['\u2019]?s?\\s+day)\\b`,
  'gi',
);
function withoutScheduleClosures(text) {
  return String(text ?? '').replace(SCHEDULE_CLOSURE, ' ');
}

/** A statement ends at a terminator, a bullet or an arrow ("Soft Play -> Café -> Farm" is three items). */
const STATEMENT_BOUNDARY = /[.!?;\u2022\u2192]/;

/**
 * The text a negation must sit in to govern THIS match.
 *
 * The guard used to test the whole windowed sentence, which is right for prose and wrong for flattened pages, where a
 * "sentence" is several hundred characters of joined headings and paragraphs with no punctuation. Belmont Children's
 * Farm's homepage reads "Café After playing check out our café for a bite to eat and refreshments Please note soft
 * play has to come before the farm ... unfortunately you can not access the soft play after Food is not allowed in the
 * soft play area": the "not"s are about the soft play, 170 characters on, and they suppressed the farm's café.
 *
 * So: the punctuated statement containing the match, as before, when it is an ordinary length; and only when it is a
 * run-on chunk longer than an ordinary statement, a window of 60 characters before and 100 after the match. Every
 * negation the guard has ever been tested against sits inside that window ("Baby changing facilities are currently
 * unavailable", "The toilets in the visitor centre ... are closed until spring"), and a well-punctuated sentence is
 * judged exactly as it was.
 */
const MAX_STATEMENT = 240;
function negationScope(sentence, matchIndex, matchLength) {
  const text = String(sentence ?? '');
  let start = matchIndex;
  while (start > 0 && !STATEMENT_BOUNDARY.test(text[start - 1])) start -= 1;
  let end = matchIndex + matchLength;
  while (end < text.length && !STATEMENT_BOUNDARY.test(text[end])) end += 1;
  if (end - start <= MAX_STATEMENT) return text.slice(start, end);
  return text.slice(Math.max(start, matchIndex - 60), Math.min(end, matchIndex + matchLength + 100));
}

/**
 * Availability restricted to particular days: "The toilets are open Thursday and Sunday, 11am-4pm" (Mayow Park), "The
 * Kiosk Community Café: every Saturday 9am to 2pm" (South Norwood Country Park). A family arriving on a Wednesday is not
 * served by either, and the yes/no field cannot say "on Saturdays". So it stays unknown -- the restriction is not
 * flattened into a yes -- and the venue goes to the verification queue, where the restriction is recorded in words.
 * Opening hours that span the week ("Monday – Saturday: 9am – 5pm") are not a restriction and are not matched.
 */
const DAY = '(?:mon|tues|wednes|thurs|fri|satur|sun)day';
const DAY_RESTRICTED = new RegExp(
  `\\bevery\\s+${DAY}\\b|\\b(?:weekends?|${DAY}s?)\\s+only\\b|\\bonly\\s+(?:open\\s+)?(?:on\\s+)?(?:weekends?|${DAY}s?)\\b|\\bopen\\s+(?:on\\s+)?${DAY}s?\\s+(?:and|&)\\s+${DAY}s?\\b|\\b(?:summer|winter|seasonal)\\s+only\\b`,
  'i',
);
function isDayRestricted(sentence, matchIndex, matchLength) {
  const after = String(sentence ?? '').slice(matchIndex, matchIndex + matchLength + 100);
  return DAY_RESTRICTED.test(after);
}

function matchField(sentence, patterns, fieldId) {
  if (isQuestionOnlyEvidence(sentence) || isSuspiciousEmbeddedContent(sentence) || isNavigationChrome(sentence)) return null;
  if (fieldId === 'parking' && hasParkingNegation(sentence)) {
    return { value: 'no', confidence: 'high' };
  }
  if (fieldId === 'parking' && hasLimitedParking(sentence)) {
    // Limited parking is not equivalent to generally available parking. It remains unknown until the richer
    // parking-details field is reviewed.
    return null;
  }
  if (fieldId === 'parking' && hasRestrictedParking(sentence) && isOnlyRestrictedParking(sentence, patterns.yes)) {
    // Blue Badge or disabled parking only. General parking stated in the same sentence still counts (see above).
    return null;
  }
  if (fieldId === 'toilets' && isScopedToiletClosure(sentence)) {
    return null;
  }
  if (fieldId === 'toilets' && hasToiletNegation(sentence)) {
    return hasVenueWideToiletAbsence(sentence)
      ? { value: 'no', confidence: 'high' }
      : null;
  }
  for (const re of patterns.no) {
    if (!re.test(sentence)) continue;
    // A road's parking rules are not the venue's parking.
    if ((fieldId === 'parking' || fieldId === 'freeParking') && isStreetParkingRestriction(sentence)) continue;
    // Somebody else's charge: "The nearby Olympic Park Avenue has on-street pay and display spaces" (Queen Elizabeth
    // Olympic Park, served as free parking = no). Only for the charge; a venue's own "no parking" beside a pointer to
    // car parks nearby ("There is no parking onsite but there are numerous car parks near", Madame Tussauds) is a no.
    if (fieldId === 'freeParking' && hasOffSiteParking(sentence)) continue;
    return { value: 'no', confidence: 'high' };
  }
  for (const re of patterns.yes) {
    const match = re.exec(sentence);
    if (!match) continue;
    // Availability cannot be inferred from a mention in a closure, future plan, or question. Judged on the statement
    // that carries the match, not on everything a flattened page joined to it: see `negationScope`.
    // "You will find baby changing facilities at ground level" describes what is there; only a plan
    // ("will be installed", "will open") is excluded.
    if (AVAILABILITY_NEGATION.test(withoutScheduleClosures(negationScope(sentence, match.index, match[0].length)))) continue;
    if ((fieldId === 'toilets' || fieldId === 'cafe') && isDayRestricted(sentence, match.index, match[0].length)) continue;
    if (fieldId === 'parking' && hasParkingNegation(sentence)) continue;
    if (fieldId === 'parking' && !isExplicitParkingStatement(sentence)) continue;
    // A conditional entitlement is not a general "Free parking" promise to a family arriving by car.
    //
    // Deliberately NOT also `hasRestrictedParking` here, though that is the guard `parking` uses.
    // It matches bare "disabled parking" wording, so on a single sentence like "All car parking is
    // free. There are designated disabled parking bays." -- Woodside Animal Farm's real text, one
    // period away from being one sentence -- it would suppress a legitimate unconditional yes.
    // `hasConditionalFreeParking` already covers every conditional shape found in production,
    // including both Blue Badge ones, so the broader guard would only cost true claims.
    if (fieldId === 'freeParking' && hasConditionalFreeParking(sentence)) {
      continue;
    }
    if (fieldId === 'toilets' && (hasToiletNegation(sentence) || isScopedToiletClosure(sentence))) continue;
    if (fieldId === 'babyChanging' && !isExplicitBabyChangingStatement(sentence)) continue;
    if (fieldId === 'cafe' && isOffSiteCafe(sentence)) continue;
    if (fieldId === 'cafe' && re === CAFE_HOURS_PATTERN && AVAILABILITY_NEGATION.test(sentence)) continue;
    // Toilets elsewhere ("the nearest public toilets are at the village hall") are not this venue's.
    if (fieldId === 'toilets' && /\b(?:nearest|nearby|across\s+the\s+(?:road|street)|down\s+the\s+(?:road|street)|round\s+the\s+corner|minutes?\s+(?:walk|away)|neighbouring|village\s+hall|railway\s+station)\b/i.test(sentence)) continue;
    // "The nearest Changing Places Toilet can be found in Dulwich Park" (Sydenham Hill Wood) is another place's toilet.
    if (fieldId === 'accessibleToilet' && /\b(?:nearest|nearby)\b|\bcan\s+be\s+found\s+in\s+[A-Z]/.test(sentence)) continue;
    // "Please ask a member of staff for the nearest baby changing facilities" (Madame Tussauds) does not say it is on site.
    // Only when it qualifies the baby changing itself: an amenities list that mentions "nearby" elsewhere is not this.
    if (fieldId === 'babyChanging' && /\b(?:nearest|nearby)\b[^.]{0,40}\bbaby[\s-]+chang/i.test(sentence)) continue;
    // A café's or a bus route's accessibility is not the venue's.
    if (fieldId === 'wheelchairAccessible' && isNonVenueWheelchairSubject(sentence)) continue;
    if (fieldId === 'wheelchairAccessible' && VENUE_STEP_FREE_PATTERNS.includes(re) && isNonVenueStepFree(sentence)) continue;
    // Soft play is a different facility, and a parent who asked for a playground is not served by it.
    if (fieldId === 'playground' && isSoftPlayOnlyPlayground(sentence)) continue;
    // Nor is an arcade, a trampoline park's named attraction, or a museum gallery exhibit.
    if (fieldId === 'playground' && isIndoorAttractionOnlyPlayground(sentence)) continue;
    if (fieldId === 'parking' || fieldId === 'freeParking') {
      // "Parking confirmed on site" must not be said about a car park down the road,
      if (hasOffSiteParking(sentence)) continue;
      // or about a car park kept for another facility's users,
      if (isParkingForOthers(sentence)) continue;
      // about a buggy park, a bike rack or a coach bay,
      if (isNonVehicleParkingOnly(sentence, patterns.yes)) continue;
      // or about the bike parking on a page's cycling directions.
      if (isCycleTravelContext(sentence)) continue;
    }
    return { value: 'yes', confidence: 'high' };
  }
  return null;
}

/**
 * A FACILITY LIST on the venue's own page: "Facilities include: play area café outdoor gym" (Mayow Park, Lewisham),
 * "Amenities 2 children's play areas ... Lido and lido café ... Toilets and accessible toilets" (London Fields, Hackney),
 * "Facilities Rough surfaced car park for approximately 50 vehicles" (Fryent Country Park, Brent).
 *
 * Council park pages publish their facilities this way and almost never in sentences, which is why parks were the
 * weakest category in the coverage audit. The list is the council's own statement about this park, so an item in it is
 * evidence -- under conditions that keep it from being navigation:
 *
 *   - the list is introduced by its own heading word, within 250 characters and no sentence terminator of the item;
 *   - the span is not site navigation (two or more menu words: "Venue hire", "Get in touch", "Menu", "Contact us" ...),
 *     which is how the William Morris Gallery's menu "Access Café Facilities Venue hire Group visits" is refused;
 *   - the item is not qualified away: a closure or plan next to it (the ordinary negation guard), "nearby", or a
 *     day-only restriction ("The Kiosk Community Café: every Saturday 9am to 2pm").
 *
 * Only cafe, toilets and a car park are read from lists. Baby changing and buggy access are never inferred from a list
 * heading: their wording is specific enough to be matched where it is actually stated.
 */
// A HEADING, not the noun in prose: "Facilities" or "Amenities" capitalised as a label, or followed by "include" or a
// colon. Lower-case "baby changing facilities in the cafe" (Hackney City Farm) is a sentence about baby changing, and
// reading it as a list published the café from it in the first replay.
const LIST_INTRO =
  /\b(?:(?:Park\s+)?Facilities(?:\s+at\s+[A-Z][\w'\u2019 ]{0,40})?|Amenities|[Ff]acilities\s+include\s*:?|[Ff]acilities\s*:|[Aa]menities\s*:|[Ii]n\s+the\s+[Pp]ark,?\s+you\s+(?:can|will)\s+find\s*:?)(?![\w])/g;
const LIST_NAVIGATION_WORDS =
  /\b(?:menu|venue\s+hire|get\s+in\s+touch|contact\s+us|sign\s+(?:up|in)|log\s+in|search|membership|donate|newsletter|tickets?|shop|group\s+visits|explore\s+the\s+local\s+area|what'?s\s+on|home)\b/gi;
const LIST_ITEMS = {
  cafe: /\bcaf[e\u00e9]s?(?![A-Za-z])/i,
  toilets: /\btoilets?\b|\bpublic\s+conveniences\b/i,
  parking: /\b(?:free\s+|onsite\s+|on-site\s+|surfaced\s+)?car\s+park(?:s|ing)?\b/i,
};
function matchFacilityList(sentence, fieldId) {
  const itemPattern = LIST_ITEMS[fieldId];
  if (!itemPattern) return null;
  const text = String(sentence ?? '');
  if (isQuestionOnlyEvidence(text) || isSuspiciousEmbeddedContent(text) || isNavigationChrome(text)) return null;
  LIST_INTRO.lastIndex = 0;
  let intro;
  while ((intro = LIST_INTRO.exec(text)) !== null) {
    const from = intro.index + intro[0].length;
    let span = text.slice(from, from + 250);
    const stop = span.search(/[.!?]/);
    if (stop !== -1) span = span.slice(0, stop);
    const item = itemPattern.exec(span);
    if (!item) continue;
    // Navigation BETWEEN the heading and the item means the "list" is a menu. What follows the item is irrelevant:
    // London Fields' amenities are followed by the council's own "Newsletter Sign up" footer.
    if ((span.slice(0, item.index).match(LIST_NAVIGATION_WORDS) ?? []).length >= 2) continue;
    const at = from + item.index;
    if (AVAILABILITY_NEGATION.test(withoutScheduleClosures(text.slice(at, at + item[0].length + 60)))) continue;
    if (isDayRestricted(text, at, item[0].length)) continue;
    if (/\b(?:nearby|nearest|local|neighbouring)\s*$/i.test(text.slice(Math.max(0, at - 30), at))) continue;
    if (fieldId === 'cafe' && isOffSiteCafe(text.slice(at, at + 80))) continue;
    if (fieldId === 'parking' && (hasOffSiteParking(text.slice(at, at + 80)) || /\bcoach\b/i.test(text.slice(Math.max(0, at - 15), at)))) continue;
    // A listed "Accessible car parking" or "parking spaces for disabled visitors" is a restricted bay, not the venue's
    // general parking (Tate Modern's and Tate Britain's facilities lists, 7 Oct 2026). Judged on the item and its
    // immediate context, the same way the sentence rule judges a whole statement.
    if (fieldId === 'parking' && hasRestrictedParking(text.slice(Math.max(0, at - 20), at + item[0].length + 80))
      && isOnlyRestrictedParking(text.slice(Math.max(0, at - 20), at + item[0].length + 80), FIELD_PATTERNS.find((f) => f.field === 'parking')?.yes)) continue;
    return {
      value: 'yes',
      confidence: 'high',
      evidenceText: cleanEvidenceSnippet(text.slice(intro.index, Math.min(text.length, at + item[0].length + 120))),
    };
  }
  return null;
}

/**
 * Is this stored page capable of carrying evidence at all?
 *
 * `fetch_status = ok` does not mean a page had anything to read. Crossrail Place Roof Garden came back
 * from the cohort run with SIX fresh `ok`, eligible rows whose `extracted_text` and `page_title` are
 * both completely empty -- shells that satisfied the usable-page target as though evidence had been
 * obtained, which is why that venue shows "6 usable pages" and serves nothing.
 *
 * Deliberately not a minimum character count. Flip Out Brent Cross's `environment=indoor` comes from a
 * page TITLE whose body never says "indoor", so a length threshold on body text would discard a
 * legitimate fact.
 *
 * But "has a title" is not the rule either, and the first version of this function got that wrong:
 * `hasBody || hasTitle` let a body-less page titled "Accessibility" or "FAQ" count as evidence, so six
 * such shells could still stop the crawl at `USABLE_PAGE_TARGET` with nothing extracted. Flip Out shows
 * that a title CAN carry a fact, not that any title is evidence.
 *
 * So the rule is semantic: readable body text, or a title that actually yields a fact on re-extraction.
 *
 * One definition, used by the crawl's usable-page accounting, the usable-page target, the diagnostics
 * and trusted re-verification alike. Re-verification used to test `r.extractedText` on its own, which
 * would have dropped a title-only fact even after the title was threaded through.
 */
function isEvidenceBearingSource({ extractedText, facts, pageTitle = null } = {}) {
  /**
   * "Readable body" is judged on what extraction actually reads: the text with title-echo chrome removed, and never a
   * bot-mitigation interstitial. Both were counting as pages read. Burgh House's five stored pages are each just its
   * title and a stray "-->" ("Burgh House -->"), and Barnet Council's park pages are Imperva's "Pardon Our
   * Interruption" text; either way the crawl stopped at the usable-page target having read nothing.
   */
  const readable = typeof extractedText === 'string'
    && !isBotChallengeText(extractedText, pageTitle)
    ? stripPageTitleChrome(decodeHtmlEntities(extractedText), decodeHtmlEntities(pageTitle))
      .replace(/<!--|-->/g, ' ')
    : '';
  const hasBody = /[A-Za-z]{3,}/.test(readable);
  // A title earns its place only by producing a fact. Callers pass the facts they RE-EXTRACTED, never
  // the stored `extracted_evidence`, so the question asked is always "can this page still yield
  // something?" and not "did it once appear to?".
  const titleYieldedAFact = Array.isArray(facts) && facts.length > 0;
  return hasBody || titleYieldedAFact;
}

/**
 * The metadata extraction is allowed to read, built in ONE place.
 *
 * Review found a silent asymmetry that cost a real served fact. `extractEnvironmentEvidence` analyses
 * the page TITLE as well as the body, so Flip Out Brent Cross yielded `environment=indoor` from
 * "North London's Ultimate Indoor Trampoline & Adventure Park!" -- its body never says "indoor" at all.
 * The crawl passed `pageTitle`; `verifiedBundleForVenue` re-extracted the same stored text WITHOUT it.
 * So the fact existed while the draft was built and vanished during trusted re-verification, and
 * `eligibleFact`'s final check -- that the bundle's source still states the fact -- then failed. No
 * claim, no error, nothing to see.
 *
 * The cached branch of `fetchAndExtractPage` dropped it as well, which nobody had noticed.
 *
 * Every caller now builds its sourceMeta here, so re-verification is semantically identical to first
 * extraction by construction rather than by two lists being kept in step by hand. A field added here
 * reaches all three paths at once.
 */
function extractionSourceMeta({ url, sourceType, retrievedAt, pageTitle = null }) {
  return { url, sourceType, retrievedAt, pageTitle: pageTitle ?? null };
}

/**
 * Is this line the page's own <title>, echoed as site chrome?
 *
 * Beckenham Place Park served `familyFacilities.playground = yes`. Its evidence was the site's SEO
 * title, which lists every amenity the park has and is repeated at the top of every page:
 *
 *   "Free activities for children and young people -- Beckenham Place Park - Borough of Lewisham |
 *    Playgrounds - Cycle Routes - Walking - Nature trails - BMX & Skate Park - Swimming Lake -
 *    Parkrun - Venue Hire | South East London UK Back All Events Lake Pl..."
 *
 * The word "Playgrounds" is inside the title. Sitewide navigation cannot establish a venue fact, so
 * the line is dropped before anything reads it.
 *
 * TWO CONDITIONS, both measured over the newest row per (venue, url) -- 1,552 lines across the
 * stored corpus:
 *
 *   the line starts with the page title           81 lines
 *   ... and carries no sentence terminator        47 lines
 *
 * All 47 are chrome: a title followed by "Skip to content", a cookie banner, or a nav list. None is
 * venue prose. Exactly ONE backs a served claim -- Beckenham's playground -- so the rule retires
 * that one and nothing else, while also closing 42 lines that could have established a fact but
 * happen not to today: Hatfield Park's "Getting here - free parking for visitors" banner, London
 * Museum Docklands' "Gift shop and cafe" title, Burgess Park's "Parking, streets and transport".
 *
 * A LENGTH THRESHOLD WAS CONSIDERED AND REJECTED. An earlier draft also required 200+ characters,
 * which would have fired on Beckenham's five lines and nothing else in the entire corpus -- a rule
 * fitted to one venue. The measurement above is why it is gone: the 42 shorter lines are the same
 * chrome, and several of them carry facility words.
 *
 * THE PREFIX TEST IS A CHOICE ON PRINCIPLE, NOT A MEASURED ONE, and that is worth stating plainly.
 * Requiring the title at the START of the line is narrower than allowing it anywhere, but on the
 * current corpus the two differ on exactly ONE line: Hillside Gardens Park's "Breadcrumb Home
 * Parking Parking Parking permits ..." from Lambeth Council, whose title is "Parking | Lambeth
 * Council". That line is chrome too, so the data does not decide between them. The reason to keep
 * `startsWith` is that a title echoed at the top of a line is the signature of site chrome, whereas
 * a title echoed inside prose is not -- and an earlier draft that matched the title ANYWHERE hit 236
 * of 453 pages, which is the broad rule this one replaced.
 *
 * Entities are normalised away on both sides because the two do not agree: the stored title holds a
 * bare "&" where the text holds "&amp;", and Dulwich Park's title holds a literal en dash where its
 * text holds "&#8211;". The stored title is also capped at 200 characters, which is harmless for a
 * prefix test even when the cap lands mid-word.
 */
function normaliseForTitleMatch(value) {
  return String(value ?? '')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isPageTitleChrome(line, pageTitle) {
  const title = normaliseForTitleMatch(pageTitle);
  if (!title) return false;
  // A statement ends somewhere. Chrome does not.
  if (/[.!?]/.test(String(line ?? ''))) return false;
  return normaliseForTitleMatch(line).startsWith(title);
}

/** Drop the title-echo chrome lines, and nothing else, before any field reads the page. */
function stripPageTitleChrome(text, pageTitle) {
  if (!pageTitle) return String(text ?? '');
  return String(text ?? '')
    .split(/\r?\n/)
    .filter((line) => !isPageTitleChrome(line, pageTitle))
    .join('\n');
}

/**
 * Every place the field's anchor appears in a sentence, as a window around each.
 *
 * Only the FIRST occurrence used to be examined. Flattened pages repeat an anchor -- a menu says "Café" before the
 * paragraph about the café -- so the statement could sit beyond the 320 characters after the first mention and never be
 * read at all. At most six windows, and identical windows are read once.
 */
function anchorWindows(sentence, fieldId) {
  const anchor = EVIDENCE_ANCHORS[fieldId];
  if (!anchor) return [sentence];
  const global = new RegExp(anchor.source, anchor.flags.includes('g') ? anchor.flags : `${anchor.flags}g`);
  const windows = [];
  let match;
  while ((match = global.exec(sentence)) !== null && windows.length < 6) {
    const start = Math.max(0, match.index - 80);
    const end = Math.min(sentence.length, match.index + match[0].length + 320);
    const window = sentence.slice(start, end).trim();
    if (!windows.includes(window)) windows.push(window);
    if (match[0].length === 0) global.lastIndex += 1;
  }
  return windows.length > 0 ? windows : [sentence];
}

const CAFE_CLOSED_FOR_NOW =
  /\bcaf[e\u00e9](?![A-Za-z])[^.!?]{0,40}\b(?:is|are)\s+(?:temporarily\s+closed|closed\s+for\s+business|closed\s+until\s+further\s+notice)\b|\bnot\s+heard\s+when\b[^.!?]{0,40}\breopen/i;

function extractEvidenceFromText(text, sourceMeta) {
  // Character references are decoded first, so "Caf&eacute;" is read as the café it is. Then every path below reads
  // the chrome-free text, so sitewide navigation cannot establish a fact in any field, nor reach the excerpt a parent
  // is shown.
  const readableText = stripPageTitleChrome(decodeHtmlEntities(String(text ?? '')), decodeHtmlEntities(sourceMeta.pageTitle ?? null));
  const sentences = splitSentences(readableText);
  const facts = [];
  const push = (field, match, evidenceText) => {
    facts.push({
      field,
      value: match.value,
      confidence: match.confidence,
      evidenceText,
      sourceUrl: sourceMeta.url,
      sourceType: sourceMeta.sourceType,
      retrievedAt: sourceMeta.retrievedAt,
    });
  };

  for (const pattern of FIELD_PATTERNS) {
    for (const sentence of sentences) {
      // Classify only cleaned human-readable text. Matching raw flattened HTML can
      // turn CSS selectors such as ".baby-changing" into false facility claims.
      // Long flattened pages are windowed around EACH facility anchor before the
      // 400-char storage cap so trailing facility prose is not truncated away.
      const focused = EVIDENCE_ANCHORS[pattern.field]?.test(sentence)
        ? anchorWindows(sentence, pattern.field)
        : [sentence];
      let matched = false;
      for (const focusedSentence of focused) {
        const readableSentence = cleanEvidenceSnippet(focusedSentence);
        if (!readableSentence) continue;
        const match = matchField(readableSentence, pattern, pattern.field);
        if (!match) continue;
        push(pattern.field, match, cleanEvidenceSnippet(extractEvidenceWindow(readableSentence, pattern.field)));
        matched = true;
        // Keep all statements so contradictory text on the same page becomes a conflict.
      }
      if (!matched) {
        const listed = matchFacilityList(sentence, pattern.field);
        if (listed?.evidenceText) push(pattern.field, listed, listed.evidenceText);
      }
    }
  }

  const pushchairFact = extractPushchairEvidence(readableText, sourceMeta);
  if (pushchairFact) {
    facts.push(pushchairFact);
  }

  const environmentFact = extractEnvironmentEvidence(readableText, sourceMeta);
  if (environmentFact) {
    facts.push(environmentFact);
  }

  // A page that says its café is closed for now publishes no café (v6): Colne Valley Regional Park's visitor centre page
  // says "The Riverside Café is temporarily closed for business" and its FAQ "We have not heard when exactly it will be
  // reopened", while other sentences on both still describe the café ("In the cafe itself there is an open kitchen").
  // A schedule ("The cafe is usually closed from 20th December and usually reopens 3 January") is not a closure.
  if (CAFE_CLOSED_FOR_NOW.test(readableText)) {
    return facts.filter((fact) => !(fact.field === 'cafe' && fact.value === 'yes'));
  }
  return facts;
}

/**
 * Merge the per-source facts into one verdict per field.
 *
 * WITHHOLDING HAS TO BE SYMMETRIC, and this is where that is enforced.
 *
 * Found by the Young V&A production canary on 2026-09-27. Rejecting two other-catalogue-venue pages
 * freed room in the crawl budget, which the reserve filled with `vam.ac.uk/east/museum/visit` -- V&A
 * East Museum, not a catalogue venue, so `sibling_unverified`: fetched, recorded, WITHHELD. That page
 * states parking both ways ("Buggy parking is available..." and "There is no parking provided or
 * managed by the V&A"). Merged blind to scope, parking became a conflict, `eligibleFact` dropped the
 * conflicted fact, and reconciliation disputed Young V&A's parking claim -- a true fact, read off the
 * venue's OWN page, withdrawn on the word of a page that was not allowed to speak for it at all.
 *
 * Publication already asked "may this source speak FOR this venue?". Nothing asked whether it may
 * speak AGAINST it. So the rule is: only evidence that could establish a field may contest it.
 *
 * The fallback matters as much as the filter. Excluding ineligible sources outright would delete the
 * field from the bundle whenever every source for it is ineligible -- and `reconcileSourceClaims`
 * disputes a claim whose field has vanished. Horniman Butterfly House's seven claims all come from
 * `other_catalogue_venue` pages, so a blanket exclusion would have disputed them the moment the cron
 * next ran: exactly the unreviewed mass repair the `enforceSubjectScope: false` exception exists to
 * prevent. Ineligible evidence therefore still speaks where nothing eligible does, which keeps those
 * claims reaching their normal expiry instead of being withdrawn by a deploy. It still cannot
 * PUBLISH: `eligibleFact` checks the source's own scope, independently of this merge.
 *
 * A bundle carrying no scope information at all -- legacy rows, the batch runner, older fixtures --
 * has no eligible candidate for any field and so falls back for all of them, which is the behaviour
 * this function had before. The change is deliberately invisible until provenance exists.
 */
function mergeEvidenceBundles(sources) {
  // Scope lives on the source, facts only carry their url, so index one by the other.
  const scopeByUrl = new Map((sources ?? []).map((source) => [source.url, source.subjectScope ?? null]));
  const fromEligibleSource = (fact) => isEligibleScope(scopeByUrl.get(fact.sourceUrl));

  const byField = new Map();
  for (const source of sources) {
    for (const fact of source.facts ?? []) {
      const candidates = byField.get(fact.field) ?? [];
      candidates.push(fact);
      byField.set(fact.field, candidates);
    }
  }

  return [...byField.entries()].map(([field, allCandidates]) => {
    const eligibleCandidates = allCandidates.filter(fromEligibleSource);
    const candidates = eligibleCandidates.length > 0 ? eligibleCandidates : allCandidates;
    const values = [...new Set(candidates.map((fact) => fact.value).filter((value) => value !== 'unknown'))];
    if (values.length > 1) {
      return {
        field,
        value: 'unknown',
        confidence: 'unknown',
        evidenceStatus: 'conflict',
        conflicts: candidates,
        evidenceText: null,
        sourceUrl: null,
        sourceType: null,
        retrievedAt: null,
      };
    }

    if (field === 'pushchairSuitability' && values.length > 1) {
      return candidates.reduce((mostCautious, fact) => {
        const currentRank = PUSHCHAIR_RANK[mostCautious.value] ?? 0;
        const factRank = PUSHCHAIR_RANK[fact.value] ?? 0;
        return factRank < currentRank ? fact : mostCautious;
      });
    }

    return candidates.reduce((best, fact) =>
      !best || rankPushchairOrConfidence(fact, best) > 0 ? fact : best
    , null);
  });
}

const PUSHCHAIR_RANK = { excellent: 4, good: 3, mixed: 2, difficult: 1, unknown: 0 };
const ENVIRONMENT_RANK = { mixed: 3, indoor: 2, outdoor: 2, unknown: 0 };

function rankPushchairOrConfidence(fact, existing) {
  if (fact.field === 'pushchairSuitability') {
    const factRank = PUSHCHAIR_RANK[fact.value] ?? 0;
    const existingRank = PUSHCHAIR_RANK[existing.value] ?? 0;
    if (factRank !== existingRank) return factRank - existingRank;
  }
  if (fact.field === 'environment') {
    const factRank = ENVIRONMENT_RANK[fact.value] ?? 0;
    const existingRank = ENVIRONMENT_RANK[existing.value] ?? 0;
    if (factRank !== existingRank) return factRank - existingRank;
  }
  return rankConfidence(fact.confidence) - rankConfidence(existing.confidence);
}

function rankConfidence(c) {
  if (c === 'high') return 3;
  if (c === 'medium') return 2;
  if (c === 'low') return 1;
  return 0;
}

function buildEvidenceBundle(venueId, sources, sourceStatus, diagnostics = null) {
  return {
    venueId,
    sourceStatus,
    sources: sources.map((s) => ({
      url: s.url,
      type: s.sourceType,
      sourceType: s.sourceType,
      pageTitle: s.pageTitle ?? null,
      retrievedAt: s.retrievedAt,
      fetchStatus: s.fetchStatus,
      error: s.error ?? null,
      /**
       * Provenance has to survive this reshape. This function rebuilds each source from a fixed
       * list of keys, so anything not named here is silently dropped -- which is exactly how venue
       * identity was lost in the first place. `subjectScope` is the record of whose page this is;
       * losing it here would make every fact fail closed and, worse, would do so invisibly.
       */
      subjectScope: s.subjectScope ?? null,
      subjectScopeReason: s.subjectScopeReason ?? null,
      facts: s.facts ?? [],
    })),
    facts: mergeEvidenceBundles(sources),
    pagesChecked: sources.length,
    cacheHits: sources.filter((s) => s.fetchStatus === 'cached').length,
    diagnostics: diagnostics ?? {
      linksDiscovered: [],
      linksSelected: [],
      pagesFetched: [],
      pagesFailed: [],
      evidenceByPage: [],
    },
  };
}

module.exports = {
  isParkingForOthers,
  EXTRACTOR_VERSION,
  isNavigationChrome,
  isEvidenceBearingSource,
  extractionSourceMeta,
  extractEvidenceFromText,
  mergeEvidenceBundles,
  buildEvidenceBundle,
  isExplicitParkingStatement,
  hasExplicitParkingAvailability,
  hasParkingNegation,
  hasLimitedParking,
  hasRestrictedParking,
  extractEvidenceWindow,
  hasToiletNegation,
  isExplicitBabyChangingStatement,
  isQuestionOnlyEvidence,
  isSoftPlayOnlyPlayground,
  isIndoorAttractionOnlyPlayground,
  isNonVenueWheelchairSubject,
  isPageTitleChrome,
  stripPageTitleChrome,
  hasOffSiteParking,
  isNonVehicleParkingOnly,
  isCycleTravelContext,
  isSuspiciousEmbeddedContent,
  isScopedToiletClosure,
  hasVenueWideToiletAbsence,
  isStreetParkingRestriction,
  isOnlyRestrictedParking,
  negationScope,
  isDayRestricted,
  withoutScheduleClosures,
  matchFacilityList,
  FIELD_PATTERNS,
  cleanEvidenceSnippet,
};
