import { describe, expect, it } from 'vitest';

import {
  travelSourceOf,
  travelTimeLabel,
  travelTimeSpoken,
  travelTimeWithMode,
} from '@/src/utils/travel-time';

/**
 * A straight-line estimate must not be worded as a routed journey.
 *
 * The number behind every card's travel time is a Haversine distance divided by an assumed average
 * speed. Printed as "14 min away" it reads as a measurement. These lock the distinction, and in
 * particular lock the SAFE DIRECTION: when provenance is missing, the wording is cautious. Getting
 * that backwards -- a guess presented as a measurement -- is the failure that matters to a parent
 * timing a day around a nap.
 */
describe('a travel time is worded by how it was obtained', () => {
  it('hedges an estimate', () => {
    expect(travelTimeLabel(14, 'estimated')).toBe('about 14 min');
  });

  it('states a measurement plainly', () => {
    expect(travelTimeLabel(14, 'measured')).toBe('14 min');
  });

  it('never words an estimate the way it words a measurement', () => {
    for (const minutes of [1, 7, 14, 45, 120]) {
      expect(travelTimeLabel(minutes, 'estimated')).not.toBe(travelTimeLabel(minutes, 'measured'));
    }
  });

  it('costs at most one character more than the phrasing it replaces', () => {
    // The old copy was `${minutes} min away`. "about " is six characters where " away" was five, so
    // the hedge is always exactly one longer -- I first wrote this expecting it to be shorter, and it
    // is not. One character is small enough that the locked Home frame can absorb it, but that is
    // settled by re-running verify-home-against-figma.mjs, not by this bound.
    for (const minutes of [1, 14, 120]) {
      expect(travelTimeLabel(minutes, 'estimated').length).toBe(`${minutes} min away`.length + 1);
    }
  });

  it('rounds to whole minutes and never promises under a minute', () => {
    expect(travelTimeLabel(0, 'estimated')).toBe('about 1 min');
    expect(travelTimeLabel(0.2, 'measured')).toBe('1 min');
    expect(travelTimeLabel(14.6, 'measured')).toBe('15 min');
  });
});

describe('the provider vocabulary resolves without guessing upward', () => {
  it('treats a routed element as measured', () => {
    expect(travelSourceOf('live')).toBe('measured');
  });

  it('treats the endpoint fallback as an estimate', () => {
    expect(travelSourceOf('estimated')).toBe('estimated');
  });

  it('treats an absent source as an estimate, never as measured', () => {
    // A venue persisted before provenance was carried, or a provider that stopped saying. Either
    // way the cautious wording is the only honest one.
    expect(travelSourceOf(undefined)).toBe('estimated');
  });
});

describe('the mode is named, not assumed', () => {
  it('names a drive', () => {
    expect(travelTimeWithMode(14, 'estimated', 'drive')).toBe('about 14 min drive');
  });

  it('names a walk', () => {
    expect(travelTimeWithMode(9, 'estimated', 'walk')).toBe('about 9 min walk');
  });

  it('does not call public transport a bus', () => {
    // Section 5 of the brief: a bus label is a claim about the mode, not a generic transport word.
    expect(travelTimeWithMode(22, 'measured', 'transit')).toBe('22 min by public transport');
    expect(travelTimeWithMode(22, 'measured', 'transit')).not.toContain('bus');
    expect(travelTimeWithMode(22, 'measured', 'bus')).toBe('22 min by bus');
  });
});

describe('what a screen reader is told', () => {
  it('says an estimate is an estimate, in words', () => {
    expect(travelTimeSpoken(14, 'estimated')).toBe(
      'roughly 14 minutes drive, estimated from distance rather than measured',
    );
  });

  it('does not hedge a measurement', () => {
    expect(travelTimeSpoken(14, 'measured')).toBe('14 minutes drive');
    expect(travelTimeSpoken(14, 'measured')).not.toContain('estimated');
  });

  it('gets the singular right', () => {
    expect(travelTimeSpoken(1, 'measured')).toBe('1 minute drive');
  });
});
