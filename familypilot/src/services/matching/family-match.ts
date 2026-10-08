import { FacilityType, FamilyProfile, FamilyMember, Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { evaluateAgeAdmission } from '@/src/services/matching/age-admission';
import { childAgeMonths } from '@/src/services/matching/age-suitability';
import { activityEvidenceFor, evidenceCovers } from '@/src/services/matching/activity-evidence';
import { childAgeVerdicts, joinNames, outsideRangeCautions, suitsChildrenLine } from '@/src/utils/child-fit';
import { childUsesBuggy, childUsesMobilityAid, familyNeedsStepFree, familyUsesBuggy } from '@/src/utils/family-mobility';
import { describeOpeningToday, OpeningTodayState } from '@/src/utils/opening-today';
import { evaluateVenueRules, ruleAppliesOn } from '@/src/services/matching/venue-rules';
import { reconcileHoursOn } from '@/src/services/places/hours-reconcile';
import { venueLocalDate } from '@/src/utils/opening-hours';
import { isUnreviewedEnrichmentStatus } from '@/src/utils/enrichment-rules';
import { driveLimitMinutes } from '@/src/utils/preferences';
import { observationLine, ParentObservations } from '@/src/services/matching/parent-observations';

/**
 * Family Match: whether a place suits THIS family, and why, derived from the household and the venue's evidence.
 *
 * BROWSE FIRST, PLAN SECOND. This is what Home, Explore, Halfway and Venue Detail say BEFORE the parent has said when
 * they want to go, so it is built from what is stable about the family (the children and what is confirmed for them,
 * buggy or sling, must-haves, how far they will travel) and never from the clock: no "leave by", no nap or feed timing,
 * nothing that assumes they are setting off now. Whether a particular day works around naps and feeds is the planner's
 * job, once they have chosen a date and a time (routine-advice.ts). Today's opening state is still reported (`today`,
 * `availableToday`) as a fact about the day, and weather is shown by the venue page as its own condition: neither is a reason,
 * a caution or a score, so the verdict is the same whatever the day.
 *
 * WHAT THIS REPLACES. The Family Fit number is a weighted blend in which every fact nobody has checked is replaced by
 * a neutral default (an unknown age range scores 75, an unknown buggy score 70, a distance beyond the limit is a soft
 * penalty, and so on). That keeps the blend defined, and it also meant a place with no evidence at all could score
 * 4.6 out of 5 and be called "Good fit" while breaching the family's drive limit or missing something they said they
 * need. The number is therefore still used to RANK, and no longer decides what a parent is TOLD.
 *
 * THE RULES.
 *  - A reason is shown only for a fact that is confirmed (or computed from the schedule and the clock). Nothing is
 *    inferred from a category.
 *  - A confirmed breach of something the family needs (a must-have facility confirmed absent, hours that say it is never open to visitors, a
 *    door policy that does not admit a child, every child outside the recommended ages, buggy access reviewed as
 *    difficult for a family with a buggy) makes the verdict `poor`.
 *  - A requirement that is simply UNKNOWN (a must-have nobody has checked, buggy access for a family with a buggy,
 *    step-free access for a child who needs it) caps the verdict at `possible`, and is said as "still to be checked",
 *    never as a fit and never as a failure.
 *  - `excellent` needs several confirmed positives, at least two of them facts about the venue, and nothing left to
 *    check. `good` needs at least two confirmed positives and nothing against.
 *  - TWO KINDS OF EVIDENCE ABOUT A CHILD, kept apart. ACTIVITY FIT is evidence that the place itself is suitable for that
 *    child: today only the venue's own published recommended ages including them. VISIT LOGISTICS is evidence that taking
 *    that child is practical: buggy access, baby changing and the like. Logistics never says "Good for Ozzie"; it says
 *    "Easy to visit with Ozzie". "Good for <child>" needs activity evidence, and a child without any is said to be uncertain
 *    ("We haven't yet confirmed whether this activity suits Sloane"), never filled in from their age or the kind of place. A baby who is
 *    carried, fed and changed is led by logistics, so no activity gap is raised for a child under a year old.
 *  - Children are named only where a fact is about that child (the recommended ages include them, their buggy is
 *    covered, baby changing for a baby), and the sentence says which kind of fact it is.
 *  - A place FamilyPilot has not reviewed is `not_reviewed`, whatever the number says; the logistics that ARE known
 *    (open today, how far) are still stated.
 */
export type MatchVerdict = 'excellent' | 'good' | 'possible' | 'poor' | 'not_reviewed';

export interface MatchLine {
  /** Stable key for lists and tests. */
  key: string;
  text: string;
  /** The children this line is about, where it is about particular children. Absent for a line about the family or the place. */
  childIds?: string[];
  /** What the line is about in two or three words ("buggy access"), for the headline's "check buggy access for Ozzie". */
  topic?: string;
  /**
   * For a line about particular children: `activity` is evidence about whether the place suits them (a recommended age
   * range); `logistics` is evidence about whether taking them is practical (buggy access, baby changing). Only an
   * `activity` line can make a child "good for" a place.
   */
  aspect?: 'activity' | 'logistics';
}

/**
 * How the place looks for ONE child, from the lines that name them. The headline is built from these, so a family with
 * two children reads about both ("Good for Sloane, but check buggy access for Ozzie") rather than one verdict for "the
 * family". `works` is confirmed fact; `check` is a caution or something nobody has confirmed; `concern` is a confirmed
 * breach. `unknown` means no line is about them: nothing is claimed.
 */
export interface ChildLens {
  id: string;
  name: string;
  state: 'works' | 'check' | 'concern' | 'unknown';
  /**
   * What `works` rests on: `activity` when the venue's own recommended ages include the child, `logistics` when only the
   * practical facts (buggy, baby changing) are confirmed. Null unless `state` is `works`.
   */
  basis: 'activity' | 'logistics' | null;
  works: string[];
  check: string[];
}

export interface FamilyMatchResult {
  verdict: MatchVerdict;
  /** The sentence a parent reads first: "Good for Sloane". */
  headline: string;
  /** The children a confirmed fact is about. Empty when no fact is about a particular child. */
  forNames: string[];
  /** Each child, and what is known about the place for them. Empty for a household with no children. */
  children: ChildLens[];
  /**
   * In a household of two or more children, the children the place is NOT confirmed to work for while it is for at
   * least one other (a check still open, or nothing known at all). Whenever this is non-empty, no sentence or badge may
   * say the place is good for the family or for "Sloane" alone: the gap is said beside it. Empty for one child.
   */
  gapNames: string[];
  /** Confirmed reasons it works. Each is a fact, never an inference. */
  reasons: MatchLine[];
  /** Things that count against it for this family. Confirmed breaches first. */
  cautions: MatchLine[];
  /** Things the family needs or would want that nobody has confirmed. */
  toCheck: MatchLine[];
  today: { state: OpeningTodayState; label: string };
  /**
   * False when the place is shut today (all day, or already finished for the day) or never open. The verdict is about
   * whether the place suits the family; this is whether they can go TODAY. No sentence may claim today when it is false.
   */
  availableToday: boolean;
  /** The one line worth showing on a card. */
  cardNote: string | null;
  evidence: { positives: number; venueFacts: number; breaches: number; hardUnknowns: number; /** Lines that rest on parent reports (never counted as positives). */ parentReported: number };
  /**
   * True when every child is under a year: the visit itself is the activity, so an Excellent rests on how easy the visit
   * is, and the badge says so ("Excellent · easy visit") rather than implying the place was judged for an activity.
   */
  easyVisit: boolean;
}

export interface FamilyMatchInput {
  venue: Pick<Venue, 'driveMinutes' | 'trustedFacts' | 'structuredOpeningHours' | 'enrichmentStatus' | 'facilities' | 'category' | 'estimatedSpend'> & { id?: string };
  profile: FamilyProfile;
  /** The blended Family Fit score (0 to 100). Used only to tell poor from possible and good from excellent. */
  score: number;
  now?: Date;
  /**
   * What parents have reported, ALREADY filtered by the confidence contract (`parentObservationsFromTrust`): only
   * corroborated and needs-recheck fields. Explanations only: they never raise a verdict and never become a reason.
   */
  parentObservations?: ParentObservations;
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

/**
 * A child younger than this is led by the practical facts: they are carried, fed and changed, so "does the place suit
 * them" is not a question the venue's evidence can usefully answer, and no activity gap is raised for them.
 */
const LOGISTICS_LED_BELOW_MONTHS = 12;

/**
 * What a confirmed-practical match is called when every child is under a year. The visit is the activity for a baby, so
 * what was judged is how EASY the visit is (buggy access, changing, feeding), never that an activity suits them. It is
 * a different claim from "Good fit" or "Excellent fit", so it has a different name and never borrows the word Excellent.
 */
export const EASY_VISIT_LABEL = 'Easy visit';

/** The generic classification under a name: the verdict word, or "Easy visit" for a household of babies only. */
export function matchClassification(match: Pick<FamilyMatchResult, 'verdict'> & { easyVisit?: boolean }): string {
  return isEasyVisit(match) ? EASY_VISIT_LABEL : VERDICT_BADGE[match.verdict];
}

function isEasyVisit(match: Pick<FamilyMatchResult, 'verdict'> & { easyVisit?: boolean }): boolean {
  return Boolean(match.easyVisit) && (match.verdict === 'good' || match.verdict === 'excellent');
}

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
    case 'playground':
      // Whether there is one, nothing more: a playground is provision, never evidence that it suits a particular child.
      return { label: 'playground', status: status(facts.playground) };
    case 'pushchair_friendly': {
      const p = facts.pushchairSuitability;
      return { label: 'pushchair access', status: p === 'good' || p === 'excellent' ? 'yes' : p === 'difficult' ? 'no' : 'unknown' };
    }
    default:
      return null;
  }
}

const names = (members: readonly FamilyMember[]): string[] => members.map((m) => m.name.trim());

/**
 * The one way FamilyPilot says it has not confirmed that the place itself suits a child, in a parent's words and with the
 * child's name: "we haven't yet confirmed whether this activity suits Sloane". It makes no claim about the venue (it does
 * not say the venue failed to publish anything, and does not suggest it should have), and no claim about the child: nothing
 * is inferred from their age or the kind of place. Used everywhere it is said, so it never reads two ways.
 */
export function unconfirmedSuitsClause(childNames: readonly string[]): string {
  return `we haven’t yet confirmed whether this activity suits ${joinNames(childNames)}`;
}

const childUsesCarrier = (member: Pick<FamilyMember, 'mobility'>): boolean => member.mobility?.includes('carrier') ?? false;

/**
 * "A sling or carrier may be easier for Ozzie": only when the venue's own evidence says the buggy will struggle, and only
 * for a child whose family said they go in one.
 *
 * WHAT CAN TRIGGER IT, and nothing else:
 *   - approved buggy access of "difficult" or "mixed" (pushchairSuitability, a trusted claim), or
 *   - approved terrain of "hilly" or "very hilly" (extendedTerrain, a trusted claim) where buggy access is NOT
 *     confirmed good: confirmed-good buggy access and hilly paths disagree, and disagreeing evidence says nothing.
 * NEVER from the category (a park, zoo, farm or museum is not assumed to mean walking or rough paths), never from visit
 * length, never from parent reports alone (they are context, not facts), never when the evidence is unknown. With no such
 * evidence it says nothing: silence is better than personalisation nobody can stand behind.
 *
 * It names the children whose own answers include BOTH a buggy and a sling or carrier (mobility is recorded per child),
 * so it is never said about a child it does not fit, and never to a family with no choice to make.
 */
function carrierAdvice(children: readonly FamilyMember[], facts: MatchableVenueFacts | null | undefined): MatchLine | null {
  if (!facts) return null;
  // A choice only for a child who goes in both: one who is only ever carried is in the sling anyway, and saying so is noise.
  const carried = children.filter((child) => childUsesCarrier(child) && childUsesBuggy(child));
  if (carried.length === 0) return null;
  const buggy = facts.pushchairSuitability;
  const hilly = facts.terrain === 'hilly' || facts.terrain === 'very_hilly';
  const buggyStruggles = buggy === 'difficult' || buggy === 'mixed';
  const buggyFine = buggy === 'good' || buggy === 'excellent';
  if (!buggyStruggles && !(hilly && !buggyFine)) return null;
  const why = buggy === 'difficult'
    ? 'buggy access is difficult here'
    : buggy === 'mixed'
      ? 'buggy access is mixed here'
      : facts.terrain === 'very_hilly'
        ? 'the paths here are very hilly'
        : 'the paths here are hilly';
  const who = joinNames(names(carried)) || 'your little one';
  return { key: 'carrier', text: `A sling or carrier may be easier for ${who}: ${why}`, childIds: carried.map((c) => c.id), topic: 'getting around', aspect: 'logistics' };
}
const sayNames = (members: readonly FamilyMember[], fallback: string): string => joinNames(names(members)) || fallback;

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The sentence a parent reads first, about the children rather than "the family".
 *
 * With one child it is "Good for Sloane". With several it keeps them apart when the evidence does: "Could work
 * for Sloane, but check buggy access for Ozzie". Children are named only where a line is about them; a household with
 * a child nobody has a fact about reads "your family", never a guess.
 */
function headlineFor(input: {
  verdict: MatchVerdict;
  /** Every child is under a year: the claim can only be about how easy the visit is. */
  easyVisit?: boolean;
  lens: ChildLens[];
  children: readonly FamilyMember[];
  lines: { breaches: MatchLine[]; softCautions: MatchLine[]; hardUnknowns: MatchLine[]; softUnknowns: MatchLine[] };
}): string {
  const { verdict, easyVisit, lens, children, lines } = input;
  // A judgement about the family and the place, never about leaving now: nothing about today's date, hours or weather is
  // in it, so the same sentence is true on every day the screen is read.
  if (verdict === 'not_reviewed') return 'Family suitability not yet reviewed';

  // Two different claims, never one. "Good for Sloane" is about the PLACE and needs the venue's own recommended ages to
  // include her. "Easy to visit with Ozzie" is about the VISIT: his buggy or his changing is confirmed. A child whose only
  // confirmed facts are practical is in the second group however many of them there are.
  const suitedNames = lens.filter((l) => l.state === 'works' && l.basis === 'activity' && l.name).map((l) => l.name);
  const easyNames = lens.filter((l) => l.state === 'works' && l.basis === 'logistics' && l.name).map((l) => l.name);
  const multi = children.length > 1;
  const gap = multi ? gapPhrase(lens, lines) : null;

  if (verdict === 'poor') {
    // Who the confirmed breach is about, where it is about particular children; otherwise the family.
    const breachKids = lens.filter((l) => l.state === 'concern' && l.name);
    const everyone = breachKids.length === 0 || breachKids.length === children.length;
    const breachWho = !everyone && joinNames(breachKids.map((l) => l.name)) ? joinNames(breachKids.map((l) => l.name)) : 'your family';
    return `Probably not for ${breachWho}`;
  }

  // For several children where the evidence is about some of them only, the sentence keeps them apart and says what is
  // open for the rest. `possible` says "Could work for" so a caution is never dressed as a recommendation.
  const word = multi && gap && verdict === 'possible' ? 'Could work' : VERDICT_WORD[verdict];
  const suited = suitedNames.length > 0 ? `${word} for ${joinNames(suitedNames)}` : null;
  const easy = easyNames.length > 0 ? `easy to visit with ${joinNames(easyNames)}` : null;
  const lead = suited ? (easy ? `${suited}, and ${easy}` : suited) : easy ? cap(easy) : null;

  if (multi && gap && lead) {
    // For `possible`, only when what holds it back is about particular children. If the journey, the opening hours or a
    // must-have is what holds it back, the sentence is about the family, not about one child's baby changing.
    const familyLevel = [...lines.softCautions, ...lines.hardUnknowns].some((line) => !line.childIds?.length);
    if (verdict !== 'possible' || !familyLevel) return `${lead}, but ${gap}`;
  }

  // Several children, nothing confirmed for any of them: the practical facts are good, and the headline says that is all.
  if (multi && gap && !lead && (verdict === 'good' || verdict === 'excellent')) {
    return `Looks practical, but ${gap}`;
  }

  // Everyone the household has is covered, by one kind of evidence or both. A `possible` verdict means something stands in
  // the way at the level of the family (the journey, the opening hours), so practical facts alone do not headline it: only
  // the place's own recommended ages do.
  if (lead && lens.length > 0 && lens.every((l) => l.state === 'works') && (verdict !== 'possible' || suited)) return lead;

  // No evidence about any particular child. What is confirmed is about the place and the visit (toilets, parking, a
  // café), so it is never said as "Good for your family": that would claim the activity suits them.
  if (easyVisit && (verdict === 'good' || verdict === 'excellent')) return children.length > 1 ? 'Looks easy to visit with your babies' : 'Looks easy to visit with your baby';
  if (verdict === 'good') return 'Looks promising for your family';
  if (verdict === 'excellent') return 'Looks very promising for your family';
  return `${VERDICT_WORD[verdict]} for your family`;
}

/**
 * What is open for the children the place is not confirmed to work for, as the end of a sentence:
 * "check buggy access for Ozzie", "we haven't yet confirmed whether this activity suits Ozzie", or both. Null when every child is covered.
 */
function gapPhrase(lens: ChildLens[], lines: { hardUnknowns: MatchLine[]; softCautions: MatchLine[]; softUnknowns: MatchLine[] }): string | null {
  const checkKids = lens.filter((l) => l.state === 'check' && l.name);
  const unknownKids = lens.filter((l) => l.state === 'unknown' && l.name);
  const parts: string[] = [];
  if (checkKids.length > 0) {
    const checkLines = [...lines.hardUnknowns, ...lines.softCautions, ...lines.softUnknowns].filter((line) =>
      checkKids.some((kid) => line.childIds?.includes(kid.id)),
    );
    const topics = [...new Set(checkLines.map((line) => line.topic).filter((t): t is string => Boolean(t)))];
    const what = topics.length === 1 ? topics[0] : 'a couple of things';
    parts.push(`check ${what} for ${joinNames(checkKids.map((k) => k.name))}`);
  }
  if (unknownKids.length > 0) {
    parts.push(unconfirmedSuitsClause(unknownKids.map((k) => k.name)));
  }
  return parts.length ? parts.join(', and ') : null;
}

export function evaluateFamilyMatch({ venue, profile, score, now = new Date(), parentObservations = {} }: FamilyMatchInput): FamilyMatchResult {
  const children = profile.members.filter((m) => m.role === 'child');
  // A contradicted fact is withdrawn: Family Fit treats it as unknown and says it needs rechecking. The claim itself is
  // not touched anywhere; this is only what is told to this family until a source is re-checked.
  const recheck = (field: 'babyChanging' | 'toilets' | 'parking' | 'pushchair' | 'cafe') => parentObservations[field]?.basis === 'needs_recheck';
  const facts = venue.trustedFacts
    ? {
        ...venue.trustedFacts,
        ...(recheck('babyChanging') ? { babyChanging: undefined } : {}),
        ...(recheck('toilets') ? { toilets: undefined } : {}),
        ...(recheck('parking') ? { parking: undefined, freeParking: undefined } : {}),
        ...(recheck('pushchair') ? { pushchairSuitability: undefined } : {}),
      }
    : venue.trustedFacts;
  let parentReported = 0;
  /** The "still to be checked" wording, replaced by the labelled parent-reported wording when the contract allows. */
  const unknownText = (field: 'babyChanging' | 'toilets' | 'parking' | 'pushchair' | null, fallback: string, lead?: string): string => {
    const obs = field ? parentObservations[field] : undefined;
    if (!field || !obs) return fallback;
    parentReported += 1;
    return observationLine(field, obs, lead);
  };
  const unreviewed = isUnreviewedEnrichmentStatus(venue.enrichmentStatus) || !facts;

  const reasons: MatchLine[] = [];
  const breaches: MatchLine[] = [];
  const softCautions: MatchLine[] = [];
  const hardUnknowns: MatchLine[] = [];
  const softUnknowns: MatchLine[] = [];
  /** Children the place is confirmed SUITABLE for: activity evidence only. Practical facts never add a child here. */
  const forIds = new Set<string>();
  let venueFacts = 0;

  const under3 = children.filter((c) => childAgeMonths(c) < 36);
  const buggyKids = children.filter(childUsesBuggy);
  const usesBuggy = familyUsesBuggy(profile);

  // ---- the day: kept OUT of the fit ---------------------------------------------------------------------------
  // SUITABILITY and AVAILABILITY are separate questions. Whether a place suits this family does not change because it is
  // shut today, closes at five, or the forecast is rain: the same family and the same place get the same verdict on a
  // Tuesday it is shut as on a Wednesday it is open. So today's opening state is reported beside the fit (`today`,
  // `availableToday`: facts about the day the screen is read, used to say "Closed today" on a card, never to rate it) and
  // is not a reason, a caution, a positive or a score. Weather is not read here at all; the venue page shows it as its own
  // condition. Once there is a plan for a chosen day, the planner is where date-specific feasibility is worked out.
  // The one exception is a place whose hours say it is NEVER open to visitors: that is a fact about the place, not the day.
  // The venue's own reviewed hours outrank the provider's weekly pattern for today when the two disagree (see hours-reconcile.ts).
  const hoursToday = describeOpeningToday(reconcileHoursOn(venue.structuredOpeningHours, venue.trustedFacts?.officialHours, now).schedule, now);
  // A reviewed whole-venue closure on today's date outranks the weekly hours, which cannot know about an exceptional closure.
  const todayDate = venueLocalDate(now, venue.structuredOpeningHours?.timezone ?? 'Europe/London');
  const closedByRule = todayDate
    ? evaluateVenueRules(venue.trustedFacts?.rules, { date: todayDate, usesPushchair: false, requiresPushchair: false, needsStepFree: false }).closedAllDay
    : null;
  const today = closedByRule ? { ...hoursToday, state: 'closed_today' as const, label: 'Closed today', spans: [] } : hoursToday;
  const notToday = today.state === 'closed_today' || today.state === 'closed_for_today';
  if (today.state === 'never_open') {
    breaches.push({ key: 'never-open', text: today.label });
  }

  // ---- the journey -----------------------------------------------------------------------------------------
  const drive = venue.driveMinutes;
  if (Number.isFinite(drive)) {
    // Only a limit the family stated can be exceeded. With none there is no "over": the journey is shown, never cautioned.
    const limit = driveLimitMinutes(profile);
    if (limit !== null && drive > limit) {
      const over = Math.round(drive - limit);
      const text = `${Math.round(drive)} min away, ${over} min over the ${limit} min drive we’re using`;
      // Well beyond the limit is a different thing from a few minutes over.
      (drive > limit * 1.5 ? breaches : softCautions).push({ key: 'drive-over', text });
    } else {
      reasons.push({ key: 'drive-ok', text: `${Math.max(1, Math.round(drive))} min away` });
    }
  }

  // ---- the venue's evidence --------------------------------------------------------------------------------
  /** Children inside the venue's own recommended age range: activity evidence about the whole place. */
  const rangeIds = new Set<string>();
  /** Children a permanent, age-specific provision on the venue's own pages covers (a playground for under-7s). */
  const provisionIds = new Set<string>();
  if (facts) {
    // Door policy: the one age fact that can exclude.
    const months = children.map(childAgeMonths);
    if (evaluateAgeAdmission(facts, months) === 'prohibited') {
      breaches.push({ key: 'age-admission', text: `Its age policy doesn’t admit ${sayNames(children, 'your children')}`, childIds: children.map((c) => c.id), topic: 'its age policy' });
    }

    // Recommended ages, per child.
    const verdicts = childAgeVerdicts(facts, profile.members);
    if (verdicts.length > 0) {
      const inside = verdicts.filter((v) => v.side === 'inside');
      const line = suitsChildrenLine(facts, verdicts);
      if (line) {
        reasons.push({ key: 'age', text: line, childIds: inside.map((v) => v.id), topic: 'age range', aspect: 'activity' });
        venueFacts += 1;
        inside.forEach((v) => forIds.add(v.id));
      }
      inside.forEach((v) => rangeIds.add(v.id));
      // The same two lines `outsideRangeCautions` writes, in the same order, each tied to the children it names.
      const belowKids = verdicts.filter((v) => v.side === 'below');
      const aboveKids = verdicts.filter((v) => v.side === 'above');
      const outsideIds: string[][] = [];
      if (belowKids.length > 0 && joinNames(belowKids.map((v) => v.name)) && facts.minRecommendedAge != null) outsideIds.push(belowKids.map((v) => v.id));
      if (aboveKids.length > 0 && joinNames(aboveKids.map((v) => v.name)) && facts.maxRecommendedAge != null) outsideIds.push(aboveKids.map((v) => v.id));
      outsideRangeCautions(facts, verdicts).forEach((text, index) => {
        softCautions.push({ key: `age-outside-${text}`, text, childIds: outsideIds[index], topic: 'age range', aspect: 'activity' });
      });
      if (inside.length === 0 && verdicts.length > 0) {
        breaches.push({ key: 'age-none', text: 'None of your children are in its recommended age range', childIds: verdicts.map((v) => v.id), topic: 'age range', aspect: 'activity' });
      }
    }

    // What the venue's own pages say children of an age can do there (reviewed; docs/EXCELLENT_RULE_V2.md). Only for a
    // child of a year or more (younger, the visit is the activity) and not already inside the whole-venue range. A line
    // names the children it covers; evidence for other ages is never read as unsuitability for a child it does not cover.
    // A programme on set days names the child but is not a fact about the place on any day, so it is not a venue fact.
    const ageKnown = children.filter((c) => Number.isFinite(childAgeMonths(c)) && childAgeMonths(c) >= LOGISTICS_LED_BELOW_MONTHS && !rangeIds.has(c.id));
    for (const item of venue.id ? activityEvidenceFor(venue.id, now) : []) {
      const covered = ageKnown.filter((c) => evidenceCovers(item, childAgeMonths(c)));
      const who = joinNames(names(covered));
      if (covered.length === 0 || !who) continue;
      const programme = item.kind === 'programme';
      reasons.push({
        key: `activity-${item.label}`,
        text: `${item.label}${programme ? ' (on set days)' : ''}, for ${who}’s ${covered.length > 1 ? 'ages' : 'age'}`,
        childIds: covered.map((c) => c.id),
        topic: 'activity',
        aspect: 'activity',
      });
      covered.forEach((c) => forIds.add(c.id));
      if (!programme) {
        venueFacts += 1;
        covered.forEach((c) => provisionIds.add(c.id));
      }
    }

    // Buggy, and the sling or carrier where the evidence makes it the better way round (see carrierAdvice).
    const carrier = carrierAdvice(children, facts);
    if (usesBuggy) {
      const buggyNames = sayNames(buggyKids, 'your buggy');
      const who = buggyKids.length > 0 && joinNames(names(buggyKids)) ? `${buggyNames}’s buggy` : 'your buggy';
      // A child who can also go in a sling is not stuck where a buggy is: for them difficult buggy access is a caution
      // with a way round, not a reason the place won't work.
      const buggyOnly = buggyKids.filter((c) => !childUsesCarrier(c));
      switch (facts.pushchairSuitability) {
        case 'excellent':
        case 'good':
          reasons.push({ key: 'buggy', text: `Good buggy access for ${who}`, childIds: buggyKids.map((c) => c.id), topic: 'buggy access', aspect: 'logistics' });
          venueFacts += 1;
          break;
        case 'mixed':
          softCautions.push({ key: 'buggy-mixed', text: `Buggy access is mixed here, so ${who} may be awkward in places`, childIds: buggyKids.map((c) => c.id), topic: 'buggy access', aspect: 'logistics' });
          break;
        case 'difficult':
          if (buggyOnly.length > 0 || buggyKids.length === 0) {
            breaches.push({ key: 'buggy-difficult', text: `Buggy access is difficult here, and ${who} is how you get around`, childIds: buggyKids.map((c) => c.id), topic: 'buggy access', aspect: 'logistics' });
          } else {
            softCautions.push({ key: 'buggy-difficult-carrier', text: `Buggy access is difficult here`, childIds: buggyKids.map((c) => c.id), topic: 'buggy access', aspect: 'logistics' });
          }
          break;
        default:
          hardUnknowns.push({ key: 'buggy-unknown', text: unknownText('pushchair', `Buggy access still to be checked for ${who}`), childIds: buggyKids.map((c) => c.id), topic: 'buggy access', aspect: 'logistics' });
      }
    }
    if (carrier) softCautions.push(carrier);

    // What the venue itself says about pushchairs, in the venue's own words, for a child who goes in one. Only a reviewed
    // rule in force today; it reads like the buggy-access evidence above (a restriction on the core visit is a breach for a
    // child who has no other way round, a caution otherwise). Labels only: ordering is by score and nothing here moves it.
    if (usesBuggy && todayDate) {
      const buggyOnly = buggyKids.filter((c) => !childUsesCarrier(c));
      for (const rule of facts.rules ?? []) {
        if (rule.kind !== 'pushchair' || !ruleAppliesOn(rule, todayDate)) continue;
        const line: MatchLine = { key: `buggy-rule-${rule.id}`, text: rule.text, childIds: buggyKids.map((c) => c.id), topic: 'buggy access', aspect: 'logistics' };
        if (rule.coversCoreVisit && (buggyOnly.length > 0 || buggyKids.length === 0)) breaches.push(line);
        else softCautions.push(line);
      }
    }

    // Step-free: the venue's own wheelchair-access claim, for a child who uses a wheelchair or mobility aid. A logistics
    // fact: it says the visit is possible for them, never that the place suits them. Buggy access is not read here (a
    // venue that is fine for a buggy is not thereby wheelchair accessible), and unknown stays a thing to check.
    if (familyNeedsStepFree(profile)) {
      const aidKids = children.filter(childUsesMobilityAid);
      const ids = aidKids.map((c) => c.id);
      const who = sayNames(aidKids, 'your child');
      if (facts.wheelchairAccessible === 'yes') {
        reasons.push({ key: 'stepfree', text: `Wheelchair accessible, the venue says, for ${who}`, childIds: ids, topic: 'wheelchair access', aspect: 'logistics' });
        venueFacts += 1;
        if (facts.accessibleToilet === 'yes') {
          reasons.push({ key: 'stepfree-toilet', text: 'Accessible toilet on site', childIds: ids, topic: 'accessible toilet', aspect: 'logistics' });
        }
        for (const rule of facts.rules ?? []) {
          if (rule.kind !== 'step_free' || !todayDate || !ruleAppliesOn(rule, todayDate)) continue;
          softCautions.push({ key: `stepfree-rule-${rule.id}`, text: rule.text, childIds: ids, topic: 'wheelchair access', aspect: 'logistics' });
        }
      } else if (facts.wheelchairAccessible === 'no') {
        breaches.push({ key: 'stepfree-no', text: `The venue says it is not wheelchair accessible, which matters for ${who}`, childIds: ids, topic: 'wheelchair access', aspect: 'logistics' });
      } else {
        hardUnknowns.push({ key: 'stepfree-unknown', text: 'Step-free and wheelchair access still to be checked', childIds: ids, topic: 'wheelchair access', aspect: 'logistics' });
      }
    }

    // Must-haves the family stated.
    const stated = new Set<string>();
    for (const facility of profile.mustHaveFacilities ?? []) {
      const entry = mustHaveStatus(facility, facts);
      if (!entry || stated.has(entry.label)) continue;
      // pushchair access is already handled above for a family with a buggy.
      if (facility === 'pushchair_friendly' && usesBuggy) continue;
      stated.add(entry.label);
      const observedKey = ({ toilets: 'toilets', 'baby changing': 'babyChanging', parking: 'parking', 'pushchair access': 'pushchair' } as const)[entry.label as 'toilets'] ?? null;
      if (entry.status === 'yes') {
        reasons.push({ key: `must-${entry.label}`, text: `${cap(entry.label)} confirmed, which you said you need` });
        venueFacts += 1;
      } else if (entry.status === 'no') {
        breaches.push({ key: `must-${entry.label}`, text: `No ${entry.label} here, and you said you need it` });
      } else {
        hardUnknowns.push({ key: `must-${entry.label}`, text: unknownText(observedKey, `${cap(entry.label)}, which you said you need, still to be checked`, cap(entry.label)) });
      }
    }

    // Baby changing matters for under-threes whether or not it was stated.
    if (!stated.has('baby changing') && under3.length > 0) {
      const who = sayNames(under3, under3.length === 1 ? 'your little one' : 'your little ones');
      if (facts.babyChanging === 'yes') {
        reasons.push({ key: 'baby-changing', text: `Baby changing confirmed, handy for ${who}`, childIds: under3.map((c) => c.id), topic: 'baby changing', aspect: 'logistics' });
        venueFacts += 1;
      } else if (facts.babyChanging === 'no') {
        softCautions.push({ key: 'baby-changing-no', text: `No baby changing here, which ${who} would need`, childIds: under3.map((c) => c.id), topic: 'baby changing', aspect: 'logistics' });
      } else {
        softUnknowns.push({ key: 'baby-changing-unknown', text: unknownText('babyChanging', `Baby changing still to be checked for ${who}`), childIds: under3.map((c) => c.id), topic: 'baby changing', aspect: 'logistics' });
      }
    }

    // Other confirmed facilities worth a line (only when not already said above).
    if (facts.toilets === 'yes' && !stated.has('toilets')) {
      reasons.push({ key: 'toilets', text: 'Toilets confirmed on site' });
      venueFacts += 1;
    } else if (facts.toilets !== 'yes' && facts.toilets !== 'no' && !stated.has('toilets') && children.length > 0) {
      softUnknowns.push({ key: 'toilets-unknown', text: unknownText('toilets', 'Toilets still to be checked') });
    }
    if (facts.parking === 'yes' && !stated.has('parking')) {
      reasons.push({ key: 'parking', text: facts.freeParking === 'yes' ? 'Free parking confirmed' : 'Parking confirmed on site' });
      venueFacts += 1;
    } else if (facts.parking === 'no' && !stated.has('parking')) {
      softCautions.push({ key: 'parking-no', text: 'No parking on site' });
    }
    if (venue.facilities?.includes('cafe') && !recheck('cafe')) {
      reasons.push({ key: 'cafe', text: 'Café on site' });
      venueFacts += 1;
    }
    // A fact that parents have contradicted is withdrawn above; say so for the two that have no unknown line of their own.
    for (const field of ['parking', 'cafe'] as const) {
      const obs = parentObservations[field];
      if (obs?.basis === 'needs_recheck' && !stated.has(field) && (field === 'cafe' ? venue.facilities?.includes('cafe') : venue.trustedFacts?.parking === 'yes')) {
        softUnknowns.push({ key: `${field}-recheck`, text: observationLine(field, obs) });
        parentReported += 1;
      }
    }
  }

  // ---- routines: deliberately absent ----------------------------------------------------------------------------
  // Naps and feeds are not read here. "Leave by 10:48 to be home for Ozzie's feed" assumed the parent was going now, and
  // counted that as a reason the place suits them. Routines are about a chosen day and time, so they are worked out by
  // the planner once there is one (routine-advice.ts), and never rank, recommend or caution against a place before then.

  // Lead with what is about THIS family (their children, their needs), then the venue's facilities, and the plain
  // logistics (how far) last: the first lines a parent reads should be the ones only they would get.
  const rank = (key: string): number => {
    const order = ['age', 'activity', 'buggy', 'stepfree', 'must-', 'baby-changing', 'toilets', 'parking', 'cafe', 'drive-ok'];
    const index = order.findIndex((prefix) => key === prefix || key.startsWith(prefix));
    return index === -1 ? order.length : index;
  };
  reasons.sort((a, b) => rank(a.key) - rank(b.key));

  // ---- the verdict -----------------------------------------------------------------------------------------
  // Positives are the confirmed things about this family and this place. Nothing about the day is among them, so the verdict
  // cannot move with the clock or the forecast.
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

  // One lens per child, from the lines that name them.
  const lens: ChildLens[] = children.map((child) => {
    const mine = (line: MatchLine) => line.childIds?.includes(child.id) ?? false;
    const works = reasons.filter(mine).map((l) => l.text);
    const checkLines = [...breaches, ...softCautions, ...hardUnknowns, ...softUnknowns].filter(mine);
    const state: ChildLens['state'] = breaches.some(mine)
      ? 'concern'
      : checkLines.length > 0
        ? 'check'
        : works.length > 0
          ? 'works'
          : 'unknown';
    // What the confirmed facts about this child rest on: the place's own recommended ages (activity), or only the practical
    // facts (logistics). A practical fact never makes a child "suited".
    const basis: ChildLens['basis'] =
      state !== 'works' ? null : reasons.some((l) => mine(l) && l.aspect === 'activity') ? 'activity' : 'logistics';
    return { id: child.id, name: child.name.trim(), state, basis, works, check: checkLines.map((l) => l.text) };
  });

  // Several children and the place is confirmed for some of them but not all: whoever is left over is a gap in what is
  // known, so it can never be "excellent" (nothing left to check), and it is listed with the things to check.
  const confirmedKids = lens.filter((l) => l.state === 'works');
  const gapKids = children.length > 1 && confirmedKids.length > 0 ? lens.filter((l) => l.state === 'check' || l.state === 'unknown') : [];
  if (verdict === 'excellent' && gapKids.length > 0) verdict = 'good';
  // Excellent says the place suits the children, so every child of a year or more must be covered by activity evidence that
  // holds on any day: the venue's own recommended ages, or a permanent provision for their age. Logistics (toilets, parking,
  // access) never cover a child, and a programme on set days covers no ordinary visit. Under a year the visit is the
  // activity, as everywhere else in Family Fit. Rankings are untouched: the verdict is a label, ordering is by score.
  const activityAge = children.filter((c) => !(childAgeMonths(c) < LOGISTICS_LED_BELOW_MONTHS));
  if (verdict === 'excellent' && !activityAge.every((c) => rangeIds.has(c.id) || provisionIds.has(c.id))) verdict = 'good';
  const easyVisit = children.length > 0 && activityAge.length === 0;
  const gapNames = gapKids.map((l) => l.name).filter(Boolean);
  // Whom the place is NOT confirmed to suit: children nothing is known about (in a household where it is known for another),
  // and children for whom only practical facts are confirmed. Practical facts say the visit is easy, not that the place
  // suits the child, so for a child old enough to take part the gap is said. A baby who is carried, fed and changed is led
  // by logistics: no activity gap is raised for them. Said after the verdict is settled, so it never moves a rating; it
  // keeps the uncertainty visible without inferring anything from age or category.
  const ledByLogistics = (id: string) => {
    const child = children.find((c) => c.id === id);
    return child ? childAgeMonths(child) < LOGISTICS_LED_BELOW_MONTHS : false;
  };
  const uncovered = [
    ...gapKids.filter((l) => l.state === 'unknown' && l.name),
    ...(unreviewed ? [] : lens.filter((l) => l.state === 'works' && l.basis === 'logistics' && l.name && !ledByLogistics(l.id))),
  ];
  if (uncovered.length > 0) {
    softUnknowns.push({
      key: 'child-nothing-confirmed',
      text: cap(unconfirmedSuitsClause(uncovered.map((l) => l.name))),
      childIds: uncovered.map((l) => l.id),
      topic: 'whether it suits them',
    });
  }

  const headline = headlineFor({ verdict, easyVisit, lens, children, lines: { breaches, softCautions, hardUnknowns, softUnknowns } });

  const cautions = [...breaches, ...softCautions];
  const toCheck = [...hardUnknowns, ...softUnknowns];
  // A card carries only what changes a decision: a breach, a requirement still unchecked, or a caution. The softer
  // "still to be checked" lines are for the venue's own page, where they have room and context. Today's opening state is
  // not among them (a card says "Closed today" separately, as a fact: see withClosedLine).
  const firstIssue = breaches[0] ?? hardUnknowns[0] ?? softCautions[0];
  const cardNote = firstIssue?.text ?? reasons[0]?.text ?? null;

  return {
    verdict,
    headline,
    forNames,
    children: lens,
    gapNames,
    reasons,
    cautions,
    toCheck,
    today: { state: today.state, label: today.label },
    availableToday: !notToday && today.state !== 'never_open',
    cardNote,
    evidence: { positives, venueFacts, breaches: breaches.length, hardUnknowns: hardUnknowns.length, parentReported },
    easyVisit,
  };
}

/**
 * The words on a badge. A good or excellent match says who it is good for when a confirmed fact names them
 * ("Good for Sloane"); every other verdict is just its word, because a badge with a name on it is a claim and
 * `possible` and `poor` are not claims worth naming anyone for.
 */
export function matchBadgeText(match: Pick<FamilyMatchResult, 'verdict' | 'forNames'> & { gapNames?: string[]; easyVisit?: boolean }, maxNameChars = 18): string {
  // A household of babies only: what is confirmed is how easy the visit is, and the badge says exactly that. It never says
  // Excellent or Good, which would claim an activity was judged for them. A baby the place is not confirmed for is said.
  if (isEasyVisit(match)) {
    const gap = joinNames(match.gapNames ?? []);
    if (gap) {
      const text = `${EASY_VISIT_LABEL} · check ${gap}`;
      return gap.length <= maxNameChars - 6 ? text : `${EASY_VISIT_LABEL} · check kids`;
    }
    return EASY_VISIT_LABEL;
  }
  if (match.verdict === 'good' || match.verdict === 'excellent') {
    const word = match.verdict === 'excellent' ? 'Excellent' : 'Good';
    // A child the place is not confirmed for is said on the badge too: "Good for Sloane" alone would read as the family.
    const gap = joinNames(match.gapNames ?? []);
    if (gap) {
      const text = `${word} fit · check ${gap}`;
      return gap.length <= maxNameChars - 6 ? text : `${word} fit · check kids`;
    }
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
 * The factual "shut today" line for a card: "Closed today · opens tomorrow 9am". Null unless the place is shut today (all
 * day, or already finished). It is a fact about the place on the day the screen is read; it is NOT part of Family Fit: the
 * verdict, the score and the ranking are identical whether it is shown or not. Cards show it so a place that looks
 * perfectly visitable never hides that it is shut, whatever its verdict and however little room the card has.
 */
export function matchClosedLine(match: Pick<FamilyMatchResult, 'availableToday' | 'today'>): string | null {
  if (match.availableToday !== false) return null;
  return match.today.state === 'closed_today' || match.today.state === 'closed_for_today' ? match.today.label : null;
}

/** A card's reason with the shut-today fact first, so it is the last thing a narrow card can cut. Nothing is added to an open place. */
export function withClosedLine(match: Pick<FamilyMatchResult, 'availableToday' | 'today'>, reason: string): string {
  const closed = matchClosedLine(match);
  if (!closed || reason.toLowerCase().includes(closed.toLowerCase())) return reason;
  return reason ? `${closed} · ${reason}` : closed;
}

/**
 * The line under a card's title. For a good match, whether it is open and the most personal confirmed reason (the
 * journey leads the line on the card, so it is not repeated here); for a possible or poor one, what stands in the way; for a place not yet reviewed,
 * only what the clock says.
 */
export function matchCardReason(match: FamilyMatchResult): string {
  // WHY IT IS ON HOME: lead with what is about THIS family: a confirmed fact about a particular child (their ages are
  // in the recommended range, their buggy is covered), then anything else confirmed. Never the generic, and never the
  // clock: a card is read while browsing, not while leaving. A shut-today place is marked by `withClosedLine`, which is a
  // fact about the day and changes nothing here.
  const others = match.reasons.filter((line) => line.key !== 'drive-ok');
  const lead = others.find((line) => (line.childIds?.length ?? 0) > 0) ?? others[0];
  if (match.verdict === 'good' || match.verdict === 'excellent') {
    return lead?.text ?? '';
  }
  if (match.verdict === 'possible' && lead) {
    // A place that could work still says why it is here, then the one thing to check, so the card is never only a worry.
    // The "we haven't yet confirmed whether this activity suits" line is for the venue page: a card carries only what changes a decision.
    const issue = match.cautions[0] ?? match.toCheck.find((line) => line.key !== 'child-nothing-confirmed');
    return [lead.text, issue?.text].filter(Boolean).join(' · ');
  }
  return match.cardNote ?? '';
}
