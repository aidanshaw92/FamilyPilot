import {
  ACTIVITY_EVIDENCE_LIFETIME_DAYS,
  REVIEWED_ACTIVITY_EVIDENCE,
  type ReviewedActivityEvidence,
} from '@/src/data/reviewed-activity-evidence';

/**
 * What a venue's own pages say children of an age can do there, as reviewed by a person (docs/EXCELLENT_RULE_V2.md).
 *
 * Kept apart from logistics on purpose: a playground, toilets or a car park never make a child "suited"; only these lines
 * and the venue's own recommended ages do. A programme (classes, a weekly run) names the child but never establishes
 * all-day suitability, so it never supports Excellent.
 */
export type ActivityEvidence = Pick<ReviewedActivityEvidence, 'kind' | 'minMonths' | 'maxMonthsExclusive' | 'label'> & {
  /** The day the page was read (ISO date). */
  readOn: string;
};

const DAY_MS = 86_400_000;
const byVenue = new Map<string, ReviewedActivityEvidence[]>();
for (const entry of REVIEWED_ACTIVITY_EVIDENCE) {
  const list = byVenue.get(entry.venueId) ?? [];
  list.push(entry);
  byVenue.set(entry.venueId, list);
}

/** London's calendar day for `now`, so an entry lapses at the same moment for every reader. */
function londonDay(now: Date): number {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now)
    .split('-')
    .map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * The reviewed evidence still in date for this venue. An entry counts for `ACTIVITY_EVIDENCE_LIFETIME_DAYS` from the day its
 * page was read and then stops counting until a person reads the page again: it is never extended without a new reading.
 */
export function activityEvidenceFor(venueId: string, now: Date = new Date()): ActivityEvidence[] {
  const entries = byVenue.get(venueId);
  if (!entries) return [];
  const today = londonDay(now);
  return entries
    .filter((e) => {
      const read = Date.parse(`${e.evidence.retrievedAt}T00:00:00Z`);
      return Number.isFinite(read) && today - read <= ACTIVITY_EVIDENCE_LIFETIME_DAYS * DAY_MS;
    })
    .map((e) => ({ kind: e.kind, minMonths: e.minMonths, maxMonthsExclusive: e.maxMonthsExclusive, label: e.label, readOn: e.evidence.retrievedAt }));
}

export const evidenceCovers = (e: Pick<ActivityEvidence, 'minMonths' | 'maxMonthsExclusive'>, ageMonths: number): boolean =>
  Number.isFinite(ageMonths) && ageMonths >= e.minMonths && ageMonths < e.maxMonthsExclusive;
