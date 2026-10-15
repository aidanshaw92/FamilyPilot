import { BASEMAP_AREAS, BASEMAP_RIVER, BASEMAP_ROADS } from '@/src/data/london-basemap';
import {
  AREA_RADIUS_M, coarse, declutterPins, MapPin, PIN_HIT_MAX, PIN_HIT_MIN, PIN_TRUE_MARK_FROM,
} from '@/src/services/planning/halfway-map';
import { KM_PER_MILE } from '@/src/utils/explore-geo';

/**
 * The geometry of Explore's map, worked out here so it can be tested.
 *
 * It is the Meet halfway map's own approach (src/services/planning/halfway-map.ts), for one point instead of two: a map of London
 * drawn on the device from data shipped with the app, so nothing is fetched and nothing is paid for.
 *
 * PRIVACY. Where the parent is looking from is drawn as an approximate AREA, never a point: the position is cut to the same
 * two-decimal grid (about a kilometre) a connection shares, and drawn as a soft circle about 1.5 km across, so it cannot be read
 * as a house, and a current location is no more precise on the screen than a postcode. The places are public and drawn where
 * they are. No routes are drawn: journey times are estimated from distance, not measured.
 */
export interface ExploreMapInput {
  anchor: { latitude: number; longitude: number };
  /** The distance in Nearby, drawn as a dashed ring. Null in Search all, where the map is fitted to the places. */
  radiusMiles: number | null;
  /** In the order of the list, so each pin's number is the number of its card. */
  pins: { id: string; name: string; latitude: number; longitude: number }[];
  selectedId?: string;
}

export interface ExploreMapModel {
  width: number;
  height: number;
  area: { x: number; y: number; r: number };
  ring: { r: number; label: string } | null;
  pins: MapPin[];
  /** Places left off because there is no room to number them all, or no usable position. */
  omitted: number;
  basemap: { areas: string[]; river: string[]; motorways: string[]; roads: string[] };
  scale: { km: number; px: number };
  summary: string;
}

/** More numbered pins than this is a crowd nobody can tap; the list below is the way to the rest. */
export const MAX_MAP_PINS = 30;
const MIN_SPAN_KM = 6;
const KM_PER_DEG_LAT = 111.32;

const finite = (p: { latitude: number; longitude: number }) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude);

export function exploreMapModel(input: ExploreMapInput, size: { width: number; height: number }): ExploreMapModel | null {
  if (!finite(input.anchor) || !(size.width > 0) || !(size.height > 0)) return null;
  const anchor = { latitude: coarse(input.anchor.latitude), longitude: coarse(input.anchor.longitude) };
  const usable = input.pins.filter(finite);
  const shown = usable.slice(0, MAX_MAP_PINS);
  const omitted = input.pins.length - shown.length;

  const ringKm = input.radiusMiles ? input.radiusMiles * KM_PER_MILE : 0;
  const points = [anchor, ...shown];
  const dLat = ringKm / KM_PER_DEG_LAT;
  const midLat = (Math.min(...points.map((p) => p.latitude)) + Math.max(...points.map((p) => p.latitude))) / 2;
  const kmPerDegLon = KM_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
  const dLon = ringKm / kmPerDegLon;
  const xs = points.map((p) => p.longitude * kmPerDegLon);
  const ys = points.map((p) => p.latitude * KM_PER_DEG_LAT);
  // Nearby shows the whole ring; Search all shows every place with a margin.
  const loX = Math.min(...xs, ringKm ? (anchor.longitude - dLon) * kmPerDegLon : Infinity);
  const hiX = Math.max(...xs, ringKm ? (anchor.longitude + dLon) * kmPerDegLon : -Infinity);
  const loY = Math.min(...ys, ringKm ? (anchor.latitude - dLat) * KM_PER_DEG_LAT : Infinity);
  const hiY = Math.max(...ys, ringKm ? (anchor.latitude + dLat) * KM_PER_DEG_LAT : -Infinity);
  const padX = Math.max(1.2, (hiX - loX) * 0.08);
  const padY = Math.max(1.2, (hiY - loY) * 0.08);
  const aspect = size.width / size.height;
  let spanX = Math.max(hiX - loX + padX * 2, MIN_SPAN_KM);
  let spanY = Math.max(hiY - loY + padY * 2, MIN_SPAN_KM / aspect);
  if (spanX / spanY > aspect) spanY = spanX / aspect;
  else spanX = spanY * aspect;
  const pxPerKm = size.width / spanX;
  const cx = (loX + hiX) / 2;
  const cy = (loY + hiY) / 2;
  const minX = cx - spanX / 2;
  const maxY = cy + spanY / 2;
  const toX = (lon: number) => (lon * kmPerDegLon - minX) * pxPerKm;
  const toY = (lat: number) => (maxY - lat * KM_PER_DEG_LAT) * pxPerKm;

  const inView = (flat: number[]) => {
    for (let i = 0; i < flat.length; i += 2) {
      const x = toX(flat[i]);
      const y = toY(flat[i + 1]);
      if (x > -size.width * 0.5 && x < size.width * 1.5 && y > -size.height * 0.5 && y < size.height * 1.5) return true;
    }
    return false;
  };
  const path = (flat: number[], close = false) => {
    let d = '';
    for (let i = 0; i < flat.length; i += 2) d += `${i === 0 ? 'M' : 'L'}${toX(flat[i]).toFixed(1)} ${toY(flat[i + 1]).toFixed(1)}`;
    return close ? `${d}Z` : d;
  };
  const basemap = {
    areas: BASEMAP_AREAS.flatMap((a) => a.rings.filter(inView).map((ring) => path(ring, true))),
    river: BASEMAP_RIVER.filter(inView).map((line) => path(line)),
    motorways: BASEMAP_ROADS.filter((road) => road.motorway).flatMap((road) => road.lines.filter(inView).map((line) => path(line))),
    roads: BASEMAP_ROADS.filter((road) => !road.motorway).flatMap((road) => road.lines.filter(inView).map((line) => path(line))),
  };

  const target = spanX / 4;
  const km = [1, 2, 5, 10, 20].find((step) => step >= target * 0.6) ?? 20;

  const pins: MapPin[] = declutterPins(
    shown.map((place, index) => {
      const x = toX(place.longitude);
      const y = toY(place.latitude);
      return { id: place.id, number: index + 1, x, y, label: place.name, selected: place.id === input.selectedId, hit: PIN_HIT_MAX, at: { x, y }, nudged: false };
    }),
  );
  for (const pin of pins) pin.nudged = Math.hypot(pin.x - pin.at.x, pin.y - pin.at.y) > PIN_TRUE_MARK_FROM;
  for (const pin of pins) {
    const nearest = Math.min(...pins.filter((other) => other !== pin).map((other) => Math.hypot(other.x - pin.x, other.y - pin.y)));
    if (Number.isFinite(nearest)) pin.hit = Math.max(PIN_HIT_MIN, Math.min(PIN_HIT_MAX, Math.floor(nearest)));
  }
  pins.sort((a, b) => Number(a.selected) - Number(b.selected));

  const areaX = toX(anchor.longitude);
  const areaY = toY(anchor.latitude);
  return {
    width: size.width,
    height: size.height,
    area: { x: areaX, y: areaY, r: (AREA_RADIUS_M / 1000) * pxPerKm },
    ring: input.radiusMiles ? { r: ringKm * pxPerKm, label: `${input.radiusMiles} miles` } : null,
    pins,
    omitted,
    basemap,
    scale: { km, px: km * pxPerKm },
    summary: pins.length
      ? `Map: ${pins.length} place${pins.length === 1 ? '' : 's'} numbered as the list below${input.radiusMiles ? `, within ${input.radiusMiles} miles of where you are looking from` : ''}. Your position is shown as an approximate area, not an address.`
      : 'Map: no places to show. Your position is shown as an approximate area, not an address.',
  };
}
