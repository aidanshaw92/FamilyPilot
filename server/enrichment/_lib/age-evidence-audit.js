/**
 * P0-B3: a ZERO-WRITE audit of what venue pages actually say about age.
 *
 * Nothing in this file writes. It exists to answer one question before B4 is allowed to publish
 * anything: does the B2 model (server/enrichment/_lib/age-policy.js, docs/AGE_POLICY.md) fit the
 * real London evidence well enough to turn into production claims?
 *
 * The rule the whole audit obeys is the same one B2 obeys: DO NOT FORCE TEXT INTO THE MODEL.
 * A sentence that cannot be read confidently is reported as unreadable, not rounded into a door.
 * An audit that quietly tidies its inputs would tell us the model fits when what really happened
 * is that the audit bent the evidence to fit it.
 */

const { normaliseAgeRules, claimMayGate, GATING_SOURCE_TYPES, MIN_EVIDENCE_EXCERPT_CHARS } = require('./age-policy');

/** Sentences worth looking at. Deliberately broad: precision comes from classification, not this. */
const AGE_SENTENCE = new RegExp(
  [
    'under\\s*\\d', 'over\\s*\\d', '\\d\\s*(\\+|plus)\\b', 'ages?\\s*\\d',
    '\\d\\s*[-–]\\s*\\d+\\s*(year|yr|month)', 'years?\\s*old', 'months?\\s*old',
    'accompanied', 'all ages', 'no age (restriction|limit)', 'age (restriction|limit|policy)',
    'under-?\\d+s\\b', 'adults? only', '\\d+s?\\s*and\\s*(over|under|above|below)\\b',
  ].join('|'),
  'i',
);

const MONTHS_PER_YEAR = 12;

/**
 * Words that mean "this rule is about one thing you can do here", not about the front door.
 *
 * B2's whole point is that "soft play is 5+" must not remove a venue from a family with a
 * three-year-old who will happily use the rest of it.
 */
const ACTIVITY_WORDS = [
  'soft play', 'play area', 'playground', 'climbing', 'climb', 'trampolin', 'inflatable',
  'ball pit', 'slide', 'ride', 'rides', 'workshop', 'session', 'exhibition', 'exhibit',
  'gallery talk', 'tour', 'cinema', 'screening', 'swim', 'pool', 'gym', 'party', 'course',
  'adventure', 'maze', 'go-kart', 'laser', 'escape room', 'sensory room',
];

/** Wording that prices a ticket rather than restricting admission. A price is not a door. */
const PRICING_WORDS = ['free', 'ticket', 'admission is', 'price', 'pricing', 'cost', 'concession', '£', 'per child', 'per adult', 'entry is'];

/** Wording that limits a rule to a moment rather than to the venue. */
const TEMPORARY_WORDS = ['half term', 'half-term', 'this event', 'selected dates', 'during the', 'school holidays', 'christmas', 'easter', 'summer only', 'today only', 'special event'];

/** Height is not age, and conflating them is how a tall four-year-old gets a wrong answer. */
const HEIGHT_PATTERN = /\b\d{2,3}\s?cm\b|\bheight\b|\btall(er)?\b|\b\d(\.\d)?\s?m\b|\b\d{2,3}\s?kg\b|\bweigh/i;

/**
 * Units and nouns that prove a number is NOT an age.
 *
 * Learned from the real corpus, where a naive reading of "over N" produced "over 1 million
 * visitors" as a 12-month minimum and "over 8 persons" as an 8-year door. The audit is supposed
 * to measure whether the MODEL fits; letting the extractor invent rules would measure nothing.
 */
const NON_AGE_UNIT = new RegExp(
  '\\b\\d[\\d,.]*\\s*(million|thousand|hundred|acres?|species|people|persons?|visitors?|floors?|' +
  'square|sq|metres?|meters?|miles?|minutes?|hours?|days?|weeks?|rooms?|exhibits?|zones?|items?|' +
  'works?|paintings?|objects?|cm|kg|m|ft|%|pounds?)\\b',
  'i',
);

/**
 * Administrative wording that mentions an age without governing admission: benefit eligibility,
 * membership tiers, waivers, who may act as a carer. Real examples, all from the live corpus.
 */
const ADMIN_PATTERN = /\ballowance\b|\bDLA\b|\bPIP\b|\bpersonal independent\b|\beligibility\b|\bproof of\b|\bmembership\b|\bwaiver\b|\bcarer must\b|\bbenefit has been awarded\b|\bconcession\b/i;

/** The sentence must talk about a PERSON'S age, not merely contain a number. */
const AGE_CUE = /\bages?d?\b|\byears?\s*old\b|\bmonths?\s*old\b|\bchild(ren)?\b|\bkids?\b|\bbab(y|ies)\b|\binfants?\b|\btoddlers?\b|\badults?\b|\bunder-?\d+s\b|\bunder\s*\d+s\b|\byear olds?\b/i;

const POSITIVE_PATTERN = /\ball ages\s*(are\s*)?(welcome|admitted|catered)?\b|\bno age (restriction|limit)s?\b|\bsuitable for all ages\b|\bwelcome at any age\b|\bchildren of all ages\b/i;

const ACCOMPANIMENT_PATTERN = /\baccompanied\b|\bmust be with an adult\b|\bsupervised\b|\badult supervision\b|\bwith a (parent|carer|guardian|responsible adult)\b/i;

/** Wording that recommends rather than restricts. */
const RECOMMENDATION_PATTERN = /\brecommended\b|\bbest (for|suited)\b|\bideal for\b|\bsuitable for\b|\bdesigned for\b|\baimed at\b|\bgeared (to|towards)\b|\bperfect for\b/i;

/** Wording that restricts rather than recommends. */
const RESTRICTION_PATTERN = /\bnot admitted\b|\bnot permitted\b|\bnot allowed\b|\bno entry\b|\bmay not enter\b|\bare refused\b|\bonly\b|\bmust be (aged|over|under)\b|\brestricted to\b|\bminimum age\b|\bmaximum age\b|\badults? only\b|\bstrictly\b/i;

function yearsToMonths(years) {
  return Math.round(years * MONTHS_PER_YEAR);
}

function containsAny(text, words) {
  const lower = text.toLowerCase();
  return words.some((word) => lower.includes(word));
}

/**
 * Read a month interval out of one sentence, or return null.
 *
 * Returns null generously. Every shape not handled here becomes an "unreadable" candidate in the
 * report, which is the outcome that makes a model gap VISIBLE rather than silently absorbed.
 */
function readBounds(sentence) {
  const text = sentence.toLowerCase();

  // Strip number phrases whose unit proves they are not ages, so "over 1 million visitors"
  // cannot be read as a twelve-month minimum.
  const cleaned = text.replace(new RegExp(NON_AGE_UNIT.source, 'gi'), ' ');
  return readBoundsFrom(cleaned);
}

function readBoundsFrom(text) {

  // "under 6 months", "babies under 12 months"
  let m = text.match(/under\s*(\d{1,2})\s*months?/);
  if (m) return { minMonthsInclusive: Number(m[1]), maxMonthsExclusive: null, unit: 'months', form: 'under-N-months' };

  m = text.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*months?/);
  if (m) return { minMonthsInclusive: Number(m[1]), maxMonthsExclusive: Number(m[2]) + 1, unit: 'months', form: 'N-M-months' };

  // "under 4s", "under 4 years", "under 4"
  m = text.match(/under\s*(\d{1,2})s?\b(?!\s*(cm|months))/);
  if (m) return { minMonthsInclusive: yearsToMonths(Number(m[1])), maxMonthsExclusive: null, unit: 'years', form: 'under-N' };

  // "over 12s", "12 and over", "12+", "aged 12 or above"
  m = text.match(/(?:over|above)\s*(\d{1,2})s?\b|\b(\d{1,2})\s*(?:\+|plus)\b|\b(\d{1,2})s?\s*(?:and|or)\s*(?:over|above)\b/);
  if (m) {
    const n = Number(m[1] ?? m[2] ?? m[3]);
    return { minMonthsInclusive: yearsToMonths(n), maxMonthsExclusive: null, unit: 'years', form: 'N-and-over' };
  }

  // "ages 3-11", "3 to 11 years", "aged 5 - 12"
  m = text.match(/ages?\s*(\d{1,2})\s*(?:[-–]|to)\s*(\d{1,2})|\b(\d{1,2})\s*(?:[-–]|to)\s*(\d{1,2})\s*years?\b/);
  if (m) {
    const lo = Number(m[1] ?? m[3]);
    const hi = Number(m[2] ?? m[4]);
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo < hi) {
      return { minMonthsInclusive: yearsToMonths(lo), maxMonthsExclusive: yearsToMonths(hi + 1), unit: 'years', form: 'N-to-M' };
    }
  }

  // "12 and under", "under-5s and under"
  m = text.match(/\b(\d{1,2})s?\s*(?:and|or)\s*(?:under|below)\b/);
  if (m) return { minMonthsInclusive: null, maxMonthsExclusive: yearsToMonths(Number(m[1]) + 1), unit: 'years', form: 'N-and-under' };

  return null;
}

/**
 * What one sentence is, in B2's vocabulary.
 *
 * The order matters and encodes the fail-open ruling: anything that looks like pricing, height,
 * a recommendation or a moment in time is taken OUT of the door category before a door is
 * considered, because a false door hides a venue from every family who would have been admitted.
 */
function classifyAgeSentence(sentence) {
  const text = String(sentence ?? '').trim();
  const reasons = [];

  if (!AGE_SENTENCE.test(text)) return { category: 'no_age_signal', reasons: ['no age wording'], scope: null, effect: null, bounds: null };

  if (POSITIVE_PATTERN.test(text)) {
    reasons.push('states a positive/all-ages position');
    return {
      category: 'positive_all_ages', scope: null, effect: null, bounds: null, reasons,
      modelGap: 'B2 cannot represent an explicit positive statement; an empty rule set means absence, not "no restriction".',
    };
  }

  // A number is only an age if the sentence is talking about people's ages at all.
  if (!AGE_CUE.test(text)) {
    reasons.push('contains a number but no wording that makes it a person\'s age');
    return { category: 'not_an_age_statement', scope: null, effect: null, bounds: null, reasons };
  }

  /**
   * Rules about what a child may DO FOR SOMEONE ELSE, not about whether they may come in.
   *
   * The single worst false positive this audit found, and the reason this guard exists:
   *
   *   "Children under 16 are not permitted to accompany a disabled visitor as an Essential Companion."
   *
   * A naive read sees "under 16" + "not permitted" and calls it a door. Published, it would have
   * hidden that venue from every family with a child under 16 -- which is very nearly every
   * family this product serves -- on a sentence about carer eligibility. Nothing in the B2 model
   * was wrong; the EXTRACTOR was, which is exactly the risk B4 has to be protected from.
   */
  if (/\b(to |may |cannot |can(not|'t)? )?accompany\b|\bas an essential companion\b|\bessential companion\b|\bbe responsible for\b|\bcarer\b|\bsupervis(e|or)\b(?!\w)/i.test(text)
      && /\bnot permitted\b|\bnot allowed\b|\bcannot\b|\bmust be\b/i.test(text)
      && !/\bmust be accompanied\b|\bmust be with\b/i.test(text)) {
    reasons.push('governs who may act as a companion or carer, not who may be admitted');
    return { category: 'companion_role_not_admission', scope: null, effect: null, bounds: null, reasons };
  }

  if (ADMIN_PATTERN.test(text)) {
    reasons.push('administrative wording (eligibility, membership, waiver, carer), not admission');
    return { category: 'administrative_not_admission', scope: null, effect: null, bounds: null, reasons };
  }

  const bounds = readBounds(text);
  const isHeight = HEIGHT_PATTERN.test(text);
  const isPricing = containsAny(text, PRICING_WORDS);
  const isTemporary = containsAny(text, TEMPORARY_WORDS);
  const isActivity = containsAny(text, ACTIVITY_WORDS);
  const isAccompaniment = ACCOMPANIMENT_PATTERN.test(text);
  const recommends = RECOMMENDATION_PATTERN.test(text);
  const restricts = RESTRICTION_PATTERN.test(text);

  if (isHeight && !bounds) {
    reasons.push('height requirement, not an age rule');
    return { category: 'height_not_age', scope: null, effect: null, bounds: null, reasons };
  }

  if (!bounds) {
    reasons.push('age wording present but no interval could be read');
    return { category: 'insufficient_evidence', scope: null, effect: null, bounds: null, reasons };
  }

  /**
   * Real pages put two facts in one sentence: "children under 2 go free but the recommended age
   * is 6 and over" is a price AND a recommendation, and sentence-level reading has to pick one
   * label for two intervals. Flagged rather than silently resolved -- picking would attribute a
   * bound to the wrong fact, and the whole point of this audit is to surface that.
   */
  const signals = [isPricing && 'pricing', recommends && 'recommendation', restricts && 'restriction',
                   isAccompaniment && 'accompaniment', isActivity && 'activity'].filter(Boolean);
  if (signals.length > 1) {
    reasons.push(`one sentence carries more than one kind of age statement (${signals.join(' + ')})`);
    return {
      category: 'mixed_statement', scope: 'ambiguous', effect: 'caveat', bounds, reasons,
      mixedSignals: signals,
      modelGap: 'Sentence-level evidence cannot attribute one interval to the right fact when a sentence states two.',
    };
  }

  if (isPricing && !restricts) {
    reasons.push('prices a ticket rather than restricting admission');
    return { category: 'pricing_not_admission', scope: null, effect: null, bounds, reasons };
  }

  if (isAccompaniment) {
    reasons.push('states who must accompany a child, not who may enter');
    return { category: 'accompaniment', scope: 'accompaniment', effect: 'caveat', bounds, reasons };
  }

  if (isActivity) {
    reasons.push('rule attaches to an activity within the venue');
    return {
      category: 'activity_restriction', scope: 'activity', effect: 'caveat', bounds, reasons,
      activity: ACTIVITY_WORDS.find((w) => text.toLowerCase().includes(w)) ?? null,
    };
  }

  if (isTemporary) {
    reasons.push('limited to an event or period, not the venue');
    return { category: 'temporary_restriction', scope: 'ambiguous', effect: 'caveat', bounds, reasons };
  }

  if (recommends && !restricts) {
    reasons.push('recommends an age range; B1 says this ranks and explains, never excludes');
    return { category: 'recommendation', scope: null, effect: null, bounds, reasons };
  }

  if (restricts && !recommends) {
    reasons.push('states a condition of entry');
    return { category: 'venue_restriction', scope: 'venue', effect: 'excludes', bounds, reasons };
  }

  if (recommends && restricts) {
    reasons.push('mixes recommending and restricting wording; scope cannot be settled from the sentence');
    return { category: 'ambiguous_scope', scope: 'ambiguous', effect: 'caveat', bounds, reasons };
  }

  reasons.push('an interval with no wording that settles whether it admits or advises');
  return { category: 'ambiguous_scope', scope: 'ambiguous', effect: 'caveat', bounds, reasons };
}

/**
 * Whether B2, as shipped, would let this candidate become a hard gate -- and why not when not.
 *
 * Asked by building the rule B2 would actually see and running the REAL predicates over it, so
 * this cannot drift from the shipped semantics the way a restatement would.
 */
function wouldGateUnderB2(candidate, record) {
  const blockers = [];

  if (candidate.scope !== 'venue' || candidate.effect !== 'excludes') {
    blockers.push(`scope/effect is ${candidate.scope ?? 'none'}/${candidate.effect ?? 'none'}, and only venue+excludes may gate`);
  }
  if (!GATING_SOURCE_TYPES.has(record.sourceType)) {
    blockers.push(`source type ${record.sourceType} is not one the gate admits`);
  }
  if (!candidate.excerpt || candidate.excerpt.length < MIN_EVIDENCE_EXCERPT_CHARS) {
    blockers.push(`excerpt is shorter than the ${MIN_EVIDENCE_EXCERPT_CHARS}-character floor`);
  }

  // Run the real normaliser: if B2 cannot read the rule, it cannot gate on it.
  const rules = candidate.bounds
    ? normaliseAgeRules({
        rules: [{
          scope: candidate.scope, effect: candidate.effect,
          minMonthsInclusive: candidate.bounds.minMonthsInclusive,
          maxMonthsExclusive: candidate.bounds.maxMonthsExclusive,
          evidenceExcerpt: candidate.excerpt,
        }],
      })
    : [];
  if (rules.length === 0) blockers.push('normaliseAgeRules drops the rule as unreadable');
  else if (rules[0].effect !== 'excludes') blockers.push('normaliseAgeRules demotes the rule to a caveat');

  // Human approval is a separate, deliberate step: B3 writes nothing, so nothing is approved.
  blockers.push('no human approval exists (B3 is zero-write)');

  return { gates: false, blockers, humanReviewRequired: candidate.scope === 'venue' && candidate.effect === 'excludes' };
}

/** Split one page into the sentences worth classifying. */
function ageSentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 12 && s.length <= 400 && AGE_SENTENCE.test(s));
}

/**
 * The audit itself. Takes evidence records, returns candidates and catalogue-level measurements.
 *
 * `records` are `venue_source_evidence` rows as `rowToRecord` returns them, optionally with a
 * `venueName`. Nothing is written, nothing is fetched: this reads what has already been stored.
 */
function auditEvidence(records, { venueNames = {} } = {}) {
  const candidates = [];
  const venuesSeen = new Set();
  const venuesByCategory = {};
  const sourceTypeCounts = {};
  let pagesExamined = 0;
  let pagesWithAgeSignal = 0;

  for (const record of records || []) {
    pagesExamined += 1;
    venuesSeen.add(record.familypilotPlaceId);
    sourceTypeCounts[record.sourceType] = (sourceTypeCounts[record.sourceType] ?? 0) + 1;

    const sentences = record.ageSentences ?? ageSentences(record.extractedText);
    if (sentences.length > 0) pagesWithAgeSignal += 1;

    for (const sentence of sentences) {
      const classified = classifyAgeSentence(sentence);
      if (classified.category === 'no_age_signal') continue;

      const candidate = { ...classified, excerpt: sentence };
      const verdict = wouldGateUnderB2(candidate, record);

      candidates.push({
        familypilotPlaceId: record.familypilotPlaceId,
        venueName: venueNames[record.familypilotPlaceId] ?? record.venueName ?? null,
        sourceUrl: record.sourceUrl,
        sourceType: record.sourceType,
        retrievedAt: record.retrievedAt,
        excerpt: sentence,
        category: classified.category,
        proposedScope: classified.scope,
        proposedEffect: classified.effect,
        proposedMinMonthsInclusive: classified.bounds?.minMonthsInclusive ?? null,
        proposedMaxMonthsExclusive: classified.bounds?.maxMonthsExclusive ?? null,
        boundsForm: classified.bounds?.form ?? null,
        activity: classified.activity ?? null,
        wouldGateUnderB2: verdict.gates,
        whyNotGating: verdict.blockers,
        humanReviewRequired: verdict.humanReviewRequired,
        modelGap: classified.modelGap ?? null,
        reasons: classified.reasons,
      });

      (venuesByCategory[classified.category] ??= new Set()).add(record.familypilotPlaceId);
    }
  }

  const byCategory = {};
  for (const candidate of candidates) {
    byCategory[candidate.category] = (byCategory[candidate.category] ?? 0) + 1;
  }

  return {
    summary: {
      pagesExamined,
      pagesWithAgeSignal,
      venuesWithEvidence: venuesSeen.size,
      candidateCount: candidates.length,
      candidatesByCategory: byCategory,
      venuesByCategory: Object.fromEntries(Object.entries(venuesByCategory).map(([k, v]) => [k, v.size])),
      sourceTypeCounts,
      candidatesThatWouldGate: candidates.filter((c) => c.wouldGateUnderB2).length,
      candidatesNeedingHumanReview: candidates.filter((c) => c.humanReviewRequired).length,
      modelGaps: candidates.filter((c) => c.modelGap).length,
    },
    candidates,
  };
}

module.exports = {
  AGE_SENTENCE,
  ACTIVITY_WORDS,
  ageSentences,
  readBounds,
  classifyAgeSentence,
  wouldGateUnderB2,
  auditEvidence,
};
