/**
 * The places a screen is served, with the provider they say they came from.
 *
 * WHY THIS EXISTS. A Google place is never drawn on the app's own map (src/utils/map-compliance.ts), so the Meet halfway map, and
 * everything on it, only appears for places whose provider is independent. The fixture catalogue is Google-shaped, so a check that is
 * about the map's LAYOUT (pins, the sheet over the map, larger text) serves the same places as OpenStreetMap places instead. The
 * layout is identical; only the provider differs. What happens to real Google places is checked by verify-map-compliance.mjs.
 */

/** The same response with every place (and the response) carrying the given provider. `placesOnly` leaves the response's own provider label alone. */
export function asProvider(payload, provider, { placesOnly = false } = {}) {
  return { ...payload, ...(placesOnly ? {} : { provider }), places: (payload.places ?? []).map((place) => ({ ...place, provider })) };
}

/** Serve whatever the between endpoint returns, but as `provider`'s places. */
export async function routeBetweenAs(page, provider, options) {
  await page.route((url) => /intent=between/.test(url.toString()), async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: asProvider(body, provider, options) });
  });
}

/** Serve every places search (Explore's catalogue, nearby, between) as `provider`'s places, for a check about a map's layout or behaviour. */
export async function routePlacesAs(page, provider, options) {
  await page.route((url) => /\/api\/places\/search/.test(url.toString()), async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: asProvider(body, provider, options) });
  });
}

/** Serve `payload` (a between response, such as the Figma places fixture) for every between request, as `provider`'s places. */
export async function routeBetweenFixture(page, payload, provider) {
  await page.route((url) => /intent=between/.test(url.toString()), (route) => route.fulfill({ json: asProvider(payload, provider) }));
}
