/**
 * `npm run build:web`: `expo export --platform web`, with the deployment environment stamped into the bundle.
 *
 * Vercel exposes `VERCEL_ENV` (production | preview | development) to the build, but Expo inlines only variables that
 * start with `EXPO_PUBLIC_`. This copies it across so the client can tell a Preview build from the live one (see
 * src/services/supabase/client.ts: a Preview build never has accounts). An already-set EXPO_PUBLIC_DEPLOY_ENV wins, so
 * a local or CI build can be stamped by hand; with neither, nothing is stamped.
 */
import { spawnSync } from 'node:child_process';

const env = { ...process.env };
if (!env.EXPO_PUBLIC_DEPLOY_ENV && env.VERCEL_ENV) env.EXPO_PUBLIC_DEPLOY_ENV = env.VERCEL_ENV;
const result = spawnSync('npx', ['expo', 'export', '--platform', 'web', ...process.argv.slice(2)], { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
