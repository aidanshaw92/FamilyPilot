/**
 * Proves what a DEPLOYED web build hands the browser about Supabase, without an account and without a
 * single provider request.
 *
 * Usage: node scripts/verify-client-config.mjs <index.html> <bundle.js>... [--expect-ref=<project ref>]
 *
 * WHY THIS EXISTS. The Saved tab offers "Back up" and "Restore" only when `isSupabaseConfigured` is
 * true, and that flag is computed from `EXPO_PUBLIC_SUPABASE_URL` and the publishable key AT BUILD TIME.
 * The Vercel dashboard saying the variables exist is a claim about the dashboard. Only the shipped
 * bundle can show whether the running build inlined them, and a parent who sees "not switched on in
 * this build" is looking at the bundle, not the dashboard. So this reads the bundle.
 *
 * It is read-only: the workflow step fetches the page and the scripts it references with GET, exactly
 * as a browser would, and this file inspects the downloaded text. Nothing is signed in, nothing is
 * uploaded, no family profile exists anywhere in the process.
 *
 * It also asks the adversarial question the same bytes answer: is anything in the bundle that should
 * never be client-side? A `sb_secret_` key, a `service_role` JWT, or a Google API key in the browser
 * bundle is a defect whatever the Saved tab shows, so each of those FAILS the run. Matched secrets are
 * never printed; only the detector name is.
 *
 * Why the `sb_publishable_` prefix alone is not enough: supabase-js itself carries that literal to
 * classify keys, so every bundle contains it. A real key has a body after the prefix.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const PROJECT_URL = /https:\/\/([a-z]{20})\.supabase\.co\b/g;
const PUBLISHABLE_KEY = /sb_publishable_[A-Za-z0-9_-]{10,}/g;
const SECRET_KEY = /sb_secret_[A-Za-z0-9_-]{10,}/g;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g;
const GOOGLE_API_KEY = /AIza[0-9A-Za-z_-]{35}/g;
const BUNDLE_SRC = /<script[^>]*\bsrc="([^"]*\/_expo\/static\/js\/web\/[^"]+\.js)"/g;

function decodeJwtPayload(payloadSegment) {
  try {
    const json = Buffer.from(payloadSegment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

/**
 * @param {{ html: string, bundles: Array<{ name: string, text: string }>, expectRef?: string }} input
 * @returns {{ checks: Array<{ ok: boolean, label: string, detail: string }>, failures: string[], summary: Record<string, unknown> }}
 */
export function verifyClientConfig({ html, bundles, expectRef }) {
  const checks = [];
  const check = (ok, label, detail = '') => {
    checks.push({ ok, label, detail });
    return ok;
  };

  const referenced = [...html.matchAll(BUNDLE_SRC)].map((m) => basename(m[1]));
  check(referenced.length > 0, 'the page references at least one exported bundle', `${referenced.length} script tag(s)`);
  const provided = bundles.map((b) => basename(b.name));
  const missing = referenced.filter((name) => !provided.includes(name));
  check(
    missing.length === 0 && provided.length > 0,
    'every bundle the page references was fetched, so the sweep below reads the whole client',
    missing.length ? `missing: ${missing.join(', ')}` : `${provided.length} file(s)`,
  );

  const refs = new Set();
  let publishableCount = 0;
  let anonJwtCount = 0;
  const jwtRoles = new Set();
  const jwtRefs = new Set();
  let secretKeyHits = 0;
  let serviceRoleHits = 0;
  let googleKeyHits = 0;
  const filesWithUrl = [];
  const filesWithKey = [];

  for (const bundle of bundles) {
    const text = bundle.text;
    const name = basename(bundle.name);
    const urlRefs = [...text.matchAll(PROJECT_URL)].map((m) => m[1]);
    if (urlRefs.length) filesWithUrl.push(name);
    for (const r of urlRefs) refs.add(r);

    const publishable = [...text.matchAll(PUBLISHABLE_KEY)].length;
    publishableCount += publishable;

    let anonHere = 0;
    for (const m of text.matchAll(JWT)) {
      const payload = decodeJwtPayload(m[1]);
      if (!payload) continue;
      if (typeof payload.role === 'string') jwtRoles.add(payload.role);
      if (typeof payload.ref === 'string') jwtRefs.add(payload.ref);
      if (payload.role === 'anon') anonHere += 1;
      if (payload.role === 'service_role') serviceRoleHits += 1;
    }
    anonJwtCount += anonHere;
    if (publishable || anonHere) filesWithKey.push(name);

    secretKeyHits += [...text.matchAll(SECRET_KEY)].length;
    googleKeyHits += [...text.matchAll(GOOGLE_API_KEY)].length;
  }

  // --- the Saved tab's precondition ---
  check(refs.size === 1, 'exactly one Supabase project URL is inlined', refs.size ? `ref(s): ${[...refs].join(', ')}` : 'none found (EXPO_PUBLIC_SUPABASE_URL was not set at build time)');
  if (expectRef) {
    check(refs.has(expectRef), `the inlined project is the expected one (${expectRef})`, `found: ${[...refs].join(', ') || 'none'}`);
  }
  const keyCount = publishableCount + anonJwtCount;
  check(
    keyCount >= 1,
    'a client key is inlined beside it (publishable key, or a legacy anon JWT)',
    `publishable: ${publishableCount}, anon JWT: ${anonJwtCount}`,
  );
  if (anonJwtCount && expectRef) {
    check(jwtRefs.has(expectRef), 'the legacy anon JWT belongs to the expected project', `jwt ref(s): ${[...jwtRefs].join(', ') || 'none'}`);
  }
  check(
    filesWithUrl.length > 0 && filesWithUrl.every((f) => filesWithKey.includes(f)),
    'URL and key sit in the same bundle, so isSupabaseConfigured is true where the client is built',
    `url in: ${filesWithUrl.join(', ') || 'none'}; key in: ${filesWithKey.join(', ') || 'none'}`,
  );

  // --- nothing that must never be client-side ---
  check(secretKeyHits === 0, 'no sb_secret_ key in the bundle', `${secretKeyHits} hit(s)`);
  check(serviceRoleHits === 0, 'no service_role JWT in the bundle', `${serviceRoleHits} hit(s); roles seen: ${[...jwtRoles].join(', ') || 'none'}`);
  check(googleKeyHits === 0, 'no Google API key in the bundle', `${googleKeyHits} hit(s)`);

  const failures = checks.filter((c) => !c.ok).map((c) => c.label);
  return {
    checks,
    failures,
    summary: {
      referencedBundles: referenced,
      projectRefs: [...refs],
      publishableKeys: publishableCount,
      anonJwts: anonJwtCount,
      secretKeys: secretKeyHits,
      serviceRoleJwts: serviceRoleHits,
      googleKeys: googleKeyHits,
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  const expectRef = args.find((a) => a.startsWith('--expect-ref='))?.slice('--expect-ref='.length);
  const files = args.filter((a) => !a.startsWith('--'));
  const [htmlPath, ...bundlePaths] = files;
  if (!htmlPath) {
    console.error('usage: verify-client-config.mjs <index.html> <bundle.js>... [--expect-ref=<project ref>]');
    process.exit(2);
  }
  const html = readFileSync(htmlPath, 'utf8');
  const bundles = bundlePaths.map((p) => ({ name: p, text: readFileSync(p, 'utf8') }));
  const result = verifyClientConfig({ html, bundles, expectRef });

  console.log(`page: ${htmlPath} (${html.length} bytes)`);
  for (const b of bundles) console.log(`bundle: ${basename(b.name)} (${b.text.length} bytes)`);
  console.log('');
  for (const c of result.checks) console.log(`  [${c.ok ? 'ok' : 'FAIL'}] ${c.label}${c.detail ? `: ${c.detail}` : ''}`);
  console.log('');
  console.log(`summary: ${JSON.stringify(result.summary)}`);
  if (result.failures.length) {
    console.log(`::error::${result.failures.length} client-config check(s) failed: ${result.failures.join('; ')}`);
    process.exit(1);
  }
  console.log('client config verified: the deployed build is configured for Saved backup and ships no server secret');
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
