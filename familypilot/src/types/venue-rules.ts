/**
 * Venue-specific rules: the things a venue says that change what a visit is, and that no yes/no facility fact can hold.
 *
 * "Pushchairs are not allowed in any storytelling or play area", "the Natural History Gallery is closed for refurbishment",
 * "closed on 9 October" and "the courtyard (with the toilets) is closed on Mondays" are each a statement about one venue, one
 * place within it, or one date range. Reduced to a TriState they either vanish or get over-applied, so they travel as their
 * own structured records and are evaluated against the visit and the household at planning time.
 *
 * WHERE THEY COME FROM. Only reviewed evidence: a rule is stored as an approved `rules.<id>` venue claim with its source
 * page and quote, so nothing here is inferred from a category or written by a model. A venue with no rules is simply a venue
 * nobody has recorded a rule for; it is never read as "no restrictions".
 *
 * WHAT THEY MAY DO. A rule can (a) refuse a date (the whole venue is closed), (b) refuse a household that depends on
 * something the venue does not allow (a pushchair user where pushchairs are not allowed in the core experience), or
 * (c) add a plain warning. Everything else is context. A rule never changes a ranking weight.
 */

export type VenueRuleKind =
  /** Part or all of the venue is shut. */
  | 'closure'
  /** What may be brought in or used: pushchairs, scooters, dogs. */
  | 'pushchair'
  /** Step-free and mobility-aid access gaps (a lift out of order, a mezzanine without a lift). */
  | 'step_free'
  /** Entry needs booking, or capacity can be reached. */
  | 'booking'
  /** A practical warning that prohibits nothing (steep paths, building noise, a busy hour). */
  | 'caution';

export type VenueRuleScope = 'venue' | 'area';

export interface VenueRule {
  /** Stable key within the venue, e.g. `pushchair-play-areas`. Also the claim field suffix. */
  id: string;
  kind: VenueRuleKind;
  /** Whole venue, or one named part of it. */
  scope: VenueRuleScope;
  /** The part, when `scope` is `area`: "Natural History Gallery". */
  area?: string | null;
  /**
   * Whether the rule touches the main reason to visit. Set by the reviewer, never inferred. A pushchair prohibition in the
   * play areas of a venue that is a play centre covers the core visit; the same rule at a museum's soft-play corner does not.
   */
  coversCoreVisit?: boolean;
  /** Inclusive dates, `YYYY-MM-DD`. Both absent means the rule has no date limit. */
  from?: string | null;
  until?: string | null;
  /** Days of the week it applies on (0 = Sunday). Absent means every day in the date range. */
  weekdays?: number[] | null;
  /**
   * Facilities a closure takes away while it lasts ("the courtyard with the toilets is closed on Mondays"). A household that
   * listed one of these as a must-have is warned prominently; others are not told.
   */
  affectsFacilities?: Array<'toilets' | 'babyChanging' | 'parking'> | null;
  /** Parent-facing sentence, reviewed. Shown as written. */
  text: string;
  sourceUrl?: string | null;
  checkedAt?: string | null;
}

export interface VenueRuleNote {
  ruleId: string;
  /** `important` needs the parent to do something (a prominent warning); `info` is worth knowing. */
  severity: 'important' | 'info';
  text: string;
}

/** What a visit looks like, for the purposes of reading the rules. */
export interface VenueRuleVisit {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Someone in the party goes in a pushchair. */
  usesPushchair: boolean;
  /** The household listed buggy access as a must-have. */
  requiresPushchair: boolean;
  /** Facilities the household listed as must-haves. */
  requiredFacilities?: ReadonlyArray<'toilets' | 'babyChanging' | 'parking'>;
  /** Someone in the party uses a wheelchair or mobility aid. */
  needsStepFree: boolean;
}

export interface VenueRuleVerdict {
  /** The whole venue is closed on this date: do not schedule it. */
  closedAllDay: VenueRule | null;
  /** A rule the household cannot work around: a required thing the core visit does not allow. */
  blocksHousehold: VenueRule | null;
  notes: VenueRuleNote[];
}
