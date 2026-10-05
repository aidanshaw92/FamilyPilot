import { FacilityType, FamilyProfile, FamilyMember, Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { WeatherInfo } from '@/src/types';
import { evaluateAgeAdmission } from '@/src/services/matching/age-admission';
import { childAgeMonths } from '@/src/services/matching/age-suitability';
import { childAgeVerdicts, joinNames, outsideRangeCautions, suitsChildrenLine } from '@/src/utils/child-fit';
import { childUsesBuggy, familyNeedsStepFree, familyUsesBuggy } from '@/src/utils/family-mobility';
import { describeOpeningToday, OpeningTodayState } from '@/src/utils/opening-today';
import { evaluateRoutineFit } from '@/src/utils/routine-fit';
import { isUnreviewedEnrichmentStatus } from '@/src/utils/enrichment-rules';

/**
 * Family Match: whether a place will work for THIS family today, and why, derived from the household, the venue's
 * evidence and today's context.
 *
 * WHAT THIS REPLACES. The Family Fit number is a weighted blend in which every fact nobody has checked is replaced by
 * a neutral default (an unknown age range scores 75, an unknown buggy score 70, "good weather" is guessed from the
 * category, and so on). That keeps the blend defined, and it also meant a place with no evidence at all could score
 * 4.6 out of 5 and be called "Good fit" while breaching the family's drive limit or missing something they said they
 * need. The number is therefore still used to RANK, and no longer decides what a parent is TOLD.
 *
 * THE RULES.
 *  - A reason is shown only for a fact that is confirmed (or computed from the schedule and the clock). Nothing is
 *    inferred from a category.
 *  - A confirmed breach of something the family needs (a must-have facility confirmed absent, closed all day today, a
 *    door policy that does not admit a child, every child outside the recommended ages, buggy access reviewed as
 *    difficult for a family with a buggy) makes the verdict `poor`.
 *  - A requirement that is simply UNKNOWN (a must-have nobody has checked, buggy access for a family with a buggy,
 *    step-free access for a child who needs it) caps the verdict at `possible`, and is said as "still to be checked",
 *    never as a fit and never as a failure.
 *  - `excellent` needs several confirmed positives, at least two of them facts about the venue, and nothing left to
 *    check. `good` needs at least two confirmed positives and nothing against.
 *  - Children are named only where a fact is about that child (the recommended ages include them, their buggy is
 *    covered, their nap is respected, baby changing for a baby), so "Good for Sloane today" is a claim with evidence.
 *  - A place FamilyPilot has not reviewed is `not_reviewed`, whatever the number says; the logistics that ARE known
 *    (open today, how far) are still stated.
 */
export type MatchVerdict = 'excellent' | 'good' | 'possible' | 'poor' | 'not_reviewed';

export interface MatchLine {
  /** Stable key for lists and tests. */
  key: string;
  text: string;
}

export interface FamilyMatchResult {
  verdict: MatchVerdict;
  /** The sentence a parent reads first: "Good for Sloane today". */
  headline: string;
  /** The children a confirmed fact is about. Empty when no fact is about a particular child. */
  forNames: string[];
  /** Confirmed reasons it works. Each is a fact, never an inference. */
  reasons: MatchLine[];
  /** Things that count against it for this family. Confirmed breaches first. */
  cautions: MatchLine[];
  /** Things the family needs or would want that nobody has confirmed. */
  toCheck: MatchLine[];
  today: { state: OpeningTodayState; label: string };
  /** The one line worth showing on a card. */
  cardNote: string | null;
  evidence: { positives: number; venueFacts: number; breaches: number; hardUnknowns: number };
}

export interface FamilyMatchInput {
  venue: Pick<Venue, 'driveMinutes' | 'trustedFacts' | 'structuredOpeningHours' | 'enrichmentStatus' | 'facilities' | 'category' | 'estimatedSpend'>;
  profile: FamilyProfile;
  /** The blended Family Fit score (0 to 100). Used only to tell poor from possible and good from excellent. */
  score: number;
  weather?: WeatherInfo | null;
  now?: Date;
}

const VERDICT_WORD: Record<Exclude<MatchVerdict, 'not_reviewed'>, string> = {
  excellent: 'Excellent',
  good: 'Good',
  possible: 'Possible',
  poor: 'Not a great match',
};

/** What each verdict is called on a badge. Good and excellent keep the number; the others are words alone. */
export const VERDICT_BADGE: Record<MatchVerdict, string> = {
  excellent: 'Excellent fit',
  good: 'Good fit',
  possible: 'Possible fit',
  poor: 'Poor fit',
  not_reviewed: 'Not yet reviewed',
};

type Status = 'yes' | 'no' | 'unknown';
const status = (value: unknown): Status => (value === 'yes' ? 'yes' : value === 'no' ? 'no' : 'unknown');

/** Must-have facilities the profile can state, mapped to the venue fact that answers each. */
function mustHaveStatus(facility: FacilityType, facts: MatchableVenueFacts): { label: string; status: Status } | null {
  switch (facility) {
    case 'toilets':
      return { label: 'toilets', status: status(facts.toilets) };
    case 'baby_changing':
      return { label: 'baby changing', status: status(facts.babyChanging) };
    case 'parking':
      return { label: 'parking', status: status(facts.parking) };
    case 'pushchair_friendly': {
      const p = facts.pushchairSuitability;
      return { label: 'pushchair access', status: p === 'good' || p === 'excellent' ? 'yes' : p === 'difficult' ? 'no' : 'unknown' };
    }
    default:
      return null;
  }
}

const names = (members: readonly FamilyMember[]): string[] => members.map((m) => m.name.trim());
const sayNames = (members: readonly FamilyMember[], fallback: string): string => joinNames(names(members)) || fallback;

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function evaluateFamilyMatch({ venue, profile, score, weather, now = new Date() }: FamilyMatchInput): FamilyMatchResult {
  const children = profile.members.filter((m) => m.role === 'child');
  const facts = venue.trustedFacts;
  const unreviewed = isUnreviewedEnrichmentStatus(venue.enrichmentStatus) || !facts;

  const reasons: MatchLine[] = [];
  const breaches: MatchLine[] = [];
  const softCautions: MatchLine[] = [];
  const hardUnknowns: MatchLine[] = [];
  const softUnknowns: MatchLine[] = [];
  const forIds = new Set<string>();
  let venueFacts = 0;

  const under3 = children.filter((c) => childAgeMonths(c) < 36);
  const buggyKids = children.filter(childUsesBuggy);
  const usesBuggy = familyUsesBuggy(profile);

  // ---- today: the schedule and the clock --------------------------------------------------------------------
  const today = describeOpeningToday(venue.structuredOpeningHours, now);
  if (today.state === 'closed_today' || today.state === 'never_open') {
    breaches.push({ key: 'closed-today', text: today.label });
  } else if (today.state === 'closed_for_today') {
    softCautions.push({ key: 'closed-for-today', text: today.label });
  } else if (today.state === 'closing_soon') {
    softCautions.push({ key: 'closing-soon', text: today.label });
  } else if (today.state === 'open_now' || today.state === 'open_all_day' || today.state === 'opens_later') {
    reasons.push({ key: 'open-today', text: today.label });
  }

  // ---- the journey -----------------------------------------------------------------------------------------
  const drive = venue.driveMinutes;
  if (Number.isFinite(drive)) {
    const limit = profile.maxDriveMinutes;
    if (Number.isFinite(limit) && drive > limit) {
      const over = Math.round(drive - limit);
      const text = `${Math.round(drive)} min away, ${over} min over the ${limit} min drive we’re using`;
      // Well beyond the limit is a different thing from a few minutes over.
      (drive > limit * 1.5 ? breaches : softCautions).push({ key: 'drive-over', text });
    } else {
      reasons.push({ key: 'drive-ok', text: `${Math.max(1, Math.round(drive))} min away` });
    }
  }

  // ---- the venue's evidence --------------------------------------------------------------------------------
  if (facts) {
    // Door policy: the one age fact that can exclude.
    const months = children.map(childAgeMonths);
    if (evaluateAgeAdmission(facts, months) === 'prohibited') {
      breaches.push({ key: 'age-admission', text: `Its age policy doesn’t admit ${sayNames(children, 'your children')}` });
    }

    // Recommended ages, per child.
    const verdicts = childAgeVerdicts(facts, profile.members);
    if (verdicts.length > 0) {
      const inside = verdicts.filter((v) => v.side === 'inside');
      const line = suitsChildrenLine(facts, verdicts);
      if (line) {
        reasons.push({ key: 'age', text: line });
        venueFacts += 1;
        inside.forEach((v) => forIds.add(v.id));
      }
      for (const text of outsideRangeCautions(facts, verdicts)) softCautions.push({ key: `age-outside-${text}`, text });
      if (inside.length === 0 && verdicts.length > 0) {
        breaches.push({ key: 'age-none', text: 'None of your children are in its recommended age range' });
      }
    }

    // Buggy.
    if (usesBuggy) {
      const buggyNames = sayNames(buggyKids, 'your buggy');
      const who = buggyKids.length > 0 && joinNames(names(buggyKids)) ? `${buggyNames}’s buggy` : 'your buggy';
      switch (facts.pushchairSuitability) {
        case 'excellent':
        case 'good':
          reasons.push({ key: 'buggy', text: `Good buggy access for ${who}` });
          venueFacts += 1;
          buggyKids.forEach((c) => forIds.add(c.id));
          break;
        case 'mixed':
          softCautions.push({ key: 'buggy-mixed', text: `Buggy access is mixed here, so ${who} may be awkward in places` });
          break;
        case 'difficult':
          breaches.push({ key: 'buggy-difficult', text: `Buggy access is difficult here, and ${who} is how you get around` });
          break;
        default:
          hardUnknowns.push({ key: 'buggy-unknown', text: `Buggy access still to be checked for ${who}` });
      }
    }

    // Step-free: the venue holds no evidence for it, so for a child who needs it, it is always still to be checked.
    if (familyNeedsStepFree(profile)) {
      hardUnknowns.push({ key: 'stepfree-unknown', text: 'Step-free and wheelchair access still to be checked' });
    }

    // Must-haves the family stated.
    const stated = new Set<string>();
    for (const facility of profile.mustHaveFacilities ?? []) {
      const entry = mustHaveStatus(facility, facts);
      if (!entry || stated.has(entry.label)) continue;
      // pushchair access is already handled above for a family with a buggy.
      if (facility === 'pushchair_friendly' && usesBuggy) continue;
      stated.add(entry.label);
      if (entry.status === 'yes') {
        reasons.push({ key: `must-${entry.label}`, text: `${cap(entry.label)} confirmed, which you said you need` });
        venueFacts += 1;
      } else if (entry.status === 'no') {
        breaches.push({ key: `must-${entry.label}`, text: `No ${entry.label} here, and you said you need it` });
      } else {
        hardUnknowns.push({ key: `must-${entry.label}`, text: `${cap(entry.label)}, which you said you need, still to be checked` });
      }
    }

    // Baby changing matters for under-threes whether or not it was stated.
    if (!stated.has('baby changing') && under3.length > 0) {
      const who = sayNames(under3, under3.length === 1 ? 'your little one' : 'your little ones');
      if (facts.babyChanging === 'yes') {
        reasons.push({ key: 'baby-changing', text: `Baby changing confirmed, handy for ${who}` });
        venueFacts += 1;
        under3.forEach((c) => forIds.add(c.id));
      } else if (facts.babyChanging === 'no') {
        softCautions.push({ key: 'baby-changing-no', text: `No baby changing here, which ${who} would need` });
      } else {
        softUnknowns.push({ key: 'baby-changing-unknown', text: `Baby changing still to be checked for ${who}` });
      }
    }

    // Other confirmed facilities worth a line (only when not already said above).
    if (facts.toilets === 'yes' && !stated.has('toilets')) {
      reasons.push({ key: 'toilets', text: 'Toilets confirmed on site' });
      venueFacts += 1;
    } else if (facts.toilets !== 'yes' && facts.toilets !== 'no' && !stated.has('toilets') && children.length > 0) {
      softUnknowns.push({ key: 'toilets-unknown', text: 'Toilets still to be checked' });
    }
    if (facts.parking === 'yes' && !stated.has('parking')) {
      reasons.push({ key: 'parking', text: facts.freeParking === 'yes' ? 'Free parking confirmed' : 'Parking confirmed on site' });
      venueFacts += 1;
    } else if (facts.parking === 'no' && !stated.has('parking')) {
      softCautions.push({ key: 'parking-no', text: 'No parking on site' });
    }
    if (venue.facilities?.includes('cafe')) {
      reasons.push({ key: 'cafe', text: 'Café on site' });
      venueFacts += 1;
    }

    // Weather against the confirmed environment.
    if (weather && (facts.environment === 'indoor' || facts.environment === 'outdoor')) {
      const wet = weather.condition === 'rainy';
      const bright = weather.condition === 'sunny' || weather.condition === 'partly_cloudy';
      if (facts.environment === 'indoor' && wet) {
        reasons.push({ key: 'weather', text: 'Indoors, so rain won’t spoil it' });
        venueFacts += 1;
      } else if (facts.environment === 'outdoor' && bright) {
        reasons.push({ key: 'weather', text: 'Outdoors, and the weather is good for it today' });
        venueFacts += 1;
      } else if (facts.environment === 'outdoor' && wet) {
        softCautions.push({ key: 'weather-wet', text: 'Outdoors, and rain is forecast' });
      }
    }
  }

  // ---- routines --------------------------------------------------------------------------------------------
  const routine = evaluateRoutineFit(profile, drive, now);
  if (routine.reason) reasons.push({ key: 'routine', text: routine.reason });
  if (routine.caution) softCautions.push({ key: 'routine-clash', text: routine.caution });

  // Lead with what is about THIS family (their children, their needs), then the venue's facilities, and the plain
  // logistics (open today, how far) last: the first lines a parent reads should be the ones only they would get.
  const rank = (key: string): number => {
    const order = ['age', 'buggy', 'must-', 'baby-changing', 'routine', 'toilets', 'parking', 'cafe', 'weather', 'open-today', 'drive-ok'];
    const index = order.findIndex((prefix) => key === prefix || key.startsWith(prefix));
    return index === -1 ? order.length : index;
  };
  reasons.sort((a, b) => rank(a.key) - rank(b.key));

  // ---- the verdict -----------------------------------------------------------------------------------------
  const positives = reasons.length;
  let verdict: MatchVerdict;
  if (unreviewed) {
    verdict = breaches.length > 0 ? 'poor' : 'not_reviewed';
  } else if (breaches.length > 0 || (Number.isFinite(score) && score < 50)) {
    verdict = 'poor';
  } else if (softCautions.length > 0 || hardUnknowns.length > 0 || positives < 2 || (Number.isFinite(score) && score < 70)) {
    verdict = 'possible';
  } else if (score >= 85 && positives >= 4 && venueFacts >= 2 && softUnknowns.length === 0) {
    verdict = 'excellent';
  } else {
    verdict = 'good';
  }

  // ---- the words -------------------------------------------------------------------------------------------
  const named = children.filter((c) => forIds.has(c.id));
  const forNames = names(named).filter(Boolean);
  const who = forNames.length > 0 && forNames.length === named.length ? joinNames(forNames) : 'your family';
  const headline =
    verdict === 'not_reviewed'
      ? 'Family suitability not yet reviewed'
      : verdict === 'poor'
        ? `Probably not for ${who} today`
        : `${VERDICT_WORD[verdict]} for ${who} today`;

  const cautions = [...breaches, ...softCautions];
  const toCheck = [...hardUnknowns, ...softUnknowns];
  // A card carries only what changes a decision: a breach, a requirement still unchecked, or a caution. The softer
  // "still to be checked" lines are for the venue's own page, where they have room and context.
  const firstIssue = breaches[0] ?? hardUnknowns[0] ?? softCautions[0];
  const todayBit = ['open_now', 'closing_soon', 'opens_later', 'open_all_day'].includes(today.state) ? today.label : null;
  // The same fact can be both today's opening state and a caution ("Closing soon · 5pm"): say it once.
  const noteParts = [todayBit, firstIssue?.text ?? (todayBit ? null : reasons[0]?.text)].filter((part): part is string => Boolean(part));
  const cardNote = noteParts.filter((part, i) => noteParts.findIndex((other) => other.trim().toLowerCase() === part.trim().toLowerCase()) === i).join(' · ') || null;

  return {
    verdict,
    headline,
    forNames,
    reasons,
    cautions,
    toCheck,
    today: { state: today.state, label: today.label },
    cardNote,
    evidence: { positives, venueFacts, breaches: breaches.length, hardUnknowns: hardUnknowns.length },
  };
}

/**
 * The words on a badge. A good or excellent match says who it is good for when a confirmed fact names them
 * ("Good for Sloane"); every other verdict is just its word, because a badge with a name on it is a claim and
 * `possible` and `poor` are not claims worth naming anyone for.
 */
export function matchBadgeText(match: Pick<FamilyMatchResult, 'verdict' | 'forNames'>, maxNameChars = 18): string {
  if (match.verdict === 'good' || match.verdict === 'excellent') {
    const word = match.verdict === 'excellent' ? 'Excellent' : 'Good';
    const who = joinNames(match.forNames);
    if (who && who.length <= maxNameChars) return `${word} for ${who}`;
    return VERDICT_BADGE[match.verdict];
  }
  return VERDICT_BADGE[match.verdict];
}

/** Whether a badge carries the star: only a match with confirmed evidence behind it has earned one. */
export function matchEarnsStar(verdict: MatchVerdict): boolean {
  return verdict === 'good' || verdict === 'excellent';
}

/**
 * The line under a card's title. For a good match, whether it is open and the most personal confirmed reason (the
 * journey leads the line on the card, so it is not repeated here); for a possible or poor one, what stands in the way; for a place not yet reviewed,
 * only what the clock says.
 */
export function matchCardReason(match: FamilyMatchResult): string {
  if (match.verdict === 'good' || match.verdict === 'excellent') {
    const open = match.reasons.find((line) => line.key === 'open-today');
    const lead = match.reasons.find((line) => line.key !== 'drive-ok' && line.key !== 'open-today');
    return [open?.text, lead?.text].filter(Boolean).join(' · ');
  }
  return match.cardNote ?? '';
}
