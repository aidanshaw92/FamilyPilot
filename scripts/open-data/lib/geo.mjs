/** Small, dependency-free geometry for the dry run. */

const R_KM = 6371;
const toRad = (d) => (d * Math.PI) / 180;

export function haversineKm(aLat, aLng, bLat, bLng) {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R_KM * 2 * Math.asin(Math.sqrt(h));
}

/** Ray casting. `ring` is [[lng, lat], ...]. */
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygons(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

/** True when the point lies inside the polygon, holes respected. */
export function pointInGeometry(lat, lng, geometry) {
  return polygons(geometry).some(([outer, ...holes]) => inRing(lng, lat, outer) && !holes.some((hole) => inRing(lng, lat, hole)));
}

function ringCentroid(ring) {
  let area = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [x0, y0] = ring[j];
    const [x1, y1] = ring[i];
    const f = x0 * y1 - x1 * y0;
    area += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  if (area === 0) return { lng: ring[0][0], lat: ring[0][1] };
  return { lng: cx / (3 * area), lat: cy / (3 * area) };
}

/** A point that is genuinely inside the feature: the centroid if it is, otherwise a point found by scanning across the middle. */
export function representativePoint(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Point') return { lng: geometry.coordinates[0], lat: geometry.coordinates[1] };
  const polys = polygons(geometry);
  if (!polys.length) return null;
  const biggest = polys.reduce((best, poly) => (Math.abs(ringArea(poly[0])) > Math.abs(ringArea(best[0])) ? poly : best));
  const c = ringCentroid(biggest[0]);
  if (pointInGeometry(c.lat, c.lng, { type: 'Polygon', coordinates: biggest })) return c;
  const lats = biggest[0].map((p) => p[1]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lngs = biggest[0].map((p) => p[0]);
  const steps = 40;
  for (let k = 0; k <= steps; k += 1) {
    const lng = Math.min(...lngs) + ((Math.max(...lngs) - Math.min(...lngs)) * k) / steps;
    if (pointInGeometry(midLat, lng, { type: 'Polygon', coordinates: biggest })) return { lng, lat: midLat };
  }
  return { lng: biggest[0][0][0], lat: biggest[0][0][1] };
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return area / 2;
}

const CHARING_CROSS = { lat: 51.5074, lng: -0.1278 };

/** The same areas the catalogue plan measures by: central within 6 km, else a quadrant by bearing, else outside London (over 25 km). */
export function areaOf(lat, lng) {
  const km = haversineKm(CHARING_CROSS.lat, CHARING_CROSS.lng, lat, lng);
  if (km <= 6) return 'central';
  if (km > 25) return 'beyond 25 km';
  const bearing = (Math.atan2((lng - CHARING_CROSS.lng) * Math.cos(toRad(CHARING_CROSS.lat)), lat - CHARING_CROSS.lat) * 180) / Math.PI;
  const b = (bearing + 360) % 360;
  if (b >= 315 || b < 45) return 'north';
  if (b < 135) return 'east';
  if (b < 225) return 'south';
  return 'west';
}


/** Area of a polygonal geometry in hectares (holes subtracted), on a local flat projection. Null for a point or no geometry. */
export function polygonAreaHa(geometry) {
  const polys = polygons(geometry);
  if (!polys.length) return null;
  let m2 = 0;
  for (const [outer, ...holes] of polys) {
    const lat0 = outer.reduce((sum, [, lat]) => sum + lat, 0) / outer.length;
    const kx = 111320 * Math.cos(toRad(lat0));
    const ky = 110540;
    const shoelace = (ring) => {
      let a = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) a += ring[j][0] * kx * (ring[i][1] * ky) - ring[i][0] * kx * (ring[j][1] * ky);
      return Math.abs(a) / 2;
    };
    m2 += shoelace(outer) - holes.reduce((sum, hole) => sum + shoelace(hole), 0);
  }
  return m2 / 10000;
}
