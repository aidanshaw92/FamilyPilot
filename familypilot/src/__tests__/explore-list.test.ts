import { describe, expect, it } from 'vitest';

import { Venue } from '@/src/types';
import { buildListItems } from '@/src/utils/explore-list';
import { ExploreResult, ResultRow } from '@/src/utils/explore-results';

const row = (id: string, reason?: string): ResultRow => ({ venue: { id, name: id } as Venue, miles: 1, driveMinutes: 5, reason });
const base = (over: Partial<ExploreResult> = {}): ExploreResult => ({
  located: [], coverage: { total: 0, within2: 0, within5: 0, within10: 0, nearestMiles: null }, inScope: 0, matches: [], also: [], outside: [],
  hidden: [], notChecked: [], notCheckedFor: [], interpretation: null, activeFilters: [], relaxations: [], ...over,
});
const opts = { radius: 5 as const, scope: 'nearby' as const, showHidden: false, showNotChecked: false };
const kinds = (items: ReturnType<typeof buildListItems>) => items.map((i) => (i.type === 'card' ? `card:${i.row.venue.id}` : i.type === 'heading' ? `heading:${i.text}` : `toggle:${i.kind}`));

describe('the rows of Explore\'s list', () => {
  it('lists matches first, then looser readings under their own headings, in that order', () => {
    const items = buildListItems(base({
      matches: [row('a'), row('b')],
      also: [{ id: 'trampoline_only', label: 'Also: trampoline parks, soft play not on record', rows: [row('t')] }],
      outside: [row('far')],
    }), opts);
    expect(kinds(items)).toEqual([
      'card:a', 'card:b', 'heading:Also: trampoline parks, soft play not on record', 'card:t', 'heading:Named, but more than 5 miles away', 'card:far',
    ]);
  });

  it('counts what is hidden and shows it only when asked, each with its reason, after everything that matches', () => {
    const result = base({ matches: [row('a')], hidden: [row('h1', 'Parking: its own page says there is none'), row('h2', 'x')] });
    const closed = buildListItems(result, opts);
    expect(kinds(closed)).toEqual(['card:a', 'toggle:hidden']);
    expect(closed[1]).toMatchObject({ text: '2 places are hidden because a confirmed fact rules them out', actionLabel: 'Show' });
    const open = buildListItems(result, { ...opts, showHidden: true });
    expect(kinds(open)).toEqual(['card:a', 'toggle:hidden', 'card:h1', 'card:h2']);
    expect(open[1]).toMatchObject({ actionLabel: 'Hide again' });
  });

  it('lists the places not checked apart, collapsed while there are matches and open when there are none', () => {
    const unchecked = base({ matches: [row('a')], notChecked: [row('n1', 'Not checked: parking')], notCheckedFor: ['parking'] });
    expect(kinds(buildListItems(unchecked, opts))).toEqual(['card:a', 'toggle:notChecked']);
    expect(buildListItems(unchecked, opts)[1]).toMatchObject({ text: '1 place is not checked for parking, so not counted as a match', actionLabel: 'Show' });
    expect(kinds(buildListItems(unchecked, { ...opts, showNotChecked: true }))).toEqual(['card:a', 'toggle:notChecked', 'card:n1']);
    const none = base({ notChecked: [row('n1')], notCheckedFor: ['parking', 'baby changing'] });
    const items = buildListItems(none, opts);
    expect(kinds(items)).toEqual(['toggle:notChecked', 'card:n1']);
    expect(items[0]).toMatchObject({ text: '1 place is not checked for parking or baby changing, so not counted as a match', actionLabel: '' });
  });

  it('gives every row a distinct key', () => {
    const items = buildListItems(base({ matches: [row('a')], hidden: [row('a')], notChecked: [row('a')], notCheckedFor: ['x'] }), { ...opts, showHidden: true, showNotChecked: true });
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });
});
