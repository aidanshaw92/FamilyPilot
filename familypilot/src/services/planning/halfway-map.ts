import { BASEMAP_AREAS, BASEMAP_RIVER, BASEMAP_ROADS } from '@/src/data/london-basemap';

/**
 * The geometry of Meet halfway's map, worked out here so it can be tested rather than eyeballed.
 *
 * WHAT IT SHOWS: three things a parent needs to see why a place is fair: their own area, the other family's area, and
 * the venue. Nothing else is claimed. There are no lines between them: FamilyPilot estimates journey times from distance
 * and does not route them, so a line drawn from an area to the venue would read as a route nobody measured.
 *
 * PRIVACY: a family is drawn as an AREA, never a point. Both positions are cut to the same grid a connection already
 * shares (two decimal places, about a kilometre), so the map can show nothing about the other family that their shared
 * snapshot does not already say, and this family's own home is treated the same way on its own phone. Each area is a
 * soft circle about 1.5 km across, so it cannot be read as a house. The venue is a real public place and is shown where it is.
 *
 * THE MAP: drawn from data shipped with the app (src/data/london-basemap.ts, Natural Earth, public domain). No tiles, no
 * provider, no request, no cost.
 */

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export interface HalfwayMapInput {
  mine: MapPoint & { label: string };
  other: MapPoint & { label: string };
  /** The place in focus: named on the map, and the one the frame is fitted to with the two areas. */
  venue: MapPoint & { name: string };
  /**
   * Every recommended place, in the order of the cards, so each is a numbered pin that matches its card. The venue in
   * focus is one of them (`selectedId`); given none, only the venue is drawn.
   */
  venues?: (MapPoint & { id: string; name: string })[];
  selectedId?: string;
}

export interface ProjectedMarker {
  x: number;
  y: number;
  label: string;
}

/** A recommended place on the map: numbered as its card is, the one in focus marked. */
export interface MapPin extends ProjectedMarker {
  id: string;
  number: number;
  selected: boolean;
}

export interface HalfwayMapModel {
  width: number;
  height: number;
  /** Where the venue's name sits beside its pin, kept inside the frame. */
  venueLabel: { x: number; y: number; anchor: 'start' | 'middle' | 'end' };
  /** Approximate family areas: centre (on the ~1 km grid) and radius in pixels. */
  areas: (ProjectedMarker & { r: number; role: 'mine' | 'other'; labelX: number; labelY: number; labelAnchor: 'start' | 'middle' | 'end' })[];
  venue: ProjectedMarker;
  /** The numbered pins, in card order, the selected one last so it is drawn on top where pins crowd. */
  pins: MapPin[];
  /** Background: borough and county outlines, the Thames, main roads, as SVG path data in pixels. */
  basemap: { areas: string[]; river: string[]; motorways: string[]; roads: string[] };
  /** A scale bar a round number of kilometres long. */
  scale: { km: number; px: number };
  /** One sentence for screen readers. */
  summary: string;
}

/** The grid a connection's location is shared on (connection-snapshot.ts): two decimal places. */
export const coarse = (value: number): number => Math.round(value * 100) / 100;

/** Drawn radius of an approximate area, in metres: a little over the grid, so the true home is always inside it. */
export const AREA_RADIUS_M = 750;
/** The map never zooms in closer than this many kilometres across, so it never looks like a street plan. */
const MIN_SPAN_KM = 6;
const KM_PER_DEG_LAT = 111.32;

const finite = (p: MapPoint) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude);

/** "Hannah’s family" → "Hannah’s area"; "Shaw family" → "Shaw family’s area". */
export function areaLabel(familyName: string): string {
  const name = familyName.trim();
  if (/[’']s family$/i.test(name)) return name.replace(/family$/i, 'area');
  if (!name) return 'Their area';
  return `${name}${/s$/i.test(name) ? '’' : '’s'} area`;
}

/**
 * The venue's name under its pin, centred, pulled in from the edges where it would run off; above the frame's foot. Under
 * rather than beside, because the family areas carry their labels above their circles, so the two kinds of label sit in
 * different bands and rarely collide.
 */
export function venueLabelAt(x: number, y: number, name: string, size: { width: number; height: number }): HalfwayMapModel['venueLabel'] {
  const EDGE = 8;
  const CHAR_PX = 6.6;
  const half = (Math.min(name.length, 28) * CHAR_PX) / 2;
  let anchor: 'start' | 'middle' | 'end' = 'middle';
  let labelX = x;
  if (x - half < EDGE) { labelX = EDGE; anchor = 'start'; }
  else if (x + half > size.width - EDGE) { labelX = size.width - EDGE; anchor = 'end'; }
  const below = y + 16;
  const labelY = below > size.height - 28 ? y - 34 : below;
  return { x: labelX, y: Math.max(14, labelY), anchor };
}

export function halfwayMapModel(input: HalfwayMapInput, size: { width: number; height: number }): HalfwayMapModel | null {
  if (!finite(input.mine) || !finite(input.other) || !finite(input.venue)) return null;
  if (!(size.width > 0) || !(size.height > 0)) return null;

  const mine = { latitude: coarse(input.mine.latitude), longitude: coarse(input.mine.longitude) };
  const other = { latitude: coarse(input.other.latitude), longitude: coarse(input.other.longitude) };
  const venue = { latitude: input.venue.latitude, longitude: input.venue.longitude };

  // Equirectangular at the middle latitude: exact enough across a city, and the same projection for every layer.
  const points = [mine, other, venue];
  const midLat = (Math.min(...points.map((p) => p.latitude)) + Math.max(...points.map((p) => p.latitude))) / 2;
  const kmPerDegLon = KM_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
  const xs = points.map((p) => p.longitude * kmPerDegLon);
  const ys = points.map((p) => p.latitude * KM_PER_DEG_LAT);

  // Fit the three, with room for the area circles and labels, never closer than MIN_SPAN_KM. The margin grows with the
  // distance between them, so the outermost area keeps its label inside the frame however far apart the families are.
  const rawX = Math.max(...xs) - Math.min(...xs);
  const rawY = Math.max(...ys) - Math.min(...ys);
  const padX = Math.max(2.2, rawX * 0.2);
  const padY = Math.max(2.2, rawY * 0.3);
  let minX = Math.min(...xs) - padX;
  let maxX = Math.max(...xs) + padX;
  let minY = Math.min(...ys) - padY;
  let maxY = Math.max(...ys) + padY;
  const aspect = size.width / size.height;
  let spanX = Math.max(maxX - minX, MIN_SPAN_KM);
  let spanY = Math.max(maxY - minY, MIN_SPAN_KM / aspect);
  if (spanX / spanY > aspect) spanY = spanX / aspect;
  else spanX = spanY * aspect;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  minX = cx - spanX / 2;
  maxX = cx + spanX / 2;
  minY = cy - spanY / 2;
  maxY = cy + spanY / 2;
  const pxPerKm = size.width / spanX;

  const toX = (lon: number) => (lon * kmPerDegLon - minX) * pxPerKm;
  const toY = (lat: number) => (maxY - lat * KM_PER_DEG_LAT) * pxPerKm;
  const r = (AREA_RADIUS_M / 1000) * pxPerKm;

  // Background layers, only what crosses the view (plus a margin), as path data.
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

  // A round scale bar, about a quarter of the width.
  const target = spanX / 4;
  const km = [1, 2, 5, 10, 20].find((step) => step >= target * 0.6) ?? 20;

  const mineLabel = 'Your area';
  const otherLabel = areaLabel(input.other.label);
  // Labels sit above their area, centred, unless that would run off an edge: then they hang inwards from the area.
  const EDGE = 8;
  const CHAR_PX = 6.6; // 12px semi-bold, a generous average, so the estimate errs towards moving the label in
  const area = (lon: number, lat: number, label: string, role: 'mine' | 'other') => {
    const x = toX(lon);
    const y = toY(lat);
    const half = (label.length * CHAR_PX) / 2;
    let labelX = x;
    let labelAnchor: 'start' | 'middle' | 'end' = 'middle';
    if (x - half < EDGE) { labelX = Math.max(EDGE, x - r); labelAnchor = 'start'; }
    else if (x + half > size.width - EDGE) { labelX = Math.min(size.width - EDGE, x + r); labelAnchor = 'end'; }
    const above = y - r - 6;
    const labelY = above < 14 ? y + r + 14 : above;
    return { x, y, r, label, role, labelX, labelY, labelAnchor };
  };
  // Every recommended place, numbered in card order. One with no usable position is left off the map (its card still
  // says where it is); one off the frame is drawn anyway, clipped, rather than moving the frame away from the venue in
  // focus and the two areas.
  const listed = (input.venues ?? []).filter(finite);
  const pins: MapPin[] = listed.map((place, index) => ({
    id: place.id,
    number: index + 1,
    x: toX(place.longitude),
    y: toY(place.latitude),
    label: place.name,
    selected: place.id === input.selectedId,
  }));
  pins.sort((a, b) => Number(a.selected) - Number(b.selected));

  return {
    width: size.width,
    height: size.height,
    areas: [
      area(mine.longitude, mine.latitude, mineLabel, 'mine'),
      area(other.longitude, other.latitude, otherLabel, 'other'),
    ],
    venue: { x: toX(venue.longitude), y: toY(venue.latitude), label: input.venue.name },
    pins,
    venueLabel: venueLabelAt(toX(venue.longitude), toY(venue.latitude), input.venue.name, size),
    basemap,
    scale: { km, px: km * pxPerKm },
    summary: pins.length > 1
      ? `Map: ${pins.length} places numbered as the list below, ${input.venue.name} selected, with ${mineLabel.toLowerCase()} and ${otherLabel} shown as approximate areas, not addresses.`
      : `Map: ${input.venue.name}, with ${mineLabel.toLowerCase()} and ${otherLabel} shown as approximate areas, not addresses.`,
  };
}
