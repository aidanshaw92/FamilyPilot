const { cleanEvidenceSnippet } = require('./evidence-text-utils');
const { extractPushchairEvidence } = require('./pushchair-evidence');
const { extractEnvironmentEvidence } = require('./environment-evidence');
const { isEligibleScope } = require('./source-identity');

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
      /visitor\s+car\s+park/i,
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
    yes: [/playground/i, /play\s+area/i],
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
    /visitor\s+car\s+park/i.test(sentence) ||
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
    !/\bon.?site\b|\bvisitor\s+car\s+park\b|\bparking\s+(?:is\s+)?available\b|\bparking\s+(?:is\s+)?provided\b/i.test(
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
  const value = sentence.trim();
  return /\?$/.test(value) || /^(?:are|is|do|does|can|where|what|when|how|will|have)\b/i.test(value) && !/[.!]\s*$/.test(value);
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
    if (fieldId === 'toilets' && (hasToiletNegation(sentence) || isScopedToiletClosure(sentence))) continue;
    if (fieldId === 'babyChanging' && !isExplicitBabyChangingStatement(sentence)) continue;
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
  isSuspiciousEmbeddedContent,
  isScopedToiletClosure,
  hasVenueWideToiletAbsence,
  FIELD_PATTERNS,
  cleanEvidenceSnippet,
};
