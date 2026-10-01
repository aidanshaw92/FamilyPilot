/**
 * Conservative environment extraction from explicit official wording only.
 * Does not infer from venue category or type.
 */

const { cleanEvidenceSnippet } = require('./evidence-text-utils');

const MIXED_PATTERNS = [
  /\bindoors?\b[^.!?]{0,50}\b(?:and|&)\b[^.!?]{0,50}\boutdoors?\b/i,
  /\boutdoors?\b[^.!?]{0,50}\b(?:and|&)\b[^.!?]{0,50}\bindoors?\b/i,
  /\bplay\s+outdoors?\b[^.!?]{0,40}\bindoors?\b/i,
  /\bindoors?\b[^.!?]{0,40}\bplay\s+outdoors?\b/i,
  /\bexplore[^.!?]{0,30}\bindoors?\b[^.!?]{0,40}\boutdoors?\b/i,
];

const INDOOR_PATTERNS = [/\bindoor\b/i, /\bindoors\b/i];

const OUTDOOR_PATTERNS = [/\boutdoor\b/i, /\boutdoors\b/i, /\bopen[\s-]air\b/i];

/**
 * Nouns that make "indoor"/"outdoor" describe a FEATURE rather than the venue.
 *
 * `environment` says what kind of place this is, because that is what the product does with it:
 * `match-explanations` renders `outdoor` as "Mostly outdoor" and `mixed` as "Mix of indoor and
 * outdoor areas", and `trusted-family-score` scores `outdoor` at 45 in rain against `mixed` at 82 and
 * `indoor` at 97, with the reason line "Outdoor venue -- today's forecast is rain". A venue that
 * merely HAS outdoor space is `mixed`; that value exists precisely for it.
 *
 * The extractor disagreed. Measured in production on 2026-10-01, of 15 active served
 * `environment = outdoor` claims, five are plainly wrong and every one of them comes from a facilities
 * list or a passing mention of a feature:
 *
 *   ASK Italian        "...BABY CHANGING OUTDOOR SEATING..."          (an indoor restaurant)
 *   Nando's            "...Wheelchair access Outdoor space Wi-fi..."  (an indoor restaurant)
 *   Wallace Collection "...directed to the outdoor seating area..."    (an indoor museum)
 *   Queen's House      "...Open-air skating..."                        (about a separate ice rink)
 *   Chiswick House     "...outdoor kids' camp to the grounds..."       (a third party's event)
 *
 * Because `outdoor` is scored at 45 in the wet, a parent looking for a rainy-day option was being
 * steered AWAY from indoor restaurants and an indoor museum by a facilities list.
 *
 * The list is closed and derived from the corpus rather than open-ended, and it is matched as
 * `(in|out)door <noun>` only, so "the venue is outdoors", "an open-air museum" and "play outdoors"
 * still establish the venue.
 */
const FEATURE_NOUNS = [
  'seating(?:\\s+area)?',
  'space(?:s)?',
  'area(?:s)?',
  'gym(?:s)?',
  'pool(?:s)?',
  'terrace(?:s)?',
  // `courtyard` was here and is deliberately not any more. The committed contract says
  // "Our indoor galleries and outdoor courtyard are both open today" is MIXED, while "The galleries
  // are entirely indoors. There is outdoor seating on the forecourt." is INDOOR -- so the product's
  // position is that a courtyard is part of the venue you can be in, and seating is furniture. While
  // `courtyard` sat in this list those two tests could not both hold on masked text, and the only
  // reason they appeared to was that the mixed short-circuit read the sentence unmasked. That is the
  // same unmasked read that published `environment = mixed` for the Horniman from "Indoor and outdoor
  // seating is available for Cafe purchases only". Removing it aligns the list with the contract
  // rather than changing the contract to suit the list.
  'patio(?:s)?',
  'court(?:s)?',
  'pitch(?:es)?',
  'dining',
  'bar(?:s)?',
  'caf[eé](?:s)?',
  'restaurant(?:s)?',
  'play(?:\\s+area(?:s)?)?',
  'soft\\s+play(?:\\s+centre|\\s+center|\\s+area)?',
  'picnic(?:\\s+area(?:s)?)?',
  'therapy',
  'part(?:y|ies)',
  'camp(?:s)?',
  'session(?:s)?',
  'market(?:s)?',
  'cinema(?:s)?',
  'skating',
  // `skating` alone was derived from one wording of one page and missed the next. Queen's House's
  // stored evidence said "Open-air skating"; the live page now says "the most beautiful outdoor ice
  // rink in London", and the indoor Greenwich museum went back to `outdoor` on the first refetch
  // after the claim was withdrawn. Same separate attraction, same defect, a different noun.
  '(?:ice\\s+)?rink(?:s)?',
  'swimming(?:\\s+pool)?',
  'track(?:s)?',
  'trail(?:s)?',
  'stage(?:s)?',
  'screen(?:s)?',
  'toilet(?:s)?',
  'seat(?:s)?',
  'table(?:s)?',
];

/**
 * `open-air` is included as a prefix, not just `indoor`/`outdoor`. Queen's House is the case that
 * demands it: its stored evidence is "Open-air skating ... Museum entry not included", which is a
 * feature of a separate ice rink, and it made an indoor museum `outdoor`. "An open-air museum" still
 * reads venue-level, because `museum` is not a feature noun.
 */
/**
 * Nouns that name a VENUE rather than a feature of one. The modifier run below may not cross one.
 *
 * Belmont Children's Farm is why this exists, and it was a regression in the first version of this
 * module rather than a theory. Its home page reads "Indoor & Outdoor Visitors Farm Soft Play Cafe",
 * and `soft play` is a feature noun two words further on, so the run matched
 * "Outdoor Visitors Farm Soft Play" and masked the venue's own "Outdoor". The farm came out
 * `indoor` -- off a sentence that says "Indoor & Outdoor" in as many words. Caught by replaying the
 * live pipeline against production, not by the unit tests, because no fixture happened to put a
 * venue noun between a prefix and a feature noun.
 *
 * The rule this encodes: if the word after `outdoor` names the venue, then `outdoor` describes the
 * venue, and masking it discards exactly the signal this field exists to carry.
 */
const VENUE_NOUNS = [
  'farm', 'farmyard', 'museum', 'gallery', 'park', 'zoo', 'aquarium', 'house', 'palace',
  'castle', 'garden', 'gardens', 'cent(?:re|er)', 'venue', 'site', 'attraction', 'visitor',
  'visitors', 'reserve', 'wood', 'woods', 'forest', 'common', 'heath',
];

/**
 * Up to two modifiers may sit between the prefix and the feature noun, because production puts them
 * there: Burgess Park's "a single outdoor basketball court" and Chiswick House's "its outdoor kids'
 * camp" both have one, and an earlier version of this pattern missed both. The run is bounded to word
 * characters, apostrophes and hyphens, so it cannot reach across punctuation into the next clause --
 * and, per VENUE_NOUNS above, it cannot reach across the name of the venue either.
 */
const FEATURE_PHRASE = new RegExp(
  `\\b(?:(?:in|out)door|open[\\s-]air)\\s+`
    + `(?:(?!(?:${VENUE_NOUNS.join('|')})\\b)[\\w’'&/-]+\\s+){0,2}`
    + `(?:${FEATURE_NOUNS.join('|')})\\b`,
  'gi',
);

/**
 * Does this sentence say something about the VENUE's setting, as opposed to listing a feature?
 *
 * Returns `{ indoor, outdoor }`. Both false means the sentence has nothing venue-level to say, even
 * if the words "indoor" or "outdoor" appear in it.
 */
/**
 * Remove every feature phrase from a sentence, leaving only wording that could be venue-level.
 *
 * Extracted into its own function because having the mask applied in ONE place and not the other is
 * exactly how a feature phrase reached production as a venue verdict. Both the mixed test and
 * `venueLevelSetting` must see the same masked text, or the two disagree and the unmasked one wins.
 */
function maskFeaturePhrases(sentence) {
  return String(sentence ?? '').replace(FEATURE_PHRASE, ' ');
}

function venueLevelSetting(sentence) {
  const withoutFeatures = maskFeaturePhrases(sentence);
  return {
    indoor: INDOOR_PATTERNS.some((re) => re.test(withoutFeatures)),
    outdoor: OUTDOOR_PATTERNS.some((re) => re.test(withoutFeatures)),
  };
}

function buildAnalysisText(text, pageTitle) {
  const parts = [];
  if (pageTitle && typeof pageTitle === 'string') parts.push(pageTitle.trim());
  if (text && typeof text === 'string') parts.push(text.trim());
  return parts.filter(Boolean).join(' ');
}

function splitSentences(text) {
  return text
    .split(/(?:\n|\r|•|·|\u2022|(?<=[.!?])\s+)/)
    .map((s) => s.replace(/^[\s\-–—*]+/, '').trim())
    .filter((s) => s.length > 10);
}

function extractEnvironmentEvidenceClause(text) {
  const clausePatterns = [
    /whatever the weather[^.!?]{10,180}/i,
    /[^.!?]{0,30}indoors?\s+and\s+(?:play\s+)?outdoors?[^.!?]{0,80}/i,
    /[^.!?]{0,30}outdoors?\s+and\s+[^.!?]{0,30}indoors?[^.!?]{0,80}/i,
    /[^.!?]{0,40}\bindoor\b[^.!?]{0,80}/i,
    /[^.!?]{0,40}\boutdoor\b[^.!?]{0,80}/i,
    /[^.!?]{0,40}\bopen[\s-]air\b[^.!?]{0,80}/i,
  ];

  for (const pattern of clausePatterns) {
    const match = text.match(pattern);
    if (match) {
      const cleaned = cleanEvidenceSnippet(match[0]);
      if (cleaned && cleaned.length >= 12) return cleaned;
    }
  }

  return cleanEvidenceSnippet(text.length > 200 ? text.slice(-200) : text);
}

/**
 * Resolution is over the WHOLE page, not the first sentence that matches a tier.
 *
 * The previous version scanned for an indoor-only sentence before an outdoor-only one and returned on
 * the first hit, which made `mixed` nearly unreachable: a page documenting its indoor galleries in one
 * sentence and its outdoor courtyard in another came out `indoor`, and reversing the order of those
 * sentences changed nothing. Production shows the effect -- 15 `outdoor` and 6 `indoor` claims against
 * only 2 `mixed`, for a London catalogue of parks, museums and farms.
 *
 * A venue evidenced as both is `mixed`, which is the value the product defines for it and which
 * `day-request-matcher` already treats as satisfying an indoor request and an outdoor one alike.
 */
function classifyEnvironment(analysisText) {
  if (!analysisText) return null;

  const sentences = splitSentences(analysisText);

  /**
   * The "says both in one sentence" short-circuit. It tests the MASKED sentence, which it did not
   * always do, and that was a live defect rather than a hypothetical: the Horniman's
   * "Indoor and outdoor seating is available for Cafe purchases only" matched a mixed pattern on the
   * raw text and published `environment = mixed` for an indoor museum, while `venueLevelSetting`
   * on the very same sentence correctly reported neither side. Cafe seating is a feature; the whole
   * point of this field is that it describes the venue.
   */
  for (const sentence of sentences) {
    if (MIXED_PATTERNS.some((re) => re.test(maskFeaturePhrases(sentence)))) {
      return { value: 'mixed', confidence: 'high', evidenceText: extractEnvironmentEvidenceClause(sentence) };
    }
  }

  // Gathered across the whole page. A single sentence carrying both still wins outright, because it
  // is the clearest statement available, but two separate sentences now reach `mixed` too.
  let indoorSentence = null;
  let outdoorSentence = null;

  for (const sentence of sentences) {
    const { indoor, outdoor } = venueLevelSetting(sentence);
    if (indoor && outdoor) {
      return { value: 'mixed', confidence: 'high', evidenceText: extractEnvironmentEvidenceClause(sentence) };
    }
    if (indoor && !indoorSentence) indoorSentence = sentence;
    if (outdoor && !outdoorSentence) outdoorSentence = sentence;
  }

  if (indoorSentence && outdoorSentence) {
    // Both evidenced, in different sentences. The excerpt leads with the indoor one and names the
    // outdoor one, so a reviewer can see both halves of the verdict rather than half of it.
    const indoorClause = extractEnvironmentEvidenceClause(indoorSentence);
    const outdoorClause = extractEnvironmentEvidenceClause(outdoorSentence);
    return {
      value: 'mixed',
      confidence: 'high',
      evidenceText: `${indoorClause} / ${outdoorClause}`,
    };
  }

  if (indoorSentence) {
    return { value: 'indoor', confidence: 'high', evidenceText: extractEnvironmentEvidenceClause(indoorSentence) };
  }
  if (outdoorSentence) {
    return { value: 'outdoor', confidence: 'high', evidenceText: extractEnvironmentEvidenceClause(outdoorSentence) };
  }

  return null;
}

function extractEnvironmentEvidence(text, sourceMeta) {
  const analysisText = buildAnalysisText(text, sourceMeta?.pageTitle);
  const classification = classifyEnvironment(analysisText);
  if (!classification) return null;

  const evidenceText = cleanEvidenceSnippet(classification.evidenceText);
  if (!evidenceText) return null;

  return {
    field: 'environment',
    value: classification.value,
    confidence: classification.confidence,
    evidenceText,
    sourceUrl: sourceMeta.url,
    sourceType: sourceMeta.sourceType,
    retrievedAt: sourceMeta.retrievedAt,
  };
}

module.exports = {
  extractEnvironmentEvidence,
  classifyEnvironment,
  buildAnalysisText,
  venueLevelSetting,
  maskFeaturePhrases,
  MIXED_PATTERNS,
  FEATURE_PHRASE,
};
