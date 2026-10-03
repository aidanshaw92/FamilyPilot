import { describe, expect, it } from 'vitest';

// The script is plain ESM; the test exercises its pure core on synthetic bundles so the CI-side
// assertion is itself covered without fetching anything.
import { verifyClientConfig } from '../../scripts/verify-client-config.mjs';

const REF = 'abcdefghijklmnopqrst';
const b64url = (obj: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (payload: Record<string, unknown>) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.${'x'.repeat(43)}`;

const HTML = '<!doctype html><html><head><script src="/_expo/static/js/web/entry-abc.js" defer></script></head></html>';
// What supabase-js itself carries: the wildcard host and the bare key prefix used to classify keys.
const LIBRARY_NOISE = 't.push("*.supabase.co","*.supabase.in");k.startsWith("sb_publishable_")';

const bundle = (text: string, name = 'entry-abc.js') => ({ name, text });

describe('verify-client-config', () => {
  it('passes a bundle that inlines the project URL and a publishable key, and nothing secret', () => {
    const text = `${LIBRARY_NOISE};const u="https://${REF}.supabase.co",k="sb_publishable_AbCdEfGhIjKlMnOpQrStUv";`;
    const result = verifyClientConfig({ html: HTML, bundles: [bundle(text)], expectRef: REF });
    expect(result.failures).toEqual([]);
    expect(result.summary.projectRefs).toEqual([REF]);
    expect(result.summary.publishableKeys).toBe(1);
  });

  it('accepts a legacy anon JWT for the expected project as the client key', () => {
    const text = `const u="https://${REF}.supabase.co",k="${jwt({ iss: 'supabase', ref: REF, role: 'anon' })}";`;
    const result = verifyClientConfig({ html: HTML, bundles: [bundle(text)], expectRef: REF });
    expect(result.failures).toEqual([]);
    expect(result.summary.anonJwts).toBe(1);
  });

  it('fails an unconfigured build: library noise alone is neither a project URL nor a key', () => {
    const result = verifyClientConfig({ html: HTML, bundles: [bundle(LIBRARY_NOISE)], expectRef: REF });
    expect(result.failures).toContain('exactly one Supabase project URL is inlined');
    expect(result.failures).toContain('a client key is inlined beside it (publishable key, or a legacy anon JWT)');
    expect(result.summary.publishableKeys).toBe(0);
  });

  it('fails when the URL is present but no key is, which is what a half-set dashboard produces', () => {
    const text = `${LIBRARY_NOISE};const u="https://${REF}.supabase.co";`;
    const result = verifyClientConfig({ html: HTML, bundles: [bundle(text)], expectRef: REF });
    expect(result.failures).toContain('a client key is inlined beside it (publishable key, or a legacy anon JWT)');
  });

  it('fails when the inlined project is not the expected one', () => {
    const other = 'zyxwvutsrqponmlkjihg';
    const text = `const u="https://${other}.supabase.co",k="sb_publishable_AbCdEfGhIjKlMnOpQrStUv";`;
    const result = verifyClientConfig({ html: HTML, bundles: [bundle(text)], expectRef: REF });
    expect(result.failures).toContain(`the inlined project is the expected one (${REF})`);
  });

  it('fails a configured build that also ships a server secret, and never echoes the secret', () => {
    // Assembled at runtime so the source never carries a secret-shaped literal (push protection
    // flags the fixture as a real key otherwise, which is the detector doing its job).
    const secret = ['sb', 'secret', 'ThisMustNeverReachTheBrowser123'].join('_');
    const service = jwt({ iss: 'supabase', ref: REF, role: 'service_role' });
    const google = `AIza${'Q'.repeat(35)}`;
    const text = `const u="https://${REF}.supabase.co",k="sb_publishable_AbCdEfGhIjKlMnOpQrStUv",s="${secret}",j="${service}",g="${google}";`;
    const result = verifyClientConfig({ html: HTML, bundles: [bundle(text)], expectRef: REF });
    expect(result.failures).toEqual(
      expect.arrayContaining(['no sb_secret_ key in the bundle', 'no service_role JWT in the bundle', 'no Google API key in the bundle']),
    );
    const everything = JSON.stringify(result);
    expect(everything).not.toContain(secret);
    expect(everything).not.toContain(service);
    expect(everything).not.toContain(google);
  });

  it('fails when a referenced bundle was not fetched, so a partial download cannot pass', () => {
    const html = `${HTML}<script src="/_expo/static/js/web/chunk-def.js" defer></script>`;
    const text = `const u="https://${REF}.supabase.co",k="sb_publishable_AbCdEfGhIjKlMnOpQrStUv";`;
    const result = verifyClientConfig({ html, bundles: [bundle(text)], expectRef: REF });
    expect(result.failures).toContain('every bundle the page references was fetched, so the sweep below reads the whole client');
  });

  it('fails when the page references no bundle at all (an error page or a redirect body)', () => {
    const result = verifyClientConfig({ html: '<html>Authentication Required</html>', bundles: [], expectRef: REF });
    expect(result.failures).toContain('the page references at least one exported bundle');
  });
});
