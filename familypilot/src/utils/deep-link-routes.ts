/**
 * Deep link verification checklist for Expo Web static export.
 *
 * Run after `npm run build:web`:
 *   npm run test:routes
 *
 * Manual browser checks:
 * - /venue/venue-1 loads venue detail (not 404)
 * - /venue/invalid-id shows "Place not found"
 * - /need-now, /holiday, /packing, /car-fit load directly
 * - Browser refresh on each route does not 404
 */

import { VENUE_IDS } from '@/src/utils/venue-routes';

export const STACK_ROUTES = ['need-now', 'holiday', 'packing', 'car-fit', 'about'] as const;

export function getExpectedVenuePaths(): string[] {
  return VENUE_IDS.map((id) => `venue/${id}.html`);
}

export function getExpectedStackPaths(): string[] {
  return STACK_ROUTES.map((route) => `${route}.html`);
}
