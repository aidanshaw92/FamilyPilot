import { describe, expect, it } from 'vitest';

import {
  AdmissionPricing,
  Attendee,
  combineAdmission,
  estimateFamilyAdmission,
  admissionView,
  outingLine,
  outingTotals,
  PartyAdmission,
  priceBadge,
  priceIsCurrent,
} from '@/src/services/pricing/admission';

/** Family admission, and the ways it must NOT be wrong. */

const VISIT = '2026-11-14';
const SRC = { url: 'https://example.org/visit/prices', checkedAt: '2026-10-01' };
const adult = (id = 'a1'): Attendee => ({ id, kind: 'adult', label: 'Adult' });
const kid = (id: string, label: string, ageMonths: number | null): Attendee => ({ id, kind: 'child', label, ageMonths });

// Modelled on a real stored page: Adult 17, Children 3-15 8.50, family (2 adults + up to 4 children) 42.
const PAID: AdmissionPricing = {
  status: 'paid',
  source: SRC,
  bands: [
    { kind: 'adult', amountPence: 1700, label: 'Adult' },
    { kind: 'child', amountPence: 850, minAgeMonths: 36, maxAgeMonthsExclusive: 192, label: 'Children 3 to 15' },
    { kind: 'under', amountPence: 0, free: true, maxAgeMonthsExclusive: 36, label: 'Under 3s free' },
    { kind: 'concession', amountPence: 1200, label: 'Concessions' },
  ],
  familyTickets: [{ amountPence: 4200, minAdults: 2, maxAdults: 2, minChildren: 1, maxChildren: 4, label: 'Family: 2 adults and up to 4 children' }],
  conditions: ['Peak days cost more'],
};

describe('unknown is never zero', () => {
  it('no price at all is unknown, and says so', () => {
    const e = estimateFamilyAdmission(null, [adult(), kid('k', 'Sloane', 48)], VISIT);
    expect(e).toMatchObject({ state: 'unknown', reason: 'no-price' });
    expect(admissionView(e, null).headline).toBe('Price not confirmed');
    expect(priceBadge(null, VISIT)).toEqual({ kind: 'unknown', text: 'Price not confirmed' });
  });

  it('"free" must be a confirmed statement: a paid price list with no free band is not free', () => {
    const e = estimateFamilyAdmission({ ...PAID, status: 'paid' }, [adult()], VISIT);
    expect(e.state).toBe('known');
    expect(e.state === 'known' && e.totalPence).toBe(1700);
  });

  it('confirmed free entry is free, with its source', () => {
    const e = estimateFamilyAdmission({ status: 'free', source: SRC }, [adult(), kid('k', 'Ozzie', 8)], VISIT);
    expect(e).toEqual({ state: 'free', totalPence: 0, source: SRC });
    expect(priceBadge({ status: 'free', source: SRC }, VISIT).text).toBe('Free entry');
  });

  it('a stale price is not shown as current: unknown, with the old date kept for honesty', () => {
    const old = { ...PAID, source: { ...SRC, checkedAt: '2025-01-01' } };
    const e = estimateFamilyAdmission(old, [adult()], VISIT);
    expect(e).toMatchObject({ state: 'unknown', reason: 'stale' });
    expect(priceBadge(old, VISIT).text).toBe('Price not confirmed');
    expect(priceIsCurrent({ ...SRC, validUntil: '2026-11-01' }, VISIT)).toBe(false);
    expect(priceIsCurrent({ ...SRC, validUntil: '2026-12-31' }, VISIT)).toBe(true);
    expect(priceIsCurrent({ url: 'x', checkedAt: 'not a date' }, VISIT)).toBe(false);
  });
});

describe('nothing is assumed about babies, children or family tickets', () => {
  it('a baby is free only where a band that covers their age says free', () => {
    const e = estimateFamilyAdmission(PAID, [adult(), kid('o', 'Ozzie', 8)], VISIT);
    expect(e.state === 'known' && e.lines.find((l) => l.attendeeId === 'o')).toMatchObject({ free: true, amountPence: 0, rule: 'Under 3s free' });
  });

  it('a baby is NOT assumed free when no band covers them', () => {
    const noUnder3 = { ...PAID, bands: PAID.bands!.filter((b) => b.kind !== 'under'), familyTickets: [] };
    const e = estimateFamilyAdmission(noUnder3, [adult(), kid('o', 'Ozzie', 8)], VISIT);
    expect(e).toMatchObject({ state: 'unknown', reason: 'attendee-not-covered' });
  });

  it('a child whose age is unknown makes the estimate unknown rather than guessing a band', () => {
    const e = estimateFamilyAdmission(PAID, [adult(), kid('k', 'Sloane', null)], VISIT);
    expect(e).toMatchObject({ state: 'unknown', reason: 'child-age-unknown' });
  });

  it('a child older than every band is not covered (a 17-year-old on a "3 to 15" ticket)', () => {
    const e = estimateFamilyAdmission(PAID, [adult(), kid('t', 'Teen', 17 * 12)], VISIT);
    expect(e).toMatchObject({ state: 'unknown', reason: 'attendee-not-covered' });
  });

  it('the boundary is exact: a child is under 3 until their third birthday, then pays the child price', () => {
    const at = (m: number) => estimateFamilyAdmission(PAID, [adult(), kid('k', 'K', m)], VISIT);
    expect(at(35).state === 'known' && (at(35) as { totalPence: number }).totalPence).toBe(1700);
    expect(at(36).state === 'known' && (at(36) as { totalPence: number }).totalPence).toBe(2550);
  });

  it('a concession band never prices a child, whatever its limits', () => {
    const onlyConcession: AdmissionPricing = { ...PAID, bands: [{ kind: 'adult', amountPence: 1700 }, { kind: 'concession', amountPence: 100 }], familyTickets: [] };
    expect(estimateFamilyAdmission(onlyConcession, [adult(), kid('k', 'K', 60)], VISIT)).toMatchObject({ state: 'unknown', reason: 'attendee-not-covered' });
  });

  it('no adult price means the adults cannot be priced', () => {
    const noAdult: AdmissionPricing = { ...PAID, bands: PAID.bands!.filter((b) => b.kind !== 'adult'), familyTickets: [] };
    expect(estimateFamilyAdmission(noAdult, [adult()], VISIT)).toMatchObject({ state: 'unknown', reason: 'no-adult-price' });
  });

  it('a family ticket is used only when it is cheaper, and the other way is shown', () => {
    // 2 adults + 2 children aged 4 and 6: individually 17+17+8.5+8.5 = 51, family 42.
    const party = [adult('a1'), adult('a2'), kid('k1', 'Sloane', 48), kid('k2', 'Theo', 72)];
    const e = estimateFamilyAdmission(PAID, party, VISIT);
    expect(e).toMatchObject({ state: 'known', basis: 'family-ticket', totalPence: 4200, alternative: { basis: 'individual', totalPence: 5100 } });
  });

  it('a family ticket is NOT assumed cheaper: with a baby free, individual wins', () => {
    // 2 adults + 1 baby (free): individually 34, family 42.
    const party = [adult('a1'), adult('a2'), kid('o', 'Ozzie', 8)];
    const e = estimateFamilyAdmission(PAID, party, VISIT);
    expect(e).toMatchObject({ state: 'known', basis: 'individual', totalPence: 3400, alternative: { basis: 'family-ticket', totalPence: 4200 } });
  });

  it('a family ticket does not apply to a party it does not fit (1 adult, 5 children, 3 adults)', () => {
    const one = estimateFamilyAdmission(PAID, [adult('a1'), kid('k', 'K', 48)], VISIT);
    expect(one.state === 'known' && one.basis).toBe('individual');
    const three = estimateFamilyAdmission(PAID, [adult('a1'), adult('a2'), adult('a3'), kid('k', 'K', 48)], VISIT);
    expect(three.state === 'known' && three.basis).toBe('individual');
    const five = estimateFamilyAdmission(PAID, [adult('a1'), adult('a2'), ...[1, 2, 3, 4, 5].map((n) => kid(`k${n}`, `K${n}`, 60))], VISIT);
    expect(five.state === 'known' && five.basis).toBe('individual');
  });

  it('a family ticket with a child age limit excludes a party with an older child', () => {
    const limited: AdmissionPricing = { ...PAID, familyTickets: [{ ...PAID.familyTickets![0], maxChildAgeMonthsExclusive: 144 }] };
    const party = [adult('a1'), adult('a2'), kid('t', 'Teen', 15 * 12)];
    expect(estimateFamilyAdmission(limited, party, VISIT)).toMatchObject({ state: 'known', basis: 'individual' });
  });

  it('when individual prices cannot be worked out but the party fits a stated family ticket, that price stands', () => {
    const familyOnly: AdmissionPricing = { ...PAID, bands: [{ kind: 'adult', amountPence: 1700 }] };
    const party = [adult('a1'), adult('a2'), kid('k', 'K', 60)];
    expect(estimateFamilyAdmission(familyOnly, party, VISIT)).toMatchObject({ state: 'known', basis: 'family-ticket', totalPence: 4200 });
  });
});

describe('presentation', () => {
  it('"From" is the cheapest paid individual ticket and is worded as a minimum, never a total', () => {
    expect(priceBadge(PAID, VISIT)).toEqual({ kind: 'from', text: 'From £8.50' });
    expect(priceBadge({ ...PAID, bands: [{ kind: 'adult', amountPence: 0, free: true }], familyTickets: [] }, VISIT).kind).toBe('unknown');
  });

  it('the Venue Detail view labels the figure an estimate with its conditions, provenance and the other route', () => {
    const party = [adult('a1'), adult('a2'), kid('k1', 'Sloane', 48), kid('k2', 'Theo', 72)];
    const view = admissionView(estimateFamilyAdmission(PAID, party, VISIT), PAID);
    expect(view.headline).toBe('About £42 to get in');
    expect(view.isEstimate).toBe(true);
    expect(view.conditions).toEqual(['Peak days cost more']);
    expect(view.provenance).toMatch(/Checked 1 Oct 2026/);
    expect(view.breakdown.join(' | ')).toMatch(/Buying individually would be £51/);
  });

  it('an unknown view never carries a price, and a free view is not an estimate', () => {
    const unknown = admissionView(estimateFamilyAdmission(null, [adult()], VISIT), null);
    expect(unknown).toMatchObject({ headline: 'Price not confirmed', breakdown: [], isEstimate: false });
    expect(JSON.stringify(unknown)).not.toMatch(/£/);
    expect(admissionView({ state: 'free', totalPence: 0, source: SRC }, { status: 'free', source: SRC })).toMatchObject({ headline: 'Free entry', isEstimate: false });
  });
});

describe('several families: separate subtotals, a combined total only when complete', () => {
  const known = (label: string, pence: number): PartyAdmission => ({ partyId: label, label, estimate: { state: 'known', totalPence: pence, basis: 'individual', lines: [], conditions: [], source: SRC } });
  const unknown = (label: string): PartyAdmission => ({ partyId: label, label, estimate: { state: 'unknown', reason: 'child-age-unknown', detail: '' } });

  it('all known: a combined total', () => {
    const c = combineAdmission([known('Ours', 3400), known('The Hills', 2550)]);
    expect(c).toMatchObject({ combinedPence: 5950, knownSubtotalPence: 5950, unknownParties: 0 });
  });

  it('one family unknown: NO combined total, only what is known so far', () => {
    const c = combineAdmission([known('Ours', 3400), unknown('The Hills')]);
    expect(c).toMatchObject({ combinedPence: null, knownSubtotalPence: 3400, unknownParties: 1 });
  });

  it('a free family is known (zero is a confirmed answer), an unknown one is not', () => {
    const free: PartyAdmission = { partyId: 'f', label: 'F', estimate: { state: 'free', totalPence: 0, source: SRC } };
    expect(combineAdmission([free, known('Ours', 1700)]).combinedPence).toBe(1700);
    expect(combineAdmission([unknown('U')]).knownSubtotalPence).toBeNull();
  });

  it('extra costs are separate: a partial subtotal is never called a total', () => {
    const admission = combineAdmission([known('Ours', 3400)]);
    const complete = outingTotals(admission, [{ label: 'Parking', amountPence: 600 }]);
    expect(complete).toMatchObject({ complete: true, knownPence: 4000, unknownItems: 0 });
    expect(outingLine(complete)).toBe('About £40 in all');

    const parkingUnknown = outingTotals(admission, [{ label: 'Parking', amountPence: null }]);
    expect(parkingUnknown).toMatchObject({ complete: false, knownPence: 3400, unknownItems: 1 });
    expect(outingLine(parkingUnknown)).toBe('£34 so far, 1 cost not confirmed');

    const familyUnknown = outingTotals(combineAdmission([known('Ours', 3400), unknown('U')]), []);
    expect(outingLine(familyUnknown)).toBe('£34 so far, 1 cost not confirmed');
    expect(outingLine(outingTotals(combineAdmission([unknown('U')]), []))).toBe('Price not confirmed');
  });

  it('an optional extra does not make the outing incomplete', () => {
    const t = outingTotals(combineAdmission([known('Ours', 1700)]), [{ label: 'Soft play', amountPence: null, optional: true }]);
    expect(t.complete).toBe(true);
  });

  it('nobody coming is not a free outing', () => {
    expect(combineAdmission([]).combinedPence).toBeNull();
  });
});

import { readFileSync } from 'node:fs';
import { attendeesFromProfile } from '@/src/services/pricing/attendees';
import { hasPriceCoverage } from '@/src/utils/filter-venues';

describe('who is coming, with ages on the day', () => {
  const profile = {
    members: [
      { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
      { id: 'p2', name: 'Ellie', role: 'parent', relationship: 'partner', dateOfBirth: '1991-02-02', age: 35 },
      { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-12-20', age: 2, dobKnown: true },
      { id: 'c2', name: 'Ozzie', role: 'child', dateOfBirth: '2026-02-01', age: 0, ageMonths: 8, dobKnown: true },
      { id: 'c3', name: 'Mia', role: 'child', dateOfBirth: '2020-01-01', age: 6, dobKnown: false },
    ],
  } as never;

  it('uses the age on the visit date, not today: Sloane turns 3 on 20 December', () => {
    const before = attendeesFromProfile(profile, new Date(2026, 11, 19));
    const after = attendeesFromProfile(profile, new Date(2026, 11, 20));
    expect(before.find((a) => a.id === 'c1')?.ageMonths).toBe(35);
    expect(after.find((a) => a.id === 'c1')?.ageMonths).toBe(36);
  });

  it('a child with no real date of birth has an unknown age, so their ticket is unknown', () => {
    const list = attendeesFromProfile(profile, new Date(2026, 10, 14));
    expect(list.find((a) => a.id === 'c3')?.ageMonths).toBeNull();
    const individualOnly = { ...PAID, familyTickets: [] };
    expect(estimateFamilyAdmission(individualOnly, list, VISIT)).toMatchObject({ state: 'unknown', reason: 'child-age-unknown' });
    // A stated family ticket with no age limit that this party fits still prices it: the unknown age does not matter to it.
    expect(estimateFamilyAdmission(PAID, list, VISIT)).toMatchObject({ state: 'known', basis: 'family-ticket' });
  });

  it('adults are anonymous and anyone can be taken out of the party', () => {
    const list = attendeesFromProfile(profile, new Date(2026, 10, 14), ['p1', 'c2']);
    expect(list.map((a) => [a.kind, a.label])).toEqual([['adult', 'Adult'], ['child', 'Ozzie']]);
  });
});

describe('the price filters are offered only when prices exist', () => {
  it('no place with a price: no price filters; a tenth of places priced: filters appear', () => {
    const none = Array.from({ length: 20 }, () => ({ estimatedSpend: undefined }));
    expect(hasPriceCoverage(none)).toBe(false);
    expect(hasPriceCoverage([])).toBe(false);
    const some = [...none.slice(0, 18), { estimatedSpend: 'Free' }, { estimatedSpend: '££' }];
    expect(hasPriceCoverage(some)).toBe(true);
    expect(hasPriceCoverage([...none.slice(0, 19), { estimatedSpend: 'Free' }])).toBe(false);
  });

  it('the sheet leaves out the Budget group and the Free filter without coverage, and says why', () => {
    const sheet = readFileSync('src/components/explore/FilterSheet.tsx', 'utf8');
    expect(sheet).toMatch(/const showPrices = priceFiltersAvailable \|\| isRestaurantMode/);
    expect(sheet).toMatch(/FILTER_SHEET_OPTIONS\.filter\(\(o\) => o\.id !== 'free'\)/);
    expect(sheet).toMatch(/Price filters appear once prices are confirmed for more places/);
    for (const file of ['app/(tabs)/explore.tsx', 'app/(tabs)/index.tsx']) {
      expect(readFileSync(file, 'utf8')).toMatch(/priceFiltersAvailable=\{hasPriceCoverage\(/);
    }
  });
});

describe('Venue Detail never shows a price it cannot source', () => {
  it('the card is fed only by a sourced `admission`, and says "Price not confirmed" otherwise', () => {
    const page = readFileSync('app/venue/[id].tsx', 'utf8');
    expect(page).toMatch(/<AdmissionCard pricing=\{venue\.admission\}/);
    const card = readFileSync('src/components/venue/AdmissionCard.tsx', 'utf8');
    expect(card).not.toMatch(/estimatedSpend|£/);
    expect(card).toMatch(/Check prices on the official website/);
  });
});
