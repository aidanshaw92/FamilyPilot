import { supabase } from '@/src/services/supabase/client';
import { planningApiUrl } from './recommendations';
import { PlanningFamily } from './planner';

export interface PlanningConnection {
  id: string;
  pending: boolean;
  expiresAt: string;
  family: PlanningFamily | null;
}

/** Connected (accepted) families only - the pool of people a saved plan can be shared with. */
export async function listAcceptedConnections(): Promise<PlanningConnection[]> {
  if (!supabase) throw new Error('Plan sharing needs to be enabled by the app owner.');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Please sign in.');
  const response = await fetch(planningApiUrl('connections'), {
    headers: { Authorization: `Bearer ${data.session.access_token}` },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Connections unavailable');
  return (result.connections as PlanningConnection[]).filter((c) => !c.pending);
}
