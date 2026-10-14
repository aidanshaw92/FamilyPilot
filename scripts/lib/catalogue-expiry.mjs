/**
 * What the stored catalogue serves on a given day, computed by running the REAL reader (server/places/lib/catalogue.js) against a
 * stand-in database, not by re-implementing its rules. If the reader changes, so does this.
 *
 * The input is the non-content columns of `place_records` (id, category, lat, lng, fetched_at, provider). No name, address, hours,
 * photo or description is needed, and none is read, kept or printed.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readCatalogue } = require('../../server/places/lib/catalogue.js');
const { loadIdentities } = require('../../server/places/lib/independent-identities.js');

/** Accepts the export's column names or the short names a notebook is likely to have used. */
export function normaliseRows(rows) {
  return rows.map((row) => ({
    familypilot_place_id: row.familypilot_place_id ?? row.id,
    external_id: row.external_id ?? String(row.id ?? row.familypilot_place_id ?? '').replace(/^fp-google-/, 'google:'),
    provider: row.provider ?? 'google',
    category: row.category,
    lat: Number(row.lat),
    lng: Number(row.lng),
    fetched_at: new Date(row.fetched_at ?? row.fetched).toISOString(),
    name: '',
  }));
}

/** A stand-in for the Supabase query builder: honours the filters the reader uses and nothing else. */
export function standInClient(rows) {
  return {
    from() {
      const filters = [];
      let cap = Infinity;
      const chain = {
        select: () => chain,
        eq: (column, value) => (filters.push((row) => row[column] === value), chain),
        in: (column, values) => (filters.push((row) => values.includes(row[column])), chain),
        gte: (column, value) => (filters.push((row) => row[column] >= value), chain),
        lte: (column, value) => (filters.push((row) => row[column] <= value), chain),
        limit: (count) => ((cap = count), chain),
        then: (resolve) => resolve({ data: rows.filter((row) => filters.every((keep) => keep(row))).slice(0, cap), error: null }),
      };
      return chain;
    },
  };
}

/** The rule the map applies (src/utils/map-compliance.ts): a place is drawn only if its provider is independent and it has a position. */
export const isPlottable = (place) => (place.provider === 'osm' || place.provider === 'mock') && Number.isFinite(place.latitude) && Number.isFinite(place.longitude);

/**
 * @param {{ rows: any[], entries?: any[], dates: string[] }} input  `dates` are YYYY-MM-DD, evaluated at noon UTC.
 * @returns one result per date: the served counts under today's gate alone, and with the independent list, by category.
 */
export async function simulate({ rows, entries = [], dates }) {
  const client = standInClient(normaliseRows(rows));
  const valid = loadIdentities({ entries });
  const out = [];
  for (const date of dates) {
    const now = Date.parse(`${date}T12:00:00Z`);
    const gate = await readCatalogue({ client, now, entries: [] });
    const withIdentities = await readCatalogue({ client, now, entries: valid });
    const independent = withIdentities.filter((place) => place.provider !== 'google');
    const byCategory = {};
    for (const place of withIdentities) byCategory[place.category] = (byCategory[place.category] ?? 0) + 1;
    const plottable = withIdentities.filter(isPlottable).length;
    out.push({
      date,
      googleOnly: gate.length,
      independentAdded: independent.length,
      total: withIdentities.length,
      plottable,
      listOnly: withIdentities.length - plottable,
      byCategory,
    });
  }
  return out;
}
