import { describe, expect, it } from 'vitest';

import {
  AdmissionPricing,
  Attendee,
  admissionView,
  combineAdmission,
  estimateFamilyAdmission,
  outingLine,
  outingTotals,
  priceBadge,
} from '@/src/services/pricing/admission';

/**
 * London Zoo publishes four prices for each ticket, by the kind of day. From its own page (read 2026-10-08): "Online advance
 * ticket prices without donation Off Peak / Weekday Standard / Standard Weekend / Peak. Adult (age 16-64) £27.70 £31.80
 * £33.60 £34.50. Child (age 3-15) £19.40 £22.20 £23.50 £24.10", and "Children under the age of 3 years are entitled to free
 * entry". A single total would pick one of the four and tell the parent it was theirs.
 */
const band = (kind: 'adult' | 'child', pounds: number, min: number, max?: number) => ({
  kind, amountPence: Math.round(pounds * 100), minAgeMonths: min, ...(max ? { maxAgeMonthsExclusive: max } : {}),
}) as const;
const tier = (label: string, adult: number, child: number) => ({
  label,
  bands: [
    { kind: 'under' as const, amountPence: 0, free: true, minAgeMonths: 0, maxAgeMonthsExclusive: 36, label: 'Under 3' },
    band('child', child, 36, 192),
    band('adult', adult, 192),
  ],
});
const ZOO: AdmissionPricing = {
  status: 'paid',
  tiers: [tier('Off Peak', 27.7, 19.4), tier('Weekday Standard', 31.8, 22.2), tier('Standard Weekend', 33.6, 23.5), tier('Peak', 34.5, 24.1)],
  conditions: ['Online advance prices, without a donation. Gate prices are higher.'],
  source: { url: 'https://www.londonzoo.org/tickets', checkedAt: '2026-10-08' },
};

const adult = (id: string): Attendee => ({ id, kind: 'adult', label: 'Adult' });
const child = (id: string, label: string, ageMonths: number | null): Attendee => ({ id, kind: 'child', ageMonths, label });
const VISIT = '2026-10-17';
const FAMILY = [adult('a1'), adult('a2'), child('c1', 'Mia', 48), child('c2', 'Leo', 8)];

describe('a price that depends on the kind of day', () => {
  it('is a range across the venue’s own tables, never one of them picked as the price', () => {
    const e = estimateFamilyAdmission(ZOO, FAMILY, VISIT);
    expect(e).toMatchObject({ state: 'range', lowPence: 7480, highPence: 9310 });
    if (e.state !== 'range') return;
    expect(e.tiers).toEqual([
      { label: 'Off Peak', totalPence: 7480 },
      { label: 'Weekday Standard', totalPence: 8580 },
      { label: 'Standard Weekend', totalPence: 9070 },
      { label: 'Peak', totalPence: 9310 },
    ]);
  });

  it('is worded as a range with the reason, and is an estimate', () => {
    const view = admissionView(estimateFamilyAdmission(ZOO, FAMILY, VISIT), ZOO);
    expect(view.headline).toBe('About £74.80 to £93.10 to get in, depending on the day');
    expect(view.breakdown).toEqual([
      'Off Peak: £74.80', 'Weekday Standard: £85.80', 'Standard Weekend: £90.70', 'Peak: £93.10',
      'The venue sets the price by the day. Check which kind of day yours is when you book.',
    ]);
    expect(view.isEstimate).toBe(true);
    expect(view.conditions).toEqual(['Online advance prices, without a donation. Gate prices are higher.']);
  });

  it('is one price when the tables agree for this party (under-3s only are free on every day)', () => {
    const e = estimateFamilyAdmission(ZOO, [child('c', 'Leo', 8)], VISIT);
    expect(e).toMatchObject({ state: 'known', totalPence: 0 });
  });

  it('is unknown, not a range with a missing end, when any table cannot price the party', () => {
    const partial: AdmissionPricing = { ...ZOO, tiers: [ZOO.tiers![0], { label: 'Peak', bands: [band('adult', 34.5, 192)] }] };
    const e = estimateFamilyAdmission(partial, FAMILY, VISIT);
    expect(e.state).toBe('unknown');
  });

  it('keeps a child no band covers unknown rather than charging them as a child or an adult', () => {
    const teen = [adult('a1'), child('c', 'Kit', 17 * 12)];
    const e = estimateFamilyAdmission(ZOO, teen, VISIT);
    expect(e).toMatchObject({ state: 'unknown', reason: 'attendee-not-covered' });
  });

  it('is not shown after its reading goes stale, tiers or not', () => {
    const old: AdmissionPricing = { ...ZOO, source: { ...ZOO.source, checkedAt: '2026-01-01' } };
    expect(estimateFamilyAdmission(old, FAMILY, VISIT)).toMatchObject({ state: 'unknown', reason: 'stale' });
    expect(priceBadge(old, VISIT).kind).toBe('unknown');
  });

  it('the card badge is the cheapest paid ticket on any day, worded as a minimum', () => {
    expect(priceBadge(ZOO, VISIT)).toEqual({ kind: 'from', text: 'From £19.40' });
  });

  it('with several families there is a range for the outing and never a single total', () => {
    const range = estimateFamilyAdmission(ZOO, FAMILY, VISIT);
    const known = estimateFamilyAdmission({ status: 'paid', bands: [band('adult', 10, 192)], source: ZOO.source }, [adult('x')], VISIT);
    const combined = combineAdmission([
      { partyId: 'mine', label: 'Us', estimate: range },
      { partyId: 'theirs', label: 'Them', estimate: known },
    ]);
    expect(combined.combinedPence).toBeNull();
    expect(combined.combinedRangePence).toEqual({ lowPence: 8480, highPence: 10310 });
    expect(outingLine(outingTotals(combined, []))).toBe('About £84.80 to £103.10 in all, depending on the day');
    // A cost nobody has confirmed turns it back into something partial, never a range called complete.
    expect(outingLine(outingTotals(combined, [{ label: 'Parking', amountPence: null }]))).not.toMatch(/in all/);
  });

  it('a party that is missing a price makes the outing unknown, not a smaller range', () => {
    const range = estimateFamilyAdmission(ZOO, FAMILY, VISIT);
    const unknown = estimateFamilyAdmission(null, [adult('x')], VISIT);
    const combined = combineAdmission([
      { partyId: 'mine', label: 'Us', estimate: range },
      { partyId: 'theirs', label: 'Them', estimate: unknown },
    ]);
    expect(combined.combinedRangePence).toBeNull();
    expect(combined.combinedPence).toBeNull();
  });
});
