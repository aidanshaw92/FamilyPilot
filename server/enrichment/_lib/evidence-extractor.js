const { cleanEvidenceSnippet, isInterrogativeSentence } = require('./evidence-text-utils');
const { extractPushchairEvidence } = require('./pushchair-evidence');
const { extractEnvironmentEvidence } = require('./environment-evidence');
const { isEligibleScope } = require('./source-identity');

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
    ],
    no: [/no\s+baby\s+chang/i],
  },
  {
    field: 'freeParking',
    yes: [
      /free\s+parking/i,
      /parking\s+is\s+free/i,
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
      /car\s+park(?:ing)?\s+(is\s+)?available/i,
      /car\s+park\s+(is\s+)?(?:provided|on site|on-site)/i,
      /visitors?\s+car\s+park/i,
      /parking\s+spaces\s+(are\s+)?provided/i,
      /(?:cars|vehicles|minibuses|coaches)\s+(?:are\s+)?welcome\s+to\s+use\s+(?:our\s+)?(?:large\s+)?(?:free\s+)?car\s+park/i,
    ],
    no: [
      /no\s+parking/i,
      /no\s+on.?site\s+parking/i,
      /parking\s+is\s+not\s+available/i,
      // Graffiti Tunnel 562d8a7f: "car parking is not allowed at Leake Street Arches." An explicit
      // negative is as useful to a parent as a positive, and was being missed.
      /(?:car\s+)?parking\s+is\s+not\s+(?:allowed|permitted)/i,
      /(?:do\s+not|don't|does\s+not|doesn't)\s+(?:have|offer|provide)\s+(?:any\s+)?(?:on.?site\s+)?parking/i,
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
    ],
    no: [/no\s+caf[eé]/i],
  },
  {
    field: 'wheelchairAccessible',
    yes: [/wheelchair\s+accessible/i, /accessible\s+(?:for|to)\s+wheelchair\s+users/i],
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

function hasRestrictedParking(sentence) {
  return (
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
    /\b(?:bakerloo|piccadilly|jubilee|central|district|northern|victoria)\s+line\b|\b(?:bakerloo|piccadilly|jubilee|central|district|northern|victoria)\b[^.!?]{0,40}\btoilets?\b|\b(?:tube|railway|underground)\s+station\b|\bplatform\s+\d+\b|\btransport\s+for\s+london\b/i.test(
      sentence,
    )
  );
}

function isScopedToiletClosure(sentence) {
  return /\b(?:these|those|the|our|one|a|this)\s+(?:public\s+)?toilets?\b[^.!?]{0,80}\b(?:closed|unavailable|out\s+of\s+service)\b|\b(?:closed|unavailable|out\s+of\s+service)\b[^.!?]{0,80}\b(?:toilet\s+block|these|those|the)\b/i.test(sentence);
}

function hasVenueWideToiletAbsence(sentence) {
  return /\bno\s+(?:public\s+)?toilets?\s+(?:are\s+)?(?:available|provided|on.?site|at\s+(?:the|this)\s+(?:venue|site))\b|\b(?:the|this)\s+(?:venue|site)\s+(?:does\s+not|doesn't)\s+(?:have|provide|offer)\s+(?:any\s+)?toilets?\b/i.test(sentence);
}

function matchField(sentence, patterns, fieldId) {
  if (isQuestionOnlyEvidence(sentence) || isSuspiciousEmbeddedContent(sentence)) return null;
  if (fieldId === 'parking' && hasParkingNegation(sentence)) {
    return { value: 'no', confidence: 'high' };
  }
  if (fieldId === 'parking' && (hasLimitedParking(sentence) || hasRestrictedParking(sentence))) {
    // Restricted or limited parking is not equivalent to generally available parking.
    // It remains unknown until the richer parking-details field is reviewed.
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
    if (re.test(sentence)) return { value: 'no', confidence: 'high' };
  }
  for (const re of patterns.yes) {
    if (!re.test(sentence)) continue;
    // Availability cannot be inferred from a mention in a closure, future plan, or question.
    if (/\b(?:not|without|unavailable|closed|broken|planned|proposed|soon|will|temporarily)\b|\bno\s+(?!charge|fee)/i.test(sentence)) continue;
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
    // A café's or a bus route's accessibility is not the venue's.
    if (fieldId === 'wheelchairAccessible' && isNonVenueWheelchairSubject(sentence)) continue;
    // Soft play is a different facility, and a parent who asked for a playground is not served by it.
    if (fieldId === 'playground' && isSoftPlayOnlyPlayground(sentence)) continue;
    // Nor is an arcade, a trampoline park's named attraction, or a museum gallery exhibit.
    if (fieldId === 'playground' && isIndoorAttractionOnlyPlayground(sentence)) continue;
    if (fieldId === 'parking' || fieldId === 'freeParking') {
      // "Parking confirmed on site" must not be said about a car park down the road,
      if (hasOffSiteParking(sentence)) continue;
      // about a buggy park,
      if (isNonVehicleParkingOnly(sentence, patterns.yes)) continue;
      // or about the bike parking on a page's cycling directions.
      if (isCycleTravelContext(sentence)) continue;
    }
    return { value: 'yes', confidence: 'high' };
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
function isEvidenceBearingSource({ extractedText, facts } = {}) {
  const hasBody = typeof extractedText === 'string' && extractedText.trim() !== '';
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

function extractEvidenceFromText(text, sourceMeta) {
  const sentences = splitSentences(text);
  const facts = [];

  for (const pattern of FIELD_PATTERNS) {
    for (const sentence of sentences) {
      // Classify only cleaned human-readable text. Matching raw flattened HTML can
      // turn CSS selectors such as ".baby-changing" into false facility claims.
      // Long flattened pages are windowed around the facility anchor before the
      // 400-char storage cap so trailing facility prose is not truncated away.
      const focusedSentence = EVIDENCE_ANCHORS[pattern.field]?.test(sentence)
        ? extractEvidenceWindow(sentence, pattern.field)
        : sentence;
      const readableSentence = cleanEvidenceSnippet(focusedSentence);
      if (!readableSentence) continue;
      const match = matchField(readableSentence, pattern, pattern.field);
      if (!match) continue;
      facts.push({
        field: pattern.field,
        value: match.value,
        confidence: match.confidence,
        evidenceText: cleanEvidenceSnippet(extractEvidenceWindow(readableSentence, pattern.field)),
        sourceUrl: sourceMeta.url,
        sourceType: sourceMeta.sourceType,
        retrievedAt: sourceMeta.retrievedAt,
      });
      // Keep all statements so contradictory text on the same page becomes a conflict.
    }
  }

  const pushchairFact = extractPushchairEvidence(text, sourceMeta);
  if (pushchairFact) {
    facts.push(pushchairFact);
  }

  const environmentFact = extractEnvironmentEvidence(text, sourceMeta);
  if (environmentFact) {
    facts.push(environmentFact);
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
  hasOffSiteParking,
  isNonVehicleParkingOnly,
  isCycleTravelContext,
  isSuspiciousEmbeddedContent,
  isScopedToiletClosure,
  hasVenueWideToiletAbsence,
  FIELD_PATTERNS,
  cleanEvidenceSnippet,
};
