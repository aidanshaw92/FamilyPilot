import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Where this build was made, stamped at build time by `scripts/build-web.mjs` from Vercel's `VERCEL_ENV`
 * (production | preview | development). Unset for a local, CI or fixture build.
 *
 * A Vercel PREVIEW build never has accounts. There is one Supabase project and it is production: a sign-up on a
 * preview would create a real account (and send a real verification email) in it, and every pull request would be a way
 * to do that. So a preview build behaves exactly as a build with no auth backend: no account step, no sign-in, no
 * invitations, no cloud backup. Accounts are verified on production only. Turning this off needs a code change, not a
 * dashboard setting, on purpose.
 */
export const deployEnv = process.env.EXPO_PUBLIC_DEPLOY_ENV ?? '';
export const accountsBlockedOnThisBuild = deployEnv === 'preview';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey) && !accountsBlockedOnThisBuild;

// Expo Router's static web export prerenders every route in a Node.js process
// (no `window`/DOM). AsyncStorage's web implementation reads window.localStorage
// and throws synchronously there, and supabase-js reads storage during client
// construction (session recovery) whenever persistSession is on - crashing the
// whole export. Native builds are unaffected (AsyncStorage uses a native module
// there, regardless of `window`), and a real browser has `window` once the page
// hydrates, which is when this module re-evaluates and creates a real client.
const isPrerenderingWeb = Platform.OS === 'web' && typeof window === 'undefined';

export const supabase = isSupabaseConfigured && !isPrerenderingWeb
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: typeof window !== 'undefined' } })
  : null;
