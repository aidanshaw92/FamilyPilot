import { afterEach, describe, expect, it, vi } from 'vitest';

import { coarse, fetchBetween } from '@/src/services/places/between-client';

/**
 * Where two families live leaves the device in a request URL, so it is rounded first: about a kilometre, as a connection's
 * snapshot is. The corridor first pass is a straight line and does not need an address.
 */

afterEach(() => vi.unstubAllGlobals());

const body = { places: [], provider: 'stored-catalogue', googleCalls: 0, considered: 0, shortlisted: 0 };

describe('the between request', () => {
  it('rounds both homes to about a kilometre and asks for intent=between', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      seen.push(url);
      return { ok: true, json: async () => body };
    });
    await fetchBetween({ latitude: 51.643217, longitude: -0.360481, maxDriveMinutes: 60 }, { latitude: 51.590944, longitude: -0.020377 });

    const query = new URL(seen[0], 'http://x').searchParams;
    expect(query.get('intent')).toBe('between');
    expect(query.get('aLat')).toBe('51.64');
    expect(query.get('aLng')).toBe('-0.36');
    expect(query.get('bLat')).toBe('51.59');
    expect(query.get('bLng')).toBe('-0.02');
    // No more precision than that appears anywhere in the request.
    expect(seen[0]).not.toMatch(/\d\.\d{3,}/);
    expect(query.get('aMaxKm')).toBe('72');
    expect(query.get('bMaxKm')).toBeNull();
  });

  it('rounds the way a connection snapshot does', () => {
    expect(coarse(51.6432)).toBe(51.64);
    expect(coarse(-0.3605)).toBe(-0.36);
  });

  it('propagates a failure instead of resolving to an empty list', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 503, json: async () => ({ error: 'The venue catalogue is unavailable' }) }));
    await expect(fetchBetween({ latitude: 51.6, longitude: -0.3 }, { latitude: 51.5, longitude: -0.1 })).rejects.toThrow('The venue catalogue is unavailable');
  });
});
