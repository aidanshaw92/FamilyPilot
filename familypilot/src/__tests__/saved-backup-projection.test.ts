import { describe, expect, it } from 'vitest';

import {
  MAX_BACKED_UP_ITEMS,
  SAVED_BACKUP_VERSION,
  buildSavedBackup,
  parseSavedBackup,
} from '@/src/services/saved/saved-backup-projection';
import { SavedItem, Venue } from '@/src/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The owner's decision was that children's data stays off the cloud pending a GDPR-K/COPPA view. A
 * decision like that is worth very little as an intention and quite a lot as an assertion, so these
 * tests are the enforcement.
 *
 * THEY ASSERT ON THE SERIALIZED PAYLOAD, not on the projection's return type. A type cannot stop a
 * field reaching Postgres; `JSON.stringify` of the thing actually uploaded can. The venue fixture below
 * is deliberately loaded with every personal field a real `Venue` carries, including the exact
 * explanation strings `family-score.ts` produces.
 */

/** A venue as the app really builds one, personal parts included. */
const personalVenue = (over: Partial<Venue> = {}): Venue =>
  ({
    id: 'fp-google-kew',
    name: 'Kew Gardens',
    category: 'park',
    latitude: 51.4787,
    longitude: -0.2956,
    address: 'Richmond TW9 3AE',
    imageUrl: 'https://example.invalid/kew.jpg',
    provider: 'google',
    // EVERY FIELD BELOW IS ABOUT THE FAMILY, NOT THE PLACE.
    driveMinutes: 23,
    familyScore: {
      score: 82,
      factors: {
        ageSuitability: 0.9,
        accessibility: 0.8,
        distance: 0.6,
        weatherFit: 0.7,
        budgetFit: 0.5,
        facilitiesMatch: 0.9,
        routineFit: 0.4,
      },
      explanation: [
        'Only 12 minutes from home',
        'Further than your usual 30 min drive',
        'Back before the 1pm nap',
      ],
    },
    estimatedSpend: '£25',
    isOpen: true,
    goodToKnow: ['Buggy friendly'],
    facilities: ['parking', 'baby_changing'] as any,
    trust: { enrichmentStatus: 'verified' } as any,
    trustedFacts: { playground: 'yes' } as any,
    ...over,
  }) as Venue;

const savedItem = (over: Partial<SavedItem> = {}): SavedItem => ({
  id: 'saved-fp-google-kew',
  type: 'place',
  venue: personalVenue(),
  group: 'want',
  savedAt: '2026-10-01T09:00:00.000Z',
  ...over,
});

/** What would actually be sent to Postgres. */
const wire = (savedIds: string[], items: SavedItem[]) => JSON.stringify(buildSavedBackup(savedIds, items));

describe('nothing personal leaves the device in a Saved backup', () => {
  it('keeps enough to recognise the place', () => {
    const payload = buildSavedBackup(['fp-google-kew'], [savedItem()]);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].venue).toEqual({
      id: 'fp-google-kew',
      name: 'Kew Gardens',
      category: 'park',
      latitude: 51.4787,
      longitude: -0.2956,
      address: 'Richmond TW9 3AE',
      imageUrl: 'https://example.invalid/kew.jpg',
      provider: 'google',
    });
    // The parent's own filing of it is theirs and is kept.
    expect(payload.items[0].group).toBe('want');
    expect(payload.items[0].savedAt).toBe('2026-10-01T09:00:00.000Z');
  });

  it('sends no distance from the family home', () => {
    // Twenty of these would narrow down where they live.
    const sent = wire(['fp-google-kew'], [savedItem()]);
    expect(sent).not.toContain('driveMinutes');
    // The value as well as the key, so renaming the field does not sneak it through. Quoted and
    // delimited, because a bare "23" would also match a coordinate or a timestamp and would then be
    // passing or failing for reasons unrelated to drive time.
    expect(sent).not.toContain(':23');
  });

  it('sends none of the plain-English explanation, which is about the family', () => {
    const sent = wire(['fp-google-kew'], [savedItem()]);
    expect(sent).not.toContain('explanation');
    // THE WHOLE STRINGS, not fragments of them. A first version asserted the payload did not contain
    // "nap" and failed -- on `idsWithoutSnapshot`, which contains s-nap-shot. The projection was right
    // and the needle was wrong, which is worth more as a comment than as a deleted line: a three-letter
    // substring assertion passes or fails for reasons that have nothing to do with what it claims.
    for (const line of personalVenue().familyScore.explanation) {
      expect(sent, `the explanation line "${line}" must not be uploaded`).not.toContain(line);
    }
    // And the distinctive parts of each, in case the strings are reworded later.
    expect(sent).not.toContain('from home');
    expect(sent).not.toContain('your usual');
    expect(sent).not.toContain('before the 1pm');
  });

  it('sends no score and none of its factors, which are derived from the children', () => {
    const sent = wire(['fp-google-kew'], [savedItem()]);
    expect(sent).not.toContain('familyScore');
    expect(sent).not.toContain('ageSuitability');
    expect(sent).not.toContain('routineFit');
    expect(sent).not.toContain('82');
  });

  it('sends no venue facts the Saved row does not need', () => {
    const sent = wire(['fp-google-kew'], [savedItem()]);
    for (const field of ['trustedFacts', 'trust', 'goodToKnow', 'facilities', 'isOpen', 'estimatedSpend']) {
      expect(sent, `${field} must not be uploaded`).not.toContain(field);
    }
  });

  /**
   * THE ALLOWLIST TEST. The projection is a list of fields to keep, not a list to drop, so a field added
   * to `Venue` later is excluded by default. This proves that property rather than trusting the comment:
   * a brand-new personal field appears in the input and not in the output.
   */
  it('excludes a field nobody has thought of yet, because the projection is an allowlist', () => {
    const withFutureField = personalVenue({ childrensFavouriteSnack: 'raisins' } as any);
    const sent = JSON.stringify(buildSavedBackup(['fp-google-kew'], [savedItem({ venue: withFutureField })]));
    expect(sent).not.toContain('childrensFavouriteSnack');
    expect(sent).not.toContain('raisins');
  });

  it('is not vacuous: the fixture really does carry the personal fields', () => {
    // If this ever fails, the tests above are passing because the input changed, not because the
    // projection works.
    const input = JSON.stringify(savedItem());
    for (const field of ['driveMinutes', 'familyScore', 'routineFit', 'from home', 'before the 1pm']) {
      expect(input, `the fixture must contain ${field} for the exclusion tests to mean anything`).toContain(field);
    }
  });
});

describe('an id without a venue snapshot is not pretended to be a place', () => {
  it('records it separately rather than inventing a nameless row', () => {
    // `toggleSaved(venueId)` with no venue adds an id and no item, which the store supports.
    const payload = buildSavedBackup(['fp-google-kew', 'fp-osm-12345'], [savedItem()]);
    expect(payload.items.map((row) => row.venue.id)).toEqual(['fp-google-kew']);
    expect(payload.idsWithoutSnapshot).toEqual(['fp-osm-12345']);
  });

  it('drops an item whose venue has no usable coordinates', () => {
    const broken = savedItem({ venue: personalVenue({ latitude: Number.NaN }) });
    expect(buildSavedBackup(['fp-google-kew'], [broken]).items).toHaveLength(0);
  });

  it('drops an item whose venue has no name, rather than storing a blank row', () => {
    const broken = savedItem({ venue: personalVenue({ name: '' }) });
    expect(buildSavedBackup([], [broken]).items).toHaveLength(0);
  });
});

describe('the upload is bounded', () => {
  it('truncates past the ceiling and says it did', () => {
    const many = Array.from({ length: MAX_BACKED_UP_ITEMS + 5 }, (_, i) =>
      savedItem({ id: `saved-${i}`, venue: personalVenue({ id: `venue-${i}` }) }),
    );
    const payload = buildSavedBackup([], many);
    expect(payload.items).toHaveLength(MAX_BACKED_UP_ITEMS);
    // Silently dropping five of a parent's saved places would be the defect here.
    expect(payload.truncatedAt).toBe(MAX_BACKED_UP_ITEMS);
  });

  it('says nothing about truncation when it did not truncate', () => {
    expect(buildSavedBackup([], [savedItem()]).truncatedAt).toBeUndefined();
  });
});

describe('reading a backup back treats the row as data, not as trustworthy', () => {
  it('round-trips what it wrote', () => {
    const payload = buildSavedBackup(['fp-google-kew'], [savedItem()]);
    const parsed = parseSavedBackup(JSON.parse(JSON.stringify(payload)));
    expect(parsed?.items).toHaveLength(1);
    expect(parsed?.items[0].venue.name).toBe('Kew Gardens');
  });

  it('refuses a version it does not know rather than guessing at the shape', () => {
    // Guessing is how a restore silently drops half a parent's list.
    expect(parseSavedBackup({ version: SAVED_BACKUP_VERSION + 1, items: [] })).toBeNull();
  });

  it('refuses a payload with no items array', () => {
    expect(parseSavedBackup({ version: SAVED_BACKUP_VERSION })).toBeNull();
  });

  it.each([[null], [undefined], ['a string'], [42], [[]]])('refuses %s', (raw) => {
    expect(parseSavedBackup(raw as unknown)).toBeNull();
  });

  it('skips a malformed row and keeps the good ones, rather than failing the whole restore', () => {
    const good = buildSavedBackup([], [savedItem()]).items[0];
    const parsed = parseSavedBackup({
      version: SAVED_BACKUP_VERSION,
      items: [good, { id: 'x' }, null, { venue: { id: 'y' } }, 'nonsense'],
      idsWithoutSnapshot: ['fp-osm-1', 42],
    });
    expect(parsed?.items).toHaveLength(1);
    // A non-string id in the stored array must not reach the store.
    expect(parsed?.idsWithoutSnapshot).toEqual(['fp-osm-1']);
  });
});
