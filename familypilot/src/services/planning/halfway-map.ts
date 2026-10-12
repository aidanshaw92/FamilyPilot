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
  /**
   * The place in focus: named on the map. Absent while there is nothing to recommend yet (loading, an error, no suitable
   * place): the map then shows the two areas alone.
   */
  venue?: MapPoint & { name: string };
  /**
   * Every recommended place, in the order of the cards, so each is a numbered pin that matches its card. The venue in
   * focus is one of them (`selectedId`); given none, only the venue is drawn.
   *
   * THE FRAME IS FITTED TO ALL OF THEM and to both areas, never to the one in focus. Selecting a place therefore moves a
   * highlight, not the map: the frame is the same for every selection.
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
  /**
   * The diameter of the tap target centred on this pin, in pixels. 44 (the app's minimum target) where the pin has room, and
   * never more than the distance to the nearest other pin, so two close places cannot cover each other's centre: a tap on a
   * pin always selects that pin. Real stored places do sit this close (two galleries on the same stretch of the Thames).
   */
  hit: number;
}

/** The app's minimum drawn target, and the smallest tap target a crowded pin is given (the cards below are the other way in). */
export const PIN_HIT_MAX = 44;
export const PIN_HIT_MIN = 16;
/**
 * Places that sit almost on top of each other (stored places in one neighbourhood are often a few hundred metres apart,
 * which is a few pixels on a map that holds both families) would draw as one pin with the rest hidden beneath it. Pins closer
 * than `PIN_SEPARATION` px are therefore nudged apart, never by more than `PIN_MAX_NUDGE` px from where the place is. At the
 * scale of these maps that is a few hundred metres: the number beside the pin and its card say which place it is, and the
 * card's own details say exactly where.
 */
export const PIN_SEPARATION = 26;
export const PIN_MAX_NUDGE = 24;

/** Spreads overlapping pins apart (see PIN_SEPARATION), deterministically, keeping each within PIN_MAX_NUDGE px of its true position. */
export function declutterPins<T extends { x: number; y: number }>(pins: readonly T[]): T[] {
  const origin = pins.map((pin) => ({ x: pin.x, y: pin.y }));
  const out = pins.map((pin) => ({ ...pin }));
  for (let pass = 0; pass < 40; pass += 1) {
    let moved = false;
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        let dx = out[j].x - out[i].x;
        let dy = out[j].y - out[i].y;
        let d = Math.hypot(dx, dy);
        if (d >= PIN_SEPARATION) continue;
        if (d < 1e-6) {
          // Exactly on top of each other: split along a direction that depends on the pair, so it is stable.
          const angle = ((i * 7 + j * 13) % 12) * (Math.PI / 6);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          d = 1;
        }
        const push = (PIN_SEPARATION - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        out[i].x -= ux * push;
        out[i].y -= uy * push;
        out[j].x += ux * push;
        out[j].y += uy * push;
        moved = true;
      }
      // Never further from the true place than the nudge allows.
      const offX = out[i].x - origin[i].x;
      const offY = out[i].y - origin[i].y;
      const off = Math.hypot(offX, offY);
      if (off > PIN_MAX_NUDGE) {
        out[i].x = origin[i].x + (offX / off) * PIN_MAX_NUDGE;
        out[i].y = origin[i].y + (offY / off) * PIN_MAX_NUDGE;
      }
    }
    if (!moved) break;
  }
  return out;
}

export interface HalfwayMapModel {
  width: number;
  height: number;
  /** Where the venue's name sits beside its pin, kept inside the frame. */
  venueLabel: { x: number; y: number; anchor: 'start' | 'middle' | 'end' } | null;
  /** Approximate family areas: centre (on the ~1 km grid) and radius in pixels. */
  areas: (ProjectedMarker & { r: number; role: 'mine' | 'other'; labelX: number; labelY: number; labelAnchor: 'start' | 'middle' | 'end' })[];
  venue: ProjectedMarker | null;
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
  // Above the pin by default (the areas' own labels sit above their circles, so the two bands rarely meet, and a cluster of
  // pins sits below its label rather than under it); under it only where there is no room above.
  const above = y - 26;
  const labelY = above < 40 ? y + 16 : above;
  return { x: labelX, y: Math.max(14, labelY), anchor };
}

/**
 * The drawing is `width` x `height`, but part of it can sit under other things (the screen's header above, the
 * recommendation sheet below). `inset` is that covered part: the places and areas are fitted to what remains visible.
 */
export interface HalfwayMapSize {
  width: number;
  height: number;
  inset?: { top?: number; bottom?: number };
}

type AreaLabelled = HalfwayMapModel['areas'][number];
const textWidth = (label: string) => label.length * 6.6;
const labelSpan = (a: AreaLabelled): [number, number] => {
  const w = textWidth(a.label);
  return a.labelAnchor === 'start' ? [a.labelX, a.labelX + w] : a.labelAnchor === 'end' ? [a.labelX - w, a.labelX] : [a.labelX - w / 2, a.labelX + w / 2];
};

/**
 * Two areas close together (two families in neighbouring districts, with the map held at its minimum span) would print their
 * labels on top of each other. The left one's label then hangs to the left of its circle and the right one's to the right; if
 * they still meet (the circles are almost on top of each other) the right one's goes below its circle.
 */
export function separateAreaLabels(a: AreaLabelled, b: AreaLabelled, width: number): AreaLabelled[] {
  const GAP = 8;
  const overlaps = (x: AreaLabelled, y: AreaLabelled) => {
    const [xl, xr] = labelSpan(x);
    const [yl, yr] = labelSpan(y);
    return xl < yr + GAP && yl < xr + GAP && Math.abs(x.labelY - y.labelY) < 16;
  };
  if (!overlaps(a, b)) return [a, b];
  const [left, right] = a.x <= b.x ? [a, b] : [b, a];
  const L: AreaLabelled = { ...left, labelAnchor: 'end', labelX: Math.max(textWidth(left.label) + 8, left.x + left.r) };
  const R: AreaLabelled = { ...right, labelAnchor: 'start', labelX: Math.min(width - 8 - textWidth(right.label), right.x - right.r) };
  const fixed: [AreaLabelled, AreaLabelled] = overlaps(L, R)
    ? [L, { ...right, labelAnchor: 'middle', labelX: Math.min(width - 8 - textWidth(right.label) / 2, Math.max(8 + textWidth(right.label) / 2, right.x)), labelY: right.y + right.r + 14 }]
    : [L, R];
  return a === left ? fixed : [fixed[1], fixed[0]];
}

export function halfwayMapModel(input: HalfwayMapInput, size: HalfwayMapSize): HalfwayMapModel | null {
  if (!finite(input.mine) || !finite(input.other) || (input.venue && !finite(input.venue))) return null;
  if (!(size.width > 0) || !(size.height > 0)) return null;

  const mine = { latitude: coarse(input.mine.latitude), longitude: coarse(input.mine.longitude) };
  const other = { latitude: coarse(input.other.latitude), longitude: coarse(input.other.longitude) };
  // Every place that can be drawn, and the one in focus. The frame is fitted to ALL of them (see HalfwayMapInput.venues).
  const listed = (input.venues ?? []).filter(finite);
  const venue = input.venue ? { latitude: input.venue.latitude, longitude: input.venue.longitude } : null;
  const points: MapPoint[] = [mine, other, ...listed, ...(venue && !listed.length ? [venue] : [])];
  // Equirectangular at the middle latitude: exact enough across a city, and the same projection for every layer.
  const midLat = (Math.min(...points.map((p) => p.latitude)) + Math.max(...points.map((p) => p.latitude))) / 2;
  const kmPerDegLon = KM_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
  const xs = points.map((p) => p.longitude * kmPerDegLon);
  const ys = points.map((p) => p.latitude * KM_PER_DEG_LAT);

  // Fit them all, with room for the area circles and labels, never closer than MIN_SPAN_KM. The margin grows with the
  // distance between them, so the outermost area keeps its label inside the frame however far apart the families are.
  // Fitted to the part of the drawing that is visible (`inset`), centred in it; the rest is more of the same map.
  const insetTop = Math.max(0, size.inset?.top ?? 0);
  const insetBottom = Math.max(0, size.inset?.bottom ?? 0);
  const visibleHeight = Math.max(size.height - insetTop - insetBottom, size.height * 0.3);
  const rawX = Math.max(...xs) - Math.min(...xs);
  const rawY = Math.max(...ys) - Math.min(...ys);
  const padX = Math.max(2.2, rawX * 0.2);
  const padY = Math.max(2.2, rawY * 0.3);
  const minX0 = Math.min(...xs) - padX;
  const maxX0 = Math.max(...xs) + padX;
  const minY0 = Math.min(...ys) - padY;
  const maxY0 = Math.max(...ys) + padY;
  const aspect = size.width / visibleHeight;
  let spanX = Math.max(maxX0 - minX0, MIN_SPAN_KM);
  let spanY = Math.max(maxY0 - minY0, MIN_SPAN_KM / aspect);
  if (spanX / spanY > aspect) spanY = spanX / aspect;
  else spanX = spanY * aspect;
  const pxPerKm = size.width / spanX;
  const cx = (minX0 + maxX0) / 2;
  const cy = (minY0 + maxY0) / 2;
  const minX = cx - spanX / 2;
  // The visible band's top edge, then the covered strip above it.
  const maxY = cy + spanY / 2 + insetTop / pxPerKm;

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
  // says where it is).
  const pins: MapPin[] = declutterPins(
    listed.map((place, index) => ({
      id: place.id,
      number: index + 1,
      x: toX(place.longitude),
      y: toY(place.latitude),
      label: place.name,
      selected: place.id === input.selectedId,
      hit: PIN_HIT_MAX,
    })),
  );
  for (const pin of pins) {
    const nearest = Math.min(...pins.filter((other) => other !== pin).map((other) => Math.hypot(other.x - pin.x, other.y - pin.y)));
    if (Number.isFinite(nearest)) pin.hit = Math.max(PIN_HIT_MIN, Math.min(PIN_HIT_MAX, Math.floor(nearest)));
  }
  pins.sort((a, b) => Number(a.selected) - Number(b.selected));

  const areas = separateAreaLabels(area(mine.longitude, mine.latitude, mineLabel, 'mine'), area(other.longitude, other.latitude, otherLabel, 'other'), size.width);
  return {
    width: size.width,
    height: size.height,
    areas,
    venue: venue && input.venue ? { x: toX(venue.longitude), y: toY(venue.latitude), label: input.venue.name } : null,
    pins,
    venueLabel: venue && input.venue ? venueLabelAt(toX(venue.longitude), toY(venue.latitude), input.venue.name, { ...size, height: size.height - insetBottom }) : null,
    basemap,
    scale: { km, px: km * pxPerKm },
    summary: !input.venue
      ? `Map: ${mineLabel.toLowerCase()} and ${otherLabel} shown as approximate areas, not addresses. No places to show yet.`
      : pins.length > 1
        ? `Map: ${pins.length} places numbered as the list below, ${input.venue.name} selected, with ${mineLabel.toLowerCase()} and ${otherLabel} shown as approximate areas, not addresses.`
        : `Map: ${input.venue.name}, with ${mineLabel.toLowerCase()} and ${otherLabel} shown as approximate areas, not addresses.`,
  };
}
