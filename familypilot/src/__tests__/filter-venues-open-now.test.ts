import { describe, expect, it } from 'vitest';

import { FILTER_SHEET_OPTIONS, filterVenues } from '../utils/filter-venues';
import { Venue } from '../types';

function venue(id: string, isOpen: boolean | undefined): Venue {
  return {
    id,
    name: id,
    category: 'museum',
    latitude: 51.6,
    longitude: -0.3,
    driveMinutes: 10,
    imageUrl: '',
    familyScore: { score: 80, factors: {} as never, explanation: [] },
    isOpen,
  };
}

describe('Explore "open now" filter', () => {
  it('is offered as a filter sheet option', () => {
    expect(FILTER_SHEET_OPTIONS.some((option) => option.id === 'open_now')).toBe(true);
  });

  it('keeps only venues confirmed open right now', () => {
    const venues = [venue('open', true), venue('closed', false), venue('unknown', undefined)];
    const ids = filterVenues(venues, 'all', ['open_now'], 'any', 30, 'any').map((v) => v.id);
    expect(ids).toEqual(['open']);
  });

  it('never treats unknown opening status as open (trust model: unknown is not yes)', () => {
    const venues = [venue('unknown', undefined)];
    const ids = filterVenues(venues, 'all', ['open_now'], 'any', 30, 'any').map((v) => v.id);
    expect(ids).toHaveLength(0);
  });

  it('does not affect results when the filter is not applied', () => {
    const venues = [venue('open', true), venue('closed', false), venue('unknown', undefined)];
    const ids = filterVenues(venues, 'all', [], 'any', 30, 'any').map((v) => v.id);
    expect(ids).toHaveLength(3);
  });
});
