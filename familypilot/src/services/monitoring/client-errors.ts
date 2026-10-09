import { Platform } from 'react-native';

import { supabase } from '@/src/services/supabase/client';
import { planningApiUrl } from '@/src/services/planning/recommendations';
import { personalTerms, scrubPersonal } from '@/src/services/monitoring/scrub-personal';
import { useAuthStore } from '@/src/stores/auth-store';
import { useFamilyStore } from '@/src/stores/family-store';
import { usePlanningStore } from '@/src/stores/planning-store';

/**
 * Basic crash reporting for the invitation-only beta. Off unless the build sets EXPO_PUBLIC_CLIENT_ERRORS=on.
 * It sends what broke and where (message, short stack, route without ids, build, viewport) to the existing feedback endpoint
 * for a signed-in person, which scrubs it again and writes one log line. It never sends the profile, children, plans,
 * locations or the page contents, and it never throws.
 */
export function clientErrorsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_CLIENT_ERRORS === 'on';
}

export type ClientErrorKind = 'render' | 'uncaught' | 'promise' | 'api';

const MAX_PER_SESSION = 5;
const sent = new Set<string>();

/** Pure: the payload for one error, capped. The server scrubs it again. */
export function buildClientErrorPayload(kind: ClientErrorKind, error: unknown, route = '', terms: string[] = []): Record<string, string> {
  const clean = (text: string, max: number) => scrubPersonal(text, terms).slice(0, max);
  const e = error as { message?: unknown; name?: unknown; stack?: unknown } | null | undefined;
  const message = typeof error === 'string' ? error : typeof e?.message === 'string' ? e.message : 'Unknown error';
  const viewport =
    typeof window !== 'undefined' && typeof window.innerWidth === 'number' ? `${Math.round(window.innerWidth)}x${Math.round(window.innerHeight)}` : '';
  return {
    kind: 'client-error',
    errorKind: kind,
    message: clean(message, 300),
    name: typeof e?.name === 'string' ? clean(e.name, 60) : '',
    stack: typeof e?.stack === 'string' ? clean(e.stack, 900) : '',
    route: clean(route.split(/[?#]/)[0], 200),
    build: (process.env.EXPO_PUBLIC_BUILD_ID || '').slice(0, 40),
    platform: Platform.OS,
    viewport,
  };
}

/** True when this report should be sent: enabled, under the per-session cap, and not a repeat of one already sent. */
export function shouldSend(payload: Record<string, string>): boolean {
  if (!clientErrorsEnabled() || sent.size >= MAX_PER_SESSION) return false;
  const key = `${payload.errorKind}|${payload.message}|${payload.route}`;
  if (sent.has(key)) return false;
  sent.add(key);
  return true;
}

export function resetClientErrorsForTests() {
  sent.clear();
}

export async function reportClientError(kind: ClientErrorKind, error: unknown, route = ''): Promise<void> {
  try {
    const terms = personalTerms(useFamilyStore.getState().profile, useAuthStore.getState().email, usePlanningStore.getState().families.map((f) => f.label));
    const payload = buildClientErrorPayload(kind, error, route, terms);
    if (!shouldSend(payload) || !supabase) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await fetch(planningApiUrl('feedback'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // Reporting must never break the app it is watching.
  }
}

/** Web: report errors nothing caught. Returns the function that removes the listeners. */
export function installClientErrorReporting(currentRoute: () => string = () => (typeof window !== 'undefined' ? window.location.pathname : '')): () => void {
  if (!clientErrorsEnabled() || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {};
  const onError = (event: ErrorEvent) => void reportClientError('uncaught', event.error ?? event.message, currentRoute());
  const onRejection = (event: PromiseRejectionEvent) => void reportClientError('promise', event.reason, currentRoute());
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
