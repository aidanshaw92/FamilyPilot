/**
 * What it costs this family to get in: the data contract, the calculator, and the words.
 *
 * WHY THIS EXISTS BEFORE ANY PRICE DOES. On 2026-10-07 no venue in the catalogue carried a price (0 of 168 have an estimated
 * spend, no pricing claim exists), so the right first move is the rules for what may be said once one does, written so that
 * a wrong answer is impossible to produce by accident:
 *
 *   - UNKNOWN IS NEVER ZERO. A venue with no confirmed price, a stale one, or one that does not cover an attendee says so.
 *     "Free" is a positive, sourced statement (`status: 'free'`), never the absence of a price.
 *   - NOTHING IS ASSUMED ABOUT BABIES, CHILDREN OR FAMILY TICKETS. A child is free only where a band that covers their age on
 *     the visit date says free. A child no band covers makes the whole estimate unknown. A family ticket is used only when the
 *     party fits its stated limits, and is compared with the individual tickets rather than assumed cheaper.
 *   - NO CATEGORY INFERENCE. Nothing here guesses a price from "museum" or "farm".
 *   - A MINIMUM IS NOT A TOTAL. "From £X" is the label for the cheapest paid ticket; an estimate for a family is computed from
 *     the people who are coming and is labelled as an estimate with its conditions.
 *   - A PARTIAL SUBTOTAL IS NEVER A TOTAL. With several families, each has its own line and the combined figure exists only
 *     when every line is known; otherwise the known part is labelled as such, with how many are unknown.
 *
 * Pure: no I/O, no clock (the caller passes the visit date), no provider.
 */

export type TicketKind = 'adult' | 'child' | 'concession' | 'under';

/** An individual ticket band. Ages are in whole months on the visit date; `minAgeMonths` is inclusive, `maxAgeMonthsExclusive` exclusive. */
export interface TicketBand {
  kind: TicketKind;
  /** Pence. `0` only with `free: true` (an explicit "free"), never as a stand-in for "not stated". */
  amountPence: number;
  /** True when the source states this band is free ("Under 3s free"). */
  free?: boolean;
  /** Which attendees this band is for. An adult band has no age limits unless stated. */
  minAgeMonths?: number;
  maxAgeMonthsExclusive?: number;
  /** The band's own words, e.g. "Children 3 to 15". */
  label?: string;
}

/** A ticket that covers a party. Counts are inclusive limits that the source states, never inferred. */
export interface FamilyTicket {
  amountPence: number;
  minAdults: number;
  maxAdults: number;
  minChildren: number;
  maxChildren: number;
  /** Oldest child the ticket covers, in months (exclusive), where the source states one. */
  maxChildAgeMonthsExclusive?: number;
  label?: string;
}

export interface PricingSource {
  url: string;
  /** ISO date the page was read. */
  checkedAt: string;
  /** ISO date after which this price should not be relied on. */
  validUntil?: string;
}

export interface AdmissionPricing {
  /** `free` is a confirmed statement of free entry. A missing price is NOT `free`; it is no `AdmissionPricing` at all. */
  status: 'free' | 'paid';
  bands?: TicketBand[];
  familyTickets?: FamilyTicket[];
  source: PricingSource;
  /** Plain-words conditions that change what is paid ("peak days", "booking required", "with Gift Aid"). */
  conditions?: string[];
  bookingRequired?: boolean;
  bookingUrl?: string;
}

export interface Attendee {
  id: string;
  kind: 'adult' | 'child';
  /** Whole months on the visit date. Required for a child; an unknown age makes a child's price unknown. */
  ageMonths?: number | null;
  /** How the line reads: a first name or "Adult". The family's own names stay on the device. */
  label: string;
}

export type Unknown =
  | 'no-price'
  | 'stale'
  | 'attendee-not-covered'
  | 'child-age-unknown'
  | 'no-adult-price';

export interface AdmissionLine {
  attendeeId: string;
  label: string;
  /** Pence; `0` only when the covering band says free. */
  amountPence: number;
  free: boolean;
  rule: string;
}

export type AdmissionEstimate =
  | { state: 'free'; totalPence: 0; source: PricingSource }
  | {
      state: 'known';
      totalPence: number;
      /** How the total was reached: each person, or one family ticket. */
      basis: 'individual' | 'family-ticket';
      lines: AdmissionLine[];
      /** The other way, where both were computable, so a parent can see what a family ticket saved or cost. */
      alternative?: { basis: 'individual' | 'family-ticket'; totalPence: number };
      /**
       * Set when the family ticket is the ONLY route that could be worked out: someone in the party is not covered by any
       * stated individual band. The family ticket is a real price the party can pay; whether a cheaper way in exists is
       * not known, so it is shown as the family ticket's price, never as "what it costs this family".
       */
      individualUnknown?: { reason: Unknown; detail: string };
      conditions: string[];
      source: PricingSource;
    }
  | {
      state: 'unknown';
      reason: Unknown;
      detail: string;
      source?: PricingSource;
      /** Set for a `stale` price still within MAX_PRICE_AGE_DAYS: what the page said, to be shown dated and as possibly changed. */
      lastKnown?: { checkedAt: string; lines: string[] };
    };

const DAY_MS = 86_400_000;
/**
 * How long one reading of a price can be relied on, by what the page said (docs/PRICING_FRESHNESS_POLICY.md).
 *
 *   paid   180 days. Attractions revise admission at least yearly and often at a season boundary (Easter, summer, the
 *          new year), so a reading older than six months may already be wrong. A stated end on the page (`validUntil`)
 *          wins when it is earlier.
 *   free   365 days. Free entry is a standing policy, not a tariff; it still carries its date.
 *
 * Past its window a price is never shown as current. Up to MAX_PRICE_AGE_DAYS the reading is still shown as the LAST
 * KNOWN price, dated and worded as possibly changed, so a parent can judge it; after that no figure is shown at all.
 */
export const PRICE_FRESHNESS_DAYS = { paid: 180, free: 365 } as const;
/** Beyond this not even a last-known figure is shown. */
export const MAX_PRICE_AGE_DAYS = 400;

export function priceFreshnessDays(status: AdmissionPricing['status']): number {
  return PRICE_FRESHNESS_DAYS[status];
}

export type PriceFreshness = 'current' | 'last-known' | 'expired';

function parseDay(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Current, last known, or expired, for a visit on `visitDate` (ISO). An unreadable date is expired: unknown fails closed. */
export function priceFreshness(pricing: Pick<AdmissionPricing, 'status' | 'source'>, visitDate: string): PriceFreshness {
  const visit = parseDay(visitDate);
  const checked = parseDay(pricing.source.checkedAt);
  if (visit === null || checked === null) return 'expired';
  const age = visit - checked;
  if (age < 0 || age > MAX_PRICE_AGE_DAYS * DAY_MS) return 'expired';
  const until = parseDay(pricing.source.validUntil);
  if (until !== null && visit > until) return 'last-known';
  return age <= priceFreshnessDays(pricing.status) * DAY_MS ? 'current' : 'last-known';
}

/** Whether a stored price can be relied on for a visit on `visitDate` (ISO). Paid unless the caller says free. */
export function priceIsCurrent(source: PricingSource, visitDate: string, status: AdmissionPricing['status'] = 'paid'): boolean {
  return priceFreshness({ status, source }, visitDate) === 'current';
}

/** What the page said, in a parent's words, for the last-known fallback: "Adult £17, Children 3 to 15 £8.50". */
export function lastKnownLines(pricing: AdmissionPricing): string[] {
  if (pricing.status === 'free') return ['Free entry'];
  const bandName = (b: TicketBand): string => b.label ?? { adult: 'Adult', child: 'Child', concession: 'Concession', under: 'Youngest children' }[b.kind];
  const bands = (pricing.bands ?? []).map((b) => `${bandName(b)} ${b.free || b.amountPence === 0 ? 'free' : money(b.amountPence)}`);
  const family = (pricing.familyTickets ?? []).map((t) => `${t.label ?? 'Family ticket'} ${money(t.amountPence)}`);
  return [...bands, ...family];
}

const covers = (band: TicketBand, ageMonths: number): boolean =>
  (band.minAgeMonths === undefined || ageMonths >= band.minAgeMonths) &&
  (band.maxAgeMonthsExclusive === undefined || ageMonths < band.maxAgeMonthsExclusive);

const money = (pence: number): string => `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;

/**
 * The cost of admission for these people on this day, or why it cannot be said.
 *
 * Individual tickets are computed for every attendee; if any attendee is not covered by a band the individual route is
 * unknown (it is never filled in with a guess). Family tickets are considered only if the party fits one, and the cheaper
 * of two known routes is returned with the other as `alternative`. If only one route is computable it is the answer.
 */
export function estimateFamilyAdmission(
  pricing: AdmissionPricing | null | undefined,
  attendees: readonly Attendee[],
  visitDate: string,
): AdmissionEstimate {
  if (!pricing) return { state: 'unknown', reason: 'no-price', detail: 'No price has been confirmed for this place.' };
  const freshness = priceFreshness(pricing, visitDate);
  if (freshness !== 'current') {
    return {
      state: 'unknown',
      reason: 'stale',
      detail: 'The last price we have is out of date for this visit, so it is not shown as current.',
      source: pricing.source,
      ...(freshness === 'last-known' ? { lastKnown: { checkedAt: pricing.source.checkedAt, lines: lastKnownLines(pricing) } } : {}),
    };
  }
  if (pricing.status === 'free') return { state: 'free', totalPence: 0, source: pricing.source };

  const bands = pricing.bands ?? [];
  const lines: AdmissionLine[] = [];
  let individualProblem: { reason: Unknown; detail: string } | null = null;

  for (const person of attendees) {
    if (person.kind === 'adult') {
      // Only a band for adults (no age limits that exclude an adult) prices an adult.
      const band = bands.find((b) => b.kind === 'adult');
      if (!band) {
        individualProblem ??= { reason: 'no-adult-price', detail: 'There is no adult price on record.' };
        continue;
      }
      lines.push({ attendeeId: person.id, label: person.label, amountPence: band.free ? 0 : band.amountPence, free: Boolean(band.free), rule: band.label ?? 'Adult' });
      continue;
    }
    if (person.ageMonths == null || !Number.isFinite(person.ageMonths)) {
      individualProblem ??= { reason: 'child-age-unknown', detail: `We do not know ${person.label}'s age on the day, so their ticket cannot be priced.` };
      continue;
    }
    // The child bands that cover this child's age. The cheapest stated one wins only if several apply (e.g. under-3s free
    // and a 0 to 15 band): the more specific, lower price is what the venue itself would charge.
    // Only child and under-N bands price a child. A concession band (students, over-60s) never does, whatever its age limits.
    const matching = bands.filter((b) => (b.kind === 'child' || b.kind === 'under') && covers(b, person.ageMonths as number));
    if (matching.length === 0) {
      individualProblem ??= { reason: 'attendee-not-covered', detail: `No ticket on record covers ${person.label} at this age.` };
      continue;
    }
    const band = matching.reduce((best, b) => ((b.free ? 0 : b.amountPence) < (best.free ? 0 : best.amountPence) ? b : best));
    lines.push({ attendeeId: person.id, label: person.label, amountPence: band.free ? 0 : band.amountPence, free: Boolean(band.free), rule: band.label ?? (band.free ? 'Free' : 'Child') });
  }

  const individualTotal = individualProblem ? null : lines.reduce((sum, l) => sum + l.amountPence, 0);

  // Family tickets: only a party that fits the stated limits, and only if every child is inside any stated age limit.
  const adults = attendees.filter((a) => a.kind === 'adult').length;
  const children = attendees.filter((a) => a.kind === 'child');
  const fitting = (pricing.familyTickets ?? []).filter(
    (t) =>
      adults >= t.minAdults &&
      adults <= t.maxAdults &&
      children.length >= t.minChildren &&
      children.length <= t.maxChildren &&
      (t.maxChildAgeMonthsExclusive === undefined ||
        children.every((c) => c.ageMonths != null && Number.isFinite(c.ageMonths) && (c.ageMonths as number) < (t.maxChildAgeMonthsExclusive as number))),
  );
  const family = fitting.length ? fitting.reduce((best, t) => (t.amountPence < best.amountPence ? t : best)) : null;
  const conditions = pricing.conditions ?? [];

  if (individualTotal !== null && family) {
    const cheaperFamily = family.amountPence < individualTotal;
    return cheaperFamily
      ? {
          state: 'known', totalPence: family.amountPence, basis: 'family-ticket',
          lines: [{ attendeeId: 'party', label: 'Your party', amountPence: family.amountPence, free: false, rule: family.label ?? 'Family ticket' }],
          alternative: { basis: 'individual', totalPence: individualTotal }, conditions, source: pricing.source,
        }
      : {
          state: 'known', totalPence: individualTotal, basis: 'individual', lines,
          alternative: { basis: 'family-ticket', totalPence: family.amountPence }, conditions, source: pricing.source,
        };
  }
  if (individualTotal !== null) {
    return { state: 'known', totalPence: individualTotal, basis: 'individual', lines, conditions, source: pricing.source };
  }
  if (family) {
    // Individual tickets could not be worked out, but the party fits a family ticket whose price is stated.
    return {
      state: 'known', totalPence: family.amountPence, basis: 'family-ticket',
      lines: [{ attendeeId: 'party', label: 'Your party', amountPence: family.amountPence, free: false, rule: family.label ?? 'Family ticket' }],
      conditions, source: pricing.source,
      individualUnknown: individualProblem ?? { reason: 'attendee-not-covered', detail: 'Not every ticket in your party is priced on record.' },
    };
  }
  return { state: 'unknown', reason: individualProblem?.reason ?? 'no-price', detail: individualProblem?.detail ?? 'The price cannot be worked out for this party.', source: pricing.source };
}

/** One family's line in an outing with several. */
export interface PartyAdmission {
  partyId: string;
  label: string;
  estimate: AdmissionEstimate;
}

export interface OutingAdmission {
  parties: PartyAdmission[];
  /** The sum, only when EVERY party is known (free counts as known). Otherwise null: there is no combined total. */
  combinedPence: number | null;
  /** What is known so far, for saying "£X so far". Null when nothing is known. */
  knownSubtotalPence: number | null;
  unknownParties: number;
}

/** Separate subtotals for each family and a combined total only where it is complete. */
export function combineAdmission(parties: readonly PartyAdmission[]): OutingAdmission {
  let known = 0;
  let knownCount = 0;
  for (const p of parties) {
    if (p.estimate.state === 'free') knownCount += 1;
    else if (p.estimate.state === 'known') { known += p.estimate.totalPence; knownCount += 1; }
  }
  const unknownParties = parties.length - knownCount;
  return {
    parties: [...parties],
    combinedPence: unknownParties === 0 && parties.length > 0 ? known : null,
    knownSubtotalPence: knownCount > 0 ? known : null,
    unknownParties,
  };
}

/** A cost that is not admission (parking, an optional activity). Unknown stays unknown. */
export interface ExtraCost {
  label: string;
  /** Pence, or null when the amount is not confirmed. */
  amountPence: number | null;
  optional?: boolean;
}

export interface OutingTotals {
  admission: OutingAdmission;
  extras: ExtraCost[];
  /** True only when admission is complete AND every extra has an amount. A figure shown when this is false is a subtotal. */
  complete: boolean;
  /** Pence: the known part (admission combined or known so far, plus extras with amounts). Null when nothing is known. */
  knownPence: number | null;
  /** How many items (families or extras) have no amount. */
  unknownItems: number;
}

/** Admission and extras side by side, never merged into a figure that implies completeness it does not have. */
export function outingTotals(admission: OutingAdmission, extras: readonly ExtraCost[]): OutingTotals {
  const required = extras.filter((e) => !e.optional);
  const unknownExtras = required.filter((e) => e.amountPence === null).length;
  const knownExtras = required.filter((e) => e.amountPence !== null).reduce((s, e) => s + (e.amountPence as number), 0);
  const admissionKnown = admission.combinedPence ?? admission.knownSubtotalPence;
  const anyKnown = admissionKnown !== null || required.some((e) => e.amountPence !== null);
  return {
    admission,
    extras: [...extras],
    complete: admission.combinedPence !== null && unknownExtras === 0,
    knownPence: anyKnown ? (admissionKnown ?? 0) + knownExtras : null,
    unknownItems: admission.unknownParties + unknownExtras,
  };
}

/* ---------- the words ---------- */

export type PriceBadge = { kind: 'free' | 'from' | 'unknown'; text: string };

/**
 * The concise label for a card or list: "Free entry", "From £X", or "Price not confirmed". `From` is the cheapest PAID ticket
 * and is worded as a minimum; it is never presented as what a family pays. A stale or missing price is "Price not confirmed".
 */
export function priceBadge(pricing: AdmissionPricing | null | undefined, visitDate: string): PriceBadge {
  if (!pricing || priceFreshness(pricing, visitDate) !== 'current') return { kind: 'unknown', text: 'Price not confirmed' };
  if (pricing.status === 'free') return { kind: 'free', text: 'Free entry' };
  // Individual tickets only for "From": a family ticket is not a per-person price, so it is the fallback and no more.
  const individual = (pricing.bands ?? []).filter((b) => !b.free && b.amountPence > 0).map((b) => b.amountPence);
  const family = (pricing.familyTickets ?? []).filter((t) => t.amountPence > 0).map((t) => t.amountPence);
  const cheapest = individual.length ? Math.min(...individual) : family.length ? Math.min(...family) : null;
  return cheapest === null ? { kind: 'unknown', text: 'Price not confirmed' } : { kind: 'from', text: `From ${money(cheapest)}` };
}

export interface AdmissionView {
  headline: string;
  /** Lines for the breakdown; empty when unknown. */
  breakdown: string[];
  conditions: string[];
  /** "Checked 12 Oct 2026" and where, so freshness and source are visible. */
  provenance: string | null;
  bookingRequired: boolean;
  bookingUrl: string | null;
  /** True when the figure is an estimate to be confirmed with the venue. */
  isEstimate: boolean;
}

const fmtDate = (iso: string): string => {
  const t = parseDay(iso);
  return t === null ? iso : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

/** The Venue Detail wording for an estimate. Never says "total" for something incomplete, never "free" for unknown. */
export function admissionView(estimate: AdmissionEstimate, pricing: AdmissionPricing | null | undefined): AdmissionView {
  const booking = { bookingRequired: Boolean(pricing?.bookingRequired), bookingUrl: pricing?.bookingUrl ?? null };
  if (estimate.state === 'free') {
    return { headline: 'Free entry', breakdown: [], conditions: pricing?.conditions ?? [], provenance: `Checked ${fmtDate(estimate.source.checkedAt)}`, isEstimate: false, ...booking };
  }
  if (estimate.state === 'unknown') {
    // A current price that does not cover this party (a 3-year-old where tickets start at 7) is not a stale price: say whom
    // it does not cover, and when the prices were checked, rather than "last price on record", which reads as out of date.
    const partyGap = estimate.reason === 'attendee-not-covered' || estimate.reason === 'child-age-unknown' || estimate.reason === 'no-adult-price';
    if (estimate.lastKnown) {
      // Past its freshness window but within 400 days: the figure is shown as what the page said on that date, never
      // as what it costs now, and the parent is sent to the venue to confirm.
      return {
        headline: 'Price not confirmed',
        breakdown: [
          `Last known price: ${estimate.lastKnown.lines.join(', ')}.`,
          'Prices may have changed since then. Check with the venue before you go.',
        ],
        conditions: [],
        provenance: `Last checked ${fmtDate(estimate.lastKnown.checkedAt)}`,
        isEstimate: false,
        ...booking,
      };
    }
    return {
      headline: partyGap ? 'Price not confirmed for your party' : 'Price not confirmed',
      breakdown: partyGap ? [estimate.detail] : [],
      conditions: partyGap ? pricing?.conditions ?? [] : [],
      provenance: estimate.source
        ? partyGap
          ? `Prices checked ${fmtDate(estimate.source.checkedAt)}`
          : `Last price on record checked ${fmtDate(estimate.source.checkedAt)}`
        : null,
      isEstimate: false,
      ...booking,
    };
  }
  if (estimate.individualUnknown) {
    // Museum of Brands, two adults with a 4-year-old and a 1-year-old: the family ticket (£36, 2 adults and 2 children) is a
    // price this party can pay. Whether the children would be free on individual tickets is not stated outside a
    // Universal Credit offer, so no cheaper total is invented and none is implied.
    return {
      headline: `Family ticket ${money(estimate.totalPence)}`,
      breakdown: [
        `${estimate.lines[0]?.rule ?? 'Family ticket'}: ${money(estimate.totalPence)}`,
        `${estimate.individualUnknown.detail} Ask the venue whether a cheaper way in applies.`,
      ],
      conditions: estimate.conditions,
      provenance: `Checked ${fmtDate(estimate.source.checkedAt)}`,
      isEstimate: true,
      ...booking,
    };
  }
  const breakdown = estimate.lines.map((l) => `${l.label}: ${l.free ? 'free' : money(l.amountPence)} (${l.rule})`);
  if (estimate.alternative) {
    breakdown.push(
      estimate.basis === 'family-ticket'
        ? `Buying individually would be ${money(estimate.alternative.totalPence)}`
        : `A family ticket would be ${money(estimate.alternative.totalPence)}`,
    );
  }
  return {
    headline: `About ${money(estimate.totalPence)} to get in`,
    breakdown,
    conditions: estimate.conditions,
    provenance: `Checked ${fmtDate(estimate.source.checkedAt)}`,
    isEstimate: true,
    ...booking,
  };
}

/** The line for a plan: admission and what is missing, never a partial figure called a total. */
export function outingLine(totals: OutingTotals): string {
  if (totals.knownPence === null) return 'Price not confirmed';
  if (totals.complete) return `About ${money(totals.knownPence)} in all`;
  const n = totals.unknownItems;
  return `${money(totals.knownPence)} so far, ${n} ${n === 1 ? 'cost' : 'costs'} not confirmed`;
}
