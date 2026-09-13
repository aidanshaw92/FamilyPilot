const { getSupabaseAdmin } = require('../../server/enrichment/_lib/supabase-admin');

const MAX_SNAPSHOT_JSON_LENGTH = 8000;

// The plan itself (venue, timings, reasons) is opaque to this endpoint - it only needs to be a
// JSON object under a sane size limit so an invite can't be used to store arbitrary large blobs.
function safePlanSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid plan');
  const json = JSON.stringify(input);
  if (json.length > MAX_SNAPSHOT_JSON_LENGTH) throw new Error('This plan is too large to share.');
  return input;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ error: 'Plan sharing is not configured yet.' });
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Sign in to share plans.' });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return res.status(401).json({ error: 'Please sign in again.' });
  const userId = auth.user.id;

  try {
    if (req.method === 'GET') {
      const { data, error } = await admin
        .from('plan_invites')
        .select('id,connection_id,owner_id,invitee_id,plan_id,plan_date,plan_snapshot,status,created_at,responded_at')
        .or(`owner_id.eq.${userId},invitee_id.eq.${userId}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const connectionIds = [...new Set((data || []).map((row) => row.connection_id))];
      const { data: connections, error: connError } = connectionIds.length
        ? await admin.from('planning_connections').select('id,owner_id,guest_id,owner_snapshot,guest_snapshot').in('id', connectionIds)
        : { data: [], error: null };
      if (connError) throw connError;
      const connectionById = new Map((connections || []).map((c) => [c.id, c]));
      return res.json({
        invites: (data || []).map((row) => {
          const isSender = row.owner_id === userId;
          const otherUserId = isSender ? row.invitee_id : row.owner_id;
          const connection = connectionById.get(row.connection_id);
          const otherSnapshot = connection
            ? connection.owner_id === otherUserId
              ? connection.owner_snapshot
              : connection.guest_snapshot
            : null;
          return {
            id: row.id,
            connectionId: row.connection_id,
            direction: isSender ? 'sent' : 'received',
            otherLabel: otherSnapshot?.label ?? 'A connected family',
            planId: row.plan_id,
            planDate: row.plan_date,
            plan: row.plan_snapshot,
            status: row.status,
            createdAt: row.created_at,
            respondedAt: row.responded_at,
          };
        }),
      });
    }

    if (req.method === 'DELETE') {
      if (!/^[0-9a-f-]{36}$/i.test(req.body?.id || '')) return res.status(400).json({ error: 'Invalid invite' });
      const { error } = await admin
        .from('plan_invites')
        .delete()
        .eq('id', req.body.id)
        .or(`owner_id.eq.${userId},invitee_id.eq.${userId}`);
      if (error) throw error;
      return res.json({ ok: true });
    }

    if (req.body?.action === 'create') {
      const connectionId = req.body.connectionId;
      if (!/^[0-9a-f-]{36}$/i.test(connectionId || '')) return res.status(400).json({ error: 'Choose a connected family.' });
      const { data: connection, error: connError } = await admin
        .from('planning_connections')
        .select('id,owner_id,guest_id,accepted_at')
        .eq('id', connectionId)
        .maybeSingle();
      if (connError) throw connError;
      if (!connection || !connection.accepted_at) return res.status(400).json({ error: 'That family is not connected yet.' });
      if (connection.owner_id !== userId && connection.guest_id !== userId) {
        return res.status(403).json({ error: 'You are not part of that connection.' });
      }
      const inviteeId = connection.owner_id === userId ? connection.guest_id : connection.owner_id;
      if (!inviteeId) return res.status(400).json({ error: 'That family has not accepted the connection yet.' });

      const plan = req.body.plan;
      if (!plan || typeof plan.id !== 'string' || !plan.id.trim() || plan.id.length > 200 || !/^\d{4}-\d{2}-\d{2}$/.test(plan.date || '')) {
        return res.status(400).json({ error: 'Invalid plan' });
      }
      const snapshot = safePlanSnapshot(plan.plan);

      const { count, error: countError } = await admin
        .from('plan_invites')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .eq('status', 'pending');
      if (countError) throw countError;
      if (count >= 50) return res.status(429).json({ error: 'You have a lot of pending invites out. Cancel one before sending another.' });

      const { data, error } = await admin
        .from('plan_invites')
        .insert({ connection_id: connectionId, owner_id: userId, invitee_id: inviteeId, plan_id: plan.id, plan_date: plan.date, plan_snapshot: snapshot })
        .select('id')
        .single();
      if (error) throw error;
      return res.json({ id: data.id });
    }

    if (req.body?.action === 'respond') {
      const id = req.body.id;
      if (!/^[0-9a-f-]{36}$/i.test(id || '')) return res.status(400).json({ error: 'Invalid invite' });
      const status = req.body.status;
      if (!['accepted', 'declined'].includes(status)) return res.status(400).json({ error: 'Invalid response' });
      const { data, error } = await admin
        .from('plan_invites')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('id', id)
        .eq('invitee_id', userId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(400).json({ error: 'Invite not found or already responded to.' });
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    return res.status(error.message === 'Invalid plan' || error.message === 'This plan is too large to share.' ? 400 : 503).json({
      error: error.message === 'Invalid plan' || error.message === 'This plan is too large to share.' ? error.message : 'Plan sharing is temporarily unavailable. Please try again.',
    });
  }
};
