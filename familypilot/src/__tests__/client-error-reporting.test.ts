import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/services/supabase/client', () => ({ supabase: null }));
vi.mock('@/src/services/planning/recommendations', () => ({ planningApiUrl: () => '' }));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
import { buildClientErrorPayload, installClientErrorReporting, reportClientError, resetClientErrorsForTests, shouldSend } from '@/src/services/monitoring/client-errors';
const { sanitiseClientError, allowReport } = require('../../../server/feedback/_lib/client-error');

afterEach(() => {
  vi.unstubAllEnvs();
  resetClientErrorsForTests();
});

describe('client error reporting is off unless a build turns it on', () => {
  it('sends nothing and installs nothing by default', async () => {
    const payload = buildClientErrorPayload('uncaught', new Error('boom'), '/venue/fp-x');
    expect(shouldSend(payload)).toBe(false);
    expect(installClientErrorReporting()()).toBeUndefined();
    await expect(reportClientError('render', new Error('boom'))).resolves.toBeUndefined();
  });

  it('when on: caps a session at five different reports and drops repeats', () => {
    vi.stubEnv('EXPO_PUBLIC_CLIENT_ERRORS', 'on');
    const send = (m: string) => shouldSend(buildClientErrorPayload('promise', new Error(m), '/'));
    expect(send('a')).toBe(true);
    expect(send('a')).toBe(false);
    for (const m of ['b', 'c', 'd', 'e']) expect(send(m)).toBe(true);
    expect(send('f')).toBe(false);
  });

  it('never throws, even with nothing to send to', async () => {
    vi.stubEnv('EXPO_PUBLIC_CLIENT_ERRORS', 'on');
    await expect(reportClientError('api', undefined)).resolves.toBeUndefined();
  });
});

describe('what the server keeps', () => {
  it('only allowlisted fields, and nothing that identifies a family', () => {
    const clean = sanitiseClientError({
      kind: 'client-error',
      errorKind: 'render',
      message: 'Cannot read x for sam@example.com near SW1A 1AA at 51.50123, -0.14245 with eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk',
      stack: 'Error\n at f (https://app/_expo/static/js/web/entry.js:1:2)',
      route: '/venue/fp-google-ChIJabcdefghijklmnop?child=Ida#x',
      profile: { children: [{ name: 'Ida', age: 7 }] },
      authorization: 'Bearer secret',
      viewport: '393x852',
    });
    expect(Object.keys(clean).sort()).toEqual(['build', 'kind', 'message', 'name', 'platform', 'route', 'stack', 'viewport']);
    const text = JSON.stringify(clean);
    for (const leak of ['sam@example.com', 'SW1A', '51.50123', 'eyJhbGci', 'Ida', 'secret', 'ChIJabc', 'child=']) expect(text).not.toContain(leak);
    expect(clean.route).toBe('/venue/[id]');
    expect(clean.viewport).toBe('393x852');
  });

  it('caps lengths, defaults an unknown kind, and refuses an empty or non-object report', () => {
    expect(sanitiseClientError({ errorKind: 'weird', message: 'x'.repeat(5000) }).message.length).toBeLessThanOrEqual(300);
    expect(sanitiseClientError({ errorKind: 'weird', message: 'm' }).kind).toBe('uncaught');
    expect(() => sanitiseClientError({ message: '' })).toThrow();
    expect(() => sanitiseClientError(null)).toThrow();
  });

  it('allows ten reports a minute for one account and no more', () => {
    const t = 1_000_000;
    const results = Array.from({ length: 12 }, () => allowReport('user-a', t));
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(allowReport('user-b', t)).toBe(true);
    expect(allowReport('user-a', t + 61_000)).toBe(true);
  });
});
