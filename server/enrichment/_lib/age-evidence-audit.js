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

const {
  normaliseAgeRules,
  claimMayGate,
  agePolicyFieldKey,
  GATING_SOURCE_TYPES,
  MIN_EVIDENCE_EXCERPT_CHARS,
} = require('./age-policy');

/** A stamped identity used only to ask "what if a person approved this?". Never written. */
const SYNTHETIC_HUMAN = 'human:b3-audit';

/** Sentences worth looking at. Deliberately broad: precision comes from classification, not this. */
const AGE_SENTENCE = new RegExp(
  [
    'under\\s*\\d', 'over\\s*\\d', '\\d\\s*(\\+|plus)(?!\\d)', 'ages?\\s*\\d',
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
  'works?|paintings?|objects?|rides?|attractions?|experiences?|animals?|figures?|brands?|' +
  'histories|cm|kg|m|ft|%|pounds?)\\b' +
  // "over 260 years of Wedgwood" is not an age; "over 12 years old" is. Only the second keeps its number.
  '|\\b\\d[\\d,.]*\\s*years?\\b(?!\\s*old)',
  'i',
);

/**
 * Above this, a number is not a child-admission age.
 *
 * Learned from the corpus, where "50+ thrilling exhibits" became a 50-year minimum and "over 25
 * rides" a 25-year one. This product plans days out for families, so an admission bound above 21
 * is not a rule about the children it serves. "Adults only, 18+" still fits underneath.
 */
const MAX_PLAUSIBLE_AGE_MONTHS = 21 * 12;

/**
 * Administrative wording that mentions an age without governing admission: benefit eligibility,
 * membership tiers, waivers, who may act as a carer. Real examples, all from the live corpus.
 */
const ADMIN_PATTERN = /\ballowance\b|\bDLA\b|\bPIP\b|\bpersonal independent\b|\beligibility\b|\bproof of\b|\bmembership\b|\bwaiver\b|\bcarer must\b|\bbenefit has been awarded\b|\bconcession\b/i;

/** The sentence must talk about a PERSON'S age, not merely contain a number. */
const AGE_CUE = /\bages?d?\b|\byears?\s*old\b|\bmonths?\s*old\b|\bchild(ren)?\b|\bkids?\b|\bbab(y|ies)\b|\binfants?\b|\btoddlers?\b|\badults?\b|\bunder-?\d+s\b|\b(?:under|over|above)\s*\d+s?\b|\byear olds?\b|\b\d{1,2}\s*(?:\+|plus)(?!\d)/i;

/**
 * Positive wording that is genuinely ABOUT ADMISSION, as opposed to copy describing how broadly
 * enjoyable a place is. "Children of all ages are welcome" is evidence; "fun for all ages" is not.
 */
const ADMISSION_POSITIVE = /\bno age (restriction|limit)s?\b|\bno minimum age\b|\ball ages\s*(are\s*)?(welcome|admitted)\b|\bchildren of all ages are (welcome|admitted)\b|\bwelcome at any age\b/i;

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
/**
 * Stage one: the age set the sentence MENTIONS. Says nothing about who may come in.
 *
 * Splitting this from the admitted interval is the fix for a real inversion: the previous parser
 * mapped "over 12" straight to a MINIMUM, so "children aged 12 and over are not admitted" came
 * out as "admits 12 and over" -- precisely the ages the sentence excludes, while excluding the
 * younger children it admits. A lexical reading cannot produce a door until the sentence's
 * polarity is known, so it no longer tries.
 */
function readAgeSet(sentence) {
  const set = readAgeSetRaw(sentence);
  if (!set) return null;
  const bounds = [set.months, set.fromMonths, set.toMonths].filter((v) => typeof v === 'number');
  if (bounds.some((v) => v > MAX_PLAUSIBLE_AGE_MONTHS)) return null;
  return set;
}

function readAgeSetRaw(sentence) {
  const text = String(sentence ?? '').toLowerCase();
  // Strip number phrases whose unit proves they are not ages ("over 1 million visitors").
  const cleaned = text.replace(new RegExp(NON_AGE_UNIT.source, 'gi'), ' ');

  let m = cleaned.match(/under\s*(\d{1,2})\s*months?/);
  if (m) return { kind: 'below', months: Number(m[1]), inclusive: false, unit: 'months', form: 'under-N-months' };

  m = cleaned.match(/(\d{1,2})\s*[-\u2013]\s*(\d{1,2})\s*months?/);
  if (m) return { kind: 'band', fromMonths: Number(m[1]), toMonths: Number(m[2]), unit: 'months', form: 'N-M-months' };

  // "N and under", "N or younger", "up to N" -- the bound itself is included.
  m = cleaned.match(/\b(\d{1,2})s?\s*(?:and|or)\s*(?:under|below|younger)\b|\bup to\s*(\d{1,2})\b/);
  if (m) {
    const n = Number(m[1] ?? m[2]);
    return { kind: 'below', months: yearsToMonths(n), inclusive: true, unit: 'years', form: 'N-and-under' };
  }

  // "under N", "under Ns" -- the bound itself is excluded.
  m = cleaned.match(/under\s*(?:the age of\s*)?(\d{1,2})s?\b/);
  if (m) return { kind: 'below', months: yearsToMonths(Number(m[1])), inclusive: false, unit: 'years', form: 'under-N' };

  // "N and over", "N+", "aged N or above" -- the bound itself is included.
  m = cleaned.match(/\b(\d{1,2})\s*(?:\+|plus)(?!\d)|\b(\d{1,2})s?\s*(?:and|or)\s*(?:over|above|older)\b/);
  if (m) {
    const n = Number(m[1] ?? m[2]);
    return { kind: 'above', months: yearsToMonths(n), inclusive: true, unit: 'years', form: 'N-and-over' };
  }

  // "over N", "above N" -- ambiguous in English about whether N itself is included.
  m = cleaned.match(/(?:over|above)\s*(\d{1,2})s?\b/);
  if (m) return { kind: 'above', months: yearsToMonths(Number(m[1])), inclusive: false, unit: 'years', form: 'over-N' };

  // "ages 3-11", "3 to 11 years", "aged 5 - 12"
  m = cleaned.match(/ages?\s*(\d{1,2})\s*(?:[-\u2013]|to)\s*(\d{1,2})|\b(\d{1,2})\s*(?:[-\u2013]|to)\s*(\d{1,2})\s*years?\b/);
  if (m) {
    const lo = Number(m[1] ?? m[3]);
    const hi = Number(m[2] ?? m[4]);
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo < hi) {
      return { kind: 'band', fromMonths: yearsToMonths(lo), toMonths: yearsToMonths(hi), unit: 'years', form: 'N-to-M' };
    }
  }

  return null;
}

/** Wording that says the mentioned ages are TURNED AWAY. */
const EXCLUDES_PATTERN = /\bnot admitted\b|\bnot permitted\b|\bnot allowed\b|\bno entry\b|\bmay not enter\b|\bcannot enter\b|\bare refused\b|\bprohibited\b/i;

/** Wording that says the mentioned ages are THE ONES LET IN. */
const ADMITTED_SET_PATTERN = /\bonly\b|\brestricted to\b|\blimited to\b|\bminimum age\b|\bmaximum age\b|\bmust be (?:aged|over|under|at least)\b/i;

/**
 * Which way round the sentence's age set points.
 *
 * `excluded`     the mentioned ages are turned away
 * `admitted_set` the mentioned ages are the ones let in
 * `described`    the ages are being talked about (recommended, priced, catered for), not gated
 */
function detectPolarity(text) {
  if (EXCLUDES_PATTERN.test(text)) return 'excluded';
  if (ADMITTED_SET_PATTERN.test(text)) return 'admitted_set';
  return 'described';
}

/**
 * Stage two: turn a mentioned age set plus a polarity into the interval B2 would ADMIT.
 *
 * Returns null wherever the transformation is not unambiguous, which fails open: no interval means
 * no door. Where English is ambiguous about whether a bound is included ("over 12s" may mean 12+
 * or 13+), the bound that admits MORE children is chosen, for the same reason -- a wrong guess
 * should show a venue that turns a family away, never hide one that would have let them in.
 */
function toAdmittedInterval(ageSet, polarity) {
  if (!ageSet) return null;

  if (polarity === 'excluded') {
    if (ageSet.kind === 'below') {
      // Under-Ns turned away, so admission starts at the bound (or just past it when inclusive).
      return { minMonthsInclusive: ageSet.inclusive ? ageSet.months + monthStep(ageSet) : ageSet.months, maxMonthsExclusive: null };
    }
    if (ageSet.kind === 'above') {
      // Over-Ns turned away, so admission stops at the bound. Ambiguity resolved upwards.
      return { minMonthsInclusive: null, maxMonthsExclusive: ageSet.inclusive ? ageSet.months : ageSet.months + monthStep(ageSet) };
    }
    // A band turned away leaves two disjoint admitted ranges, which B2 cannot represent.
    return null;
  }

  if (polarity === 'admitted_set') {
    if (ageSet.kind === 'above') {
      return { minMonthsInclusive: ageSet.inclusive ? ageSet.months : ageSet.months + monthStep(ageSet), maxMonthsExclusive: null };
    }
    if (ageSet.kind === 'below') {
      return { minMonthsInclusive: null, maxMonthsExclusive: ageSet.inclusive ? ageSet.months + monthStep(ageSet) : ageSet.months };
    }
    return { minMonthsInclusive: ageSet.fromMonths, maxMonthsExclusive: ageSet.toMonths + monthStep(ageSet) };
  }

  // `described`: the ages are an audience, not a door. No admitted interval is implied.
  return null;
}

/** One step in whatever unit the set was written in, so a year rule does not shift by a month. */
function monthStep(ageSet) {
  return ageSet.unit === 'months' ? 1 : MONTHS_PER_YEAR;
}

/**
 * The band a `described` sentence talks about, for reporting only. Never an admission interval.
 */
function describedBand(ageSet) {
  if (!ageSet) return null;
  if (ageSet.kind === 'band') return { minMonthsInclusive: ageSet.fromMonths, maxMonthsExclusive: ageSet.toMonths + monthStep(ageSet) };
  if (ageSet.kind === 'above') return { minMonthsInclusive: ageSet.months, maxMonthsExclusive: null };
  return { minMonthsInclusive: null, maxMonthsExclusive: ageSet.months };
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
    /**
     * "Suitable for all ages 4+" is not an all-ages statement. Reading the positive half and
     * discarding the qualifier would turn contradictory marketing copy into the strongest
     * possible evidence that a venue admits everyone -- the exact opposite of what it says.
     * A positive claim only counts when nothing qualifies it.
     */
    const qualifier = readAgeSet(text);
    if (qualifier) {
      reasons.push('positive wording carried a numeric qualifier, so it is not an unconditional welcome');
      return {
        category: 'qualified_positive', scope: 'ambiguous', effect: 'caveat',
        mentionedAgeSet: qualifier, bounds: describedBand(qualifier), reasons,
        modelGap: 'Positive wording contradicted by its own bound; neither an all-ages fact nor a door.',
      };
    }
    if (ADMISSION_POSITIVE.test(text)) {
      reasons.push('states positively that there is no age bar to entry');
      return {
        category: 'positive_all_ages', scope: null, effect: null, bounds: null, reasons,
        modelGap: 'B2 cannot represent an explicit positive statement; an empty rule set means absence, not "no restriction".',
      };
    }
    reasons.push('all-ages wording used to describe an experience rather than admission');
    return { category: 'marketing_all_ages', scope: null, effect: null, bounds: null, reasons };
  }

  // A number is only an age if the sentence is talking about people's ages at all -- asked of the
  // text with non-age number phrases removed, so "over 1 million visitors" is not age wording.
  const withoutUnits = text.replace(new RegExp(NON_AGE_UNIT.source, 'gi'), ' ');
  if (!AGE_CUE.test(withoutUnits)) {
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

  const ageSet = readAgeSet(text);
  const polarity = detectPolarity(text);
  const admitted = toAdmittedInterval(ageSet, polarity);
  // For anything that is not a door, the interval reported is the band the sentence DESCRIBES.
  const bounds = describedBand(ageSet);
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

  if (!ageSet) {
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
    if (!admitted) {
      /**
       * A condition of entry whose admitted interval cannot be derived unambiguously -- a band
       * that is excluded leaves two disjoint admitted ranges, and `described` polarity implies no
       * door at all. Failing open here is the whole point: no interval, no gate.
       */
      reasons.push('states a condition of entry, but the admitted interval cannot be derived unambiguously');
      return { category: 'ambiguous_scope', scope: 'ambiguous', effect: 'caveat', mentionedAgeSet: ageSet, bounds, reasons,
               modelGap: 'An entry condition whose admitted set B2 cannot represent.' };
    }
    reasons.push(`states a condition of entry (${polarity === 'excluded' ? 'the stated ages are turned away' : 'the stated ages are the ones admitted'})`);
    return {
      category: 'venue_restriction', scope: 'venue', effect: 'excludes',
      mentionedAgeSet: ageSet, polarity, bounds: admitted, reasons,
    };
  }

  if (recommends && restricts) {
    reasons.push('mixes recommending and restricting wording; scope cannot be settled from the sentence');
    return { category: 'ambiguous_scope', scope: 'ambiguous', effect: 'caveat', bounds, reasons };
  }

  reasons.push('an interval with no wording that settles whether it admits or advises');
  return { category: 'ambiguous_scope', scope: 'ambiguous', effect: 'caveat', bounds, reasons };
}

/**
 * Two different questions, which the previous revision conflated into one meaningless answer.
 *
 * `wouldGateNow` is always false, by construction: B3 writes nothing, so no claim and no human
 * approval exist. Reporting that as "would become a hard gate: 0" said only "B3 is zero-write",
 * which is true of every possible corpus including a perfect official-page prohibition.
 *
 * `eligibleToGateIfHumanApproved` is the question actually worth asking: if a person reviewed and
 * approved this exact sentence tomorrow, would B2 turn it into a door? It is answered by building
 * a synthetic claim IN MEMORY -- nothing is stored -- and running the REAL `claimMayGate` and
 * `normaliseAgeRules`, so it cannot drift from the shipped semantics.
 */
function wouldGateUnderB2(candidate, record, today = new Date().toISOString().slice(0, 10)) {
  const blockers = [];
  const isDoor = candidate.scope === 'venue' && candidate.effect === 'excludes';

  if (!isDoor) {
    blockers.push(`scope/effect is ${candidate.scope ?? 'none'}/${candidate.effect ?? 'none'}, and only venue+excludes may gate`);
  }
  if (!candidate.bounds || (candidate.bounds.minMonthsInclusive == null && candidate.bounds.maxMonthsExclusive == null)) {
    blockers.push('no admitted interval could be derived from the sentence');
  }

  // A claim exactly as a human approval would produce it, held only in this function.
  const syntheticClaim = {
    status: 'active',
    fieldKey: agePolicyFieldKey(record.sourceUrl),
    sourceUrl: record.sourceUrl,
    sourceType: record.sourceType,
    sourceEvidenceId: 'b3-audit-synthetic',
    confidence: 'high',
    approvedBy: SYNTHETIC_HUMAN,
    checkedAt: today,
    validUntil: today,
    valueJson: {
      rules: [{
        scope: candidate.scope,
        effect: candidate.effect,
        minMonthsInclusive: candidate.bounds?.minMonthsInclusive ?? null,
        maxMonthsExclusive: candidate.bounds?.maxMonthsExclusive ?? null,
        evidenceExcerpt: candidate.excerpt,
      }],
    },
  };

  if (!GATING_SOURCE_TYPES.has(record.sourceType)) {
    blockers.push(`source type ${record.sourceType} is not one the gate admits`);
  }
  if (!candidate.excerpt || candidate.excerpt.length < MIN_EVIDENCE_EXCERPT_CHARS) {
    blockers.push(`excerpt is shorter than the ${MIN_EVIDENCE_EXCERPT_CHARS}-character floor`);
  }
  if (!claimMayGate(syntheticClaim, today)) {
    blockers.push('claimMayGate refuses the claim even with a human approval');
  }
  const rules = normaliseAgeRules(syntheticClaim.valueJson);
  if (rules.length === 0) blockers.push('normaliseAgeRules drops the rule as unreadable');
  else if (rules[0].effect !== 'excludes') blockers.push('normaliseAgeRules demotes the rule to a caveat');

  return {
    // Never true in B3: there is no claim and nobody has approved anything.
    wouldGateNow: false,
    eligibleToGateIfHumanApproved: blockers.length === 0,
    blockers,
    humanReviewRequired: isDoor,
  };
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
function auditEvidence(records, { venueNames = {} } = {}, today = new Date().toISOString().slice(0, 10)) {
  const candidates = [];
  const skipped = [];
  const venuesSeen = new Set();
  const venuesByCategory = {};
  const pageSourceTypeCounts = {};
  const candidateSourceTypeCounts = {};
  const uniqueSentenceText = new Set();
  const pagesSeen = new Set();
  // Per call, not module level: shared mutable state across runs would make results order-dependent.
  const pagesWithAgeSignalSeen = new Set();

  let sentenceOccurrences = 0;
  let pagesWithAgeSignal = 0;

  for (const record of records || []) {
    venuesSeen.add(record.familypilotPlaceId);

    /**
     * Live mode hands one record per evidence PAGE; `--file` hands one record per SENTENCE. The
     * previous revision counted records into a single `sourceTypeCounts`, so the same field meant
     * "pages by source type" live and "statements by source type" offline -- two different
     * denominators wearing one name. Pages are now counted by identity, so both modes agree.
     */
    const pageKey = `${record.familypilotPlaceId}~${record.sourceUrl}`;
    if (!pagesSeen.has(pageKey)) {
      pagesSeen.add(pageKey);
      pageSourceTypeCounts[record.sourceType] = (pageSourceTypeCounts[record.sourceType] ?? 0) + 1;
    }

    const sentences = record.ageSentences ?? ageSentences(record.extractedText);
    if (sentences.length > 0 && !pagesWithAgeSignalSeen.has(pageKey)) {
      pagesWithAgeSignalSeen.add(pageKey);
      pagesWithAgeSignal += 1;
    }

    for (const sentence of sentences) {
      sentenceOccurrences += 1;
      uniqueSentenceText.add(sentence);

      const classified = classifyAgeSentence(sentence);
      if (classified.category === 'no_age_signal') {
        // Counted, never silently dropped: every input must appear on one side of the ledger.
        skipped.push({ familypilotPlaceId: record.familypilotPlaceId, sourceUrl: record.sourceUrl, sentence, reason: 'no age wording' });
        continue;
      }

      const candidate = { ...classified, excerpt: sentence };
      const isDoor = classified.scope === 'venue' && classified.effect === 'excludes';
      const verdict = wouldGateUnderB2(candidate, record, today);
      candidateSourceTypeCounts[record.sourceType] = (candidateSourceTypeCounts[record.sourceType] ?? 0) + 1;

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
        polarity: classified.polarity ?? null,
        mentionedAgeSet: classified.mentionedAgeSet ?? null,
        /**
         * Two different things, deliberately not sharing a name. An ADMITTED interval is what B2
         * would gate on; a MENTIONED band is merely the ages a sentence talks about. A caveat's
         * band reported under an "admitted" name would read as a door to anyone skimming.
         */
        admittedMinMonthsInclusive: isDoor ? classified.bounds?.minMonthsInclusive ?? null : null,
        admittedMaxMonthsExclusive: isDoor ? classified.bounds?.maxMonthsExclusive ?? null : null,
        mentionedMinMonths: classified.bounds?.minMonthsInclusive ?? null,
        mentionedMaxMonths: classified.bounds?.maxMonthsExclusive ?? null,
        activity: classified.activity ?? null,
        wouldGateNow: verdict.wouldGateNow,
        eligibleToGateIfHumanApproved: verdict.eligibleToGateIfHumanApproved,
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
      // The ledger: every sentence that went in comes out on exactly one side.
      sentenceOccurrences,
      uniqueSentenceText: uniqueSentenceText.size,
      classified: candidates.length,
      explicitlySkipped: skipped.length,
      accountsFor: sentenceOccurrences === candidates.length + skipped.length,
      pagesExamined: pagesSeen.size,
      pagesWithAgeSignal,
      venuesWithEvidence: venuesSeen.size,
      candidatesByCategory: byCategory,
      venuesByCategory: Object.fromEntries(Object.entries(venuesByCategory).map(([k, v]) => [k, v.size])),
      pageSourceTypeCounts,
      candidateSourceTypeCounts,
      wouldGateNow: candidates.filter((c) => c.wouldGateNow).length,
      eligibleToGateIfHumanApproved: candidates.filter((c) => c.eligibleToGateIfHumanApproved).length,
      candidatesNeedingHumanReview: candidates.filter((c) => c.humanReviewRequired).length,
      modelGaps: candidates.filter((c) => c.modelGap).length,
    },
    candidates,
    skipped,
  };
}

module.exports = {
  AGE_SENTENCE,
  ACTIVITY_WORDS,
  ageSentences,
  readAgeSet,
  detectPolarity,
  toAdmittedInterval,
  classifyAgeSentence,
  wouldGateUnderB2,
  auditEvidence,
};
