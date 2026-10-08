import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

import { withinMs } from '@/src/utils/soft-deadline';

describe('a soft input never holds a screen longer than its grace', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the value when it arrives in time, and leaves no timer running', async () => {
    const p = withinMs(new Promise<string>((r) => setTimeout(() => r('sunny'), 200)), 1500, null);
    await vi.advanceTimersByTimeAsync(200);
    await expect(p).resolves.toBe('sunny');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives up at the deadline when the work is still out, and ignores the late value', async () => {
    const p = withinMs(new Promise<string>((r) => setTimeout(() => r('late'), 9000)), 1500, null);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(p).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(9000);
    await expect(p).resolves.toBeNull();
  });

  it('treats a failure as the fallback, not an error', async () => {
    await expect(withinMs(Promise.reject(new Error('down')), 1500, 'none')).resolves.toBe('none');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('wiring', () => {
  it('the venue page waits for the detail alone: neither weather nor parent reports are in the blocking path', () => {
    const source = fs.readFileSync('src/services/api/index.ts', 'utf8');
    const getById = source.slice(source.indexOf('async getById'), source.indexOf('withParentObservations('));
    expect(getById).toContain('getPlacesRepository().getVenueDetail(id, profile)');
    expect(getById).not.toMatch(/Promise\.all|fetchLiveWeather|fetchParentObservations|withinMs/);
  });
});
