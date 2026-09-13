import { supabase } from '@/src/services/supabase/client';
import { planningApiUrl } from './recommendations';
import { PlanMatch } from './planner';

export type PlanInviteStatus = 'pending' | 'accepted' | 'declined';
export type PlanInviteDirection = 'sent' | 'received';

export interface PlanInvite {
  id: string;
  connectionId: string;
  direction: PlanInviteDirection;
  otherLabel: string;
  planId: string;
  planDate: string;
  plan: PlanMatch;
  status: PlanInviteStatus;
  createdAt: string;
  respondedAt: string | null;
}

async function api(path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', body?: unknown) {
  if (!supabase) throw new Error('Plan sharing needs to be enabled by the app owner.');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Please sign in.');
  const response = await fetch(planningApiUrl(path), {
    method,
    headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Plan sharing unavailable');
  return result;
}

export async function listPlanInvites(): Promise<PlanInvite[]> {
  const result = await api('plan-invites');
  return result.invites;
}

export async function createPlanInvite(
  connectionId: string,
  plan: { id: string; date: string; plan: PlanMatch },
): Promise<void> {
  await api('plan-invites', 'POST', { action: 'create', connectionId, plan });
}

export async function respondToPlanInvite(id: string, status: 'accepted' | 'declined'): Promise<void> {
  await api('plan-invites', 'POST', { action: 'respond', id, status });
}

export async function cancelPlanInvite(id: string): Promise<void> {
  await api('plan-invites', 'DELETE', { id });
}
