/**
 * The device's current location, asked for ONLY when the parent taps "My current location".
 *
 * Nothing here runs on load, and the result is never stored or sent anywhere: the caller keeps it in memory for the session so
 * distances can be measured on the phone. A refusal, a missing sensor or a timeout is an ordinary answer, not an error: the
 * caller falls back to the home area or a postcode and says so.
 */
export type DeviceLocationResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: 'denied' | 'unavailable' | 'timeout' };

type GeolocationLike = Pick<Geolocation, 'getCurrentPosition'>;

export function deviceLocationSupported(geo: GeolocationLike | undefined = typeof navigator === 'undefined' ? undefined : navigator.geolocation): boolean {
  return Boolean(geo && typeof geo.getCurrentPosition === 'function');
}

export function requestDeviceLocation(geo: GeolocationLike | undefined = typeof navigator === 'undefined' ? undefined : navigator.geolocation): Promise<DeviceLocationResult> {
  return new Promise((resolve) => {
    if (!geo || typeof geo.getCurrentPosition !== 'function') {
      resolve({ ok: false, reason: 'unavailable' });
      return;
    }
    geo.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        resolve(Number.isFinite(latitude) && Number.isFinite(longitude) ? { ok: true, latitude, longitude } : { ok: false, reason: 'unavailable' });
      },
      (error) => resolve({ ok: false, reason: error?.code === 1 ? 'denied' : error?.code === 3 ? 'timeout' : 'unavailable' }),
      // A rough fix is enough to say how far places are, and is quicker and kinder to the battery than a precise one.
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  });
}
