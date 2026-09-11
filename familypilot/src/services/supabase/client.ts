import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

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
