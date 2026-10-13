import { hasFitConflict } from '@/src/services/places/fit-order';
import { Venue } from '@/src/types';
import { ExploreBudgetFilter } from '@/src/stores/filters-store';
import {
  coverageAround, Coverage, ExploreAnchor, locate, Located, RadiusMiles, RADIUS_MILES, countWithin, widerRadiusWithMore,
} from '@/src/utils/explore-geo';
import { nameMatches, searchVenues } from '@/src/utils/explore-search';
import { FILTER_SHEET_OPTIONS, FOOD_SHEET_OPTIONS } from '@/src/utils/filter-venues';
import { foodIsUnknown, matchesFoodFilter, FoodFilterId, FOOD_FILTER_IDS } from '@/src/utils/food-nearby';
import { isFreeSpend } from '@/src/utils/spend';
import { classify, EXPLORE_GROUPS, ExploreGroupId, groupLabel, groupOf } from '@/src/utils/venue-classification';
import { environmentOf } from '@/src/utils/venue-taxonomy';

/**
 * EVERYTHING THE EXPLORE SCREEN SHOWS, worked out in one place so it can be tested rather than eyeballed.
 *
 * It takes the places already loaded and returns the answer to: which are within reach, which match what was asked, which are
 * hidden because a confirmed fact rules them out, which could not be checked, and what to change when nothing matches. It
 * calls nothing: no provider, no request, no Google.
 *
 * THREE KINDS OF "NO", never mixed up:
 *   - A filter the place FAILS (an outdoor filter on a museum): the place is simply not a result.
 *   - A confirmed CONFLICT (Parking, and the place's own page says there is none; a household must-have the planner has
 *     confirmed is missing): the place is hidden by default, counted, and shown on request with the reason.
 *   - NOT CHECKED (Parking, and nobody has recorded either way): never a conflict and never a result. It is listed apart,
 *     marked "not checked", because not knowing is not the same as not having it.
 */
type Status = 'pass' | 'fail' | 'conflict' | 'unknown';

export interface ExploreQuery {
  anchor: ExploreAnchor;
  scope: 'nearby' | 'all';
  radius: RadiusMiles;
  query: string;
  /** 'all' or a group id. */
  category: string;
  advanced: readonly string[];
  budget: ExploreBudgetFilter;
  /** Whether the price filters are offered (enough places carry a price). When false a budget never applies. */
  priceFiltersAvailable: boolean;
}

export interface ResultRow {
  venue: Venue;
  miles: number;
  driveMinutes: number;
  /** Why a hidden place is hidden, or what an unchecked place was not checked for. */
  reason?: string;
}

export interface Relaxation {
  id: string;
  label: string;
  /** How many places would match with this one thing taken off. */
  count: number;
}

export interface ExploreResult {
  /** Every place loaded that is an Explore destination, with its distance from the anchor. */
  located: Located[];
  coverage: Coverage;
  /** Places within the distance (all of them in Search all) before the group, search or filters. */
  inScope: number;
  matches: ResultRow[];
  also: { id: string; label: string; rows: ResultRow[] }[];
  /** Name matches beyond the chosen distance, so a place named in Nearby is never lost. */
  outside: ResultRow[];
  hidden: ResultRow[];
  notChecked: ResultRow[];
  /** The facilities (or "open now") the unchecked places were not checked for. */
  notCheckedFor: string[];
  interpretation: string | null;
  activeFilters: { id: string; label: string }[];
  relaxations: Relaxation[];
}

export const FILTER_LABELS: Record<string, string> = Object.fromEntries(
  [...FILTER_SHEET_OPTIONS, ...FOOD_SHEET_OPTIONS].map((o) => [o.id, o.label]),
);

const triStatus = (value: unknown): Status => (value === 'yes' ? 'pass' : value === 'no' ? 'conflict' : 'unknown');

/** One filter, one place. */
export function filterStatus(venue: Venue, filterId: string): Status {
  const facts = venue.trustedFacts;
  switch (filterId) {
    case 'indoor':
      return environmentOf(venue).environment === 'indoor' ? 'pass' : 'fail';
    case 'outdoor':
      return environmentOf(venue).environment === 'outdoor' ? 'pass' : 'fail';
    case 'free':
      return isFreeSpend(venue.estimatedSpend) ? 'pass' : 'fail';
    case 'open_now':
      // `isOpen` is worked out from the weekly schedule and the clock (or a provider flag only while it is fresh); undefined
      // means it cannot be said, which is not the same as shut.
      return venue.isOpen === true ? 'pass' : venue.isOpen === false ? 'fail' : 'unknown';
    case 'parking':
      return triStatus(facts?.parking);
    case 'toilets':
      return triStatus(facts?.toilets);
    case 'baby_changing':
      return triStatus(facts?.babyChanging);
    case 'playground':
      return triStatus(facts?.playground);
    case 'wheelchair':
      return triStatus(facts?.wheelchairAccessible);
    case 'pushchair': {
      const suitability = facts?.pushchairSuitability;
      if (suitability === 'good' || suitability === 'excellent' || venue.facilities?.includes('pushchair_friendly')) return 'pass';
      if (suitability === 'difficult') return 'conflict';
      return 'unknown';
    }
    case 'food_onsite':
    case 'food_5':
    case 'food_10':
      return matchesFoodFilter(venue, filterId as FoodFilterId) ? 'pass' : foodIsUnknown(venue) ? 'unknown' : 'fail';
    default:
      return 'pass';
  }
}

const CONFLICT_REASON: Record<string, string> = {
  parking: 'Parking: its own page says there is none',
  toilets: 'Toilets: its own page says there are none',
  baby_changing: 'Baby changing: its own page says there is none',
  playground: 'Playground: its own page says there is none',
  wheelchair: 'Wheelchair access: its own page says there is none',
  pushchair: 'Pushchair access: its own page says it is difficult',
};

const UNCHECKED_LABEL: Record<string, string> = {
  open_now: 'opening hours',
  food_onsite: 'food',
  food_5: 'food',
  food_10: 'food',
};

/** The reason a household's confirmed must-have conflict hides a place: the planner's own detail, else the field. */
function fitConflictReason(venue: Venue): string {
  const first = venue.fitConflicts?.[0];
  if (!first) return '';
  return first.detail ? String(first.detail) : `Does not meet a must-have (${first.field})`;
}

function matchesBudget(venue: Venue, budget: ExploreBudgetFilter): boolean {
  if (budget === 'any') return true;
  const spend = venue.estimatedSpend;
  if (!spend) return false;
  if (budget === 'free') return isFreeSpend(spend);
  return false;
}

interface Evaluated {
  row: ResultRow;
  status: 'match' | 'conflict' | 'unchecked' | 'fail';
  conflicts: string[];
  unchecked: string[];
}

function evaluate(row: ResultRow, advanced: readonly string[]): Evaluated {
  const conflicts: string[] = [];
  const unchecked: string[] = [];
  let failed = false;
  for (const id of advanced) {
    const status = filterStatus(row.venue, id);
    if (status === 'fail') failed = true;
    else if (status === 'conflict') conflicts.push(CONFLICT_REASON[id] ?? `${FILTER_LABELS[id] ?? id}: ruled out`);
    else if (status === 'unknown') unchecked.push(id);
  }
  if (failed) return { row, status: 'fail', conflicts, unchecked };
  // A household's confirmed must-have conflict hides a place whatever the filters say.
  if (hasFitConflict(row.venue)) conflicts.push(fitConflictReason(row.venue));
  if (conflicts.length) return { row, status: 'conflict', conflicts, unchecked };
  if (unchecked.length) return { row, status: 'unchecked', conflicts, unchecked };
  return { row, status: 'match', conflicts, unchecked };
}

const byFit = (a: ResultRow, b: ResultRow) =>
  b.venue.familyScore.score - a.venue.familyScore.score || a.miles - b.miles;

function compute(venues: readonly Venue[], q: ExploreQuery) {
  const explorable = venues.filter((v) => groupOf(v) !== null);
  const located = locate(explorable, q.anchor);
  const rowOf = (l: Located): ResultRow => ({ venue: l.venue, miles: l.miles, driveMinutes: l.driveMinutes });

  const inReach = (l: Located) => q.scope === 'all' || (Number.isFinite(l.miles) && l.miles <= q.radius);
  const scoped = located.filter(inReach);
  const inGroup = (l: Located) => q.category === 'all' || groupOf(l.venue) === (q.category as ExploreGroupId);
  const grouped = scoped.filter(inGroup);
  const byVenue = new Map(located.map((l) => [l.venue.id, l]));

  const search = searchVenues(grouped.map((l) => l.venue), q.query);
  const budgetOk = (v: Venue) => !q.priceFiltersAvailable || matchesBudget(v, q.budget);
  const rowsOf = (list: Venue[]) => list.filter(budgetOk).map((v) => rowOf(byVenue.get(v.id) as Located));

  const evaluated = rowsOf(search.primary).map((row) => evaluate(row, q.advanced));
  const matches = evaluated.filter((e) => e.status === 'match').map((e) => e.row);
  const hidden = evaluated.filter((e) => e.status === 'conflict').map((e) => ({ ...e.row, reason: e.conflicts[0] }));
  const notChecked = evaluated
    .filter((e) => e.status === 'unchecked')
    .map((e) => ({ ...e.row, reason: `Not checked: ${[...new Set(e.unchecked.map((id) => UNCHECKED_LABEL[id] ?? (FILTER_LABELS[id] ?? id).toLowerCase()))].join(', ')}` }));
  const notCheckedFor = [...new Set(notChecked.flatMap((r) => (r.reason ?? '').replace('Not checked: ', '').split(', ')))];

  const also = search.also
    .map((g) => ({ id: g.id, label: g.label, rows: rowsOf(g.venues).filter((r) => evaluate(r, q.advanced).status === 'match') }))
    .filter((g) => g.rows.length);

  // A place named in Nearby, but beyond the distance, is listed rather than lost.
  const outside: ResultRow[] = q.scope === 'nearby' && q.query.trim()
    ? located
        .filter((l) => !inReach(l) && inGroup(l) && nameMatches(l.venue, q.query))
        .map(rowOf)
        .filter((r) => evaluate(r, q.advanced).status === 'match')
        .sort(byFit)
        .slice(0, 5)
    : [];

  return {
    located,
    scopedCount: scoped.length,
    matches: matches.sort(byFit),
    hidden: hidden.sort(byFit),
    // The places that confirm most of what was asked come first: one with a single gap before one with nothing recorded.
    notChecked: notChecked
      .map((row) => ({ row, gaps: evaluated.find((e) => e.row.venue.id === row.venue.id)?.unchecked.length ?? 0 }))
      .sort((a, b) => a.gaps - b.gaps || byFit(a.row, b.row))
      .map((x) => x.row),
    notCheckedFor,
    also: also.map((g) => ({ ...g, rows: g.rows.sort(byFit) })),
    outside,
    interpretation: search.interpretation,
  };
}

export function activeFilterChips(q: Pick<ExploreQuery, 'category' | 'advanced' | 'budget' | 'radius' | 'scope'>, defaultRadius: RadiusMiles = 5): { id: string; label: string }[] {
  const chips: { id: string; label: string }[] = [];
  if (q.category !== 'all') chips.push({ id: `category:${q.category}`, label: groupLabel(q.category as ExploreGroupId) });
  for (const id of q.advanced) chips.push({ id: `filter:${id}`, label: FILTER_LABELS[id] ?? id });
  if (q.budget !== 'any') chips.push({ id: 'budget', label: q.budget === 'free' ? 'Free' : 'Budget' });
  if (q.scope === 'nearby' && q.radius !== defaultRadius) chips.push({ id: 'radius', label: `Within ${q.radius} miles` });
  return chips;
}

/** What taking off one thing would leave, for every thing that can be taken off and would leave something. */
function relaxationsFor(venues: readonly Venue[], q: ExploreQuery, coverage: Coverage): Relaxation[] {
  const out: Relaxation[] = [];
  const countWith = (override: Partial<ExploreQuery>) => compute(venues, { ...q, ...override }).matches.length;
  if (q.category !== 'all') {
    const count = countWith({ category: 'all' });
    if (count > 0) out.push({ id: 'category', label: `Take off ${groupLabel(q.category as ExploreGroupId)}`, count });
  }
  for (const id of q.advanced) {
    const count = countWith({ advanced: q.advanced.filter((f) => f !== id) });
    if (count > 0) out.push({ id: `filter:${id}`, label: `Take off ${FILTER_LABELS[id] ?? id}`, count });
  }
  if (q.query.trim()) {
    const count = countWith({ query: '' });
    if (count > 0) out.push({ id: 'query', label: 'Clear the search words', count });
  }
  if (q.scope === 'nearby') {
    const wider = widerRadiusWithMore(coverage, q.radius);
    if (wider) {
      const count = countWith({ radius: wider });
      if (count > 0) out.push({ id: `radius:${wider}`, label: `Within ${wider} miles instead`, count });
    }
    const all = countWith({ scope: 'all' });
    if (all > 0) out.push({ id: 'scope', label: 'Search all of London', count: all });
  }
  // What to take off first: the filters and words that are narrowing the list (most places back first), then a wider distance,
  // and Search all of London last, because it is the biggest step away from what was asked.
  const rank = (r: Relaxation) => (r.id.startsWith('radius:') ? 1 : r.id === 'scope' ? 2 : 0);
  return out.sort((a, b) => rank(a) - rank(b) || b.count - a.count);
}

export function runExplore(venues: readonly Venue[], q: ExploreQuery): ExploreResult {
  const base = compute(venues, q);
  const coverage = coverageAround(base.located);
  const hasMatches = base.matches.length > 0 || base.also.length > 0 || base.outside.length > 0;
  return {
    located: base.located,
    coverage,
    inScope: base.scopedCount,
    matches: base.matches,
    also: base.also,
    outside: base.outside,
    hidden: base.hidden,
    notChecked: base.notChecked,
    notCheckedFor: base.notCheckedFor,
    interpretation: base.interpretation,
    activeFilters: activeFilterChips(q),
    relaxations: hasMatches ? [] : relaxationsFor(venues, q, coverage),
  };
}

export { EXPLORE_GROUPS, FOOD_FILTER_IDS, RADIUS_MILES, countWithin, classify };
