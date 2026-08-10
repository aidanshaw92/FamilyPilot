/** Haversine distance in km. */
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Rough drive minutes at ~40 km/h average including local roads. */
function estimateDriveMinutes(fromLat, fromLng, toLat, toLng) {
  const km = distanceKm(fromLat, fromLng, toLat, toLng);
  return Math.max(1, Math.round((km / 40) * 60 * 1.25));
}

module.exports = {
  distanceKm,
  estimateDriveMinutes,
};
