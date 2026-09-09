const { randomBytes, createHash } = require('node:crypto');
const { getSupabaseAdmin } = require('../enrichment/_lib/supabase-admin');

// Share only a coarse area and planning preferences. Never routine times or names of children.
function safeSnapshot(input) {
  if (!input || typeof input.label !== 'string' || typeof input.area !== 'string' || !Array.isArray(input.ages) || input.ages.length>10 || input.ages.some(n=>!Number.isFinite(n)||n<0||n>17) || !Number.isFinite(input.latitude) || Math.abs(input.latitude)>90 || !Number.isFinite(input.longitude) || Math.abs(input.longitude)>180 || !Number.isFinite(input.maxDriveMinutes) || input.maxDriveMinutes<5 || input.maxDriveMinutes>120) throw new Error('Invalid family details');
  return { label:input.label.slice(0,60),area:input.area.slice(0,80),latitude:Math.round(input.latitude*100)/100,longitude:Math.round(input.longitude*100)/100,ages:input.ages,
    maxDriveMinutes:input.maxDriveMinutes,budgetTier:['budget','moderate','premium'].includes(input.budgetTier)?input.budgetTier:'moderate',pushchair:input.pushchair===true,
    required:Array.isArray(input.required)?input.required.filter(x=>['toilets','babyChanging','parking','pushchair'].includes(x)):[],
    routines:input.shareAvailability===true&&Array.isArray(input.routines)?input.routines.filter(r=>r.atHome===true&&/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)&&Number.isFinite(r.durationMinutes)&&r.durationMinutes>0&&r.durationMinutes<=240).slice(0,20).map((r,i)=>({id:`busy-${i}`,label:'Home time',kind:'nap',time:r.time,durationMinutes:r.durationMinutes,atHome:true})):[] };
}
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST','DELETE'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  const admin=getSupabaseAdmin();if(!admin)return res.status(503).json({error:'Family connections are not configured yet.'});
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!token)return res.status(401).json({error:'Sign in to connect families.'});
  const {data:auth,error:authError}=await admin.auth.getUser(token);
  if(authError||!auth.user)return res.status(401).json({error:'Please sign in again.'});
  const userId=auth.user.id;
  try {
    if(req.method==='GET') {
      const {data,error}=await admin.from('planning_connections').select('id,owner_id,guest_id,owner_snapshot,guest_snapshot,accepted_at,expires_at').or(`owner_id.eq.${userId},guest_id.eq.${userId}`);
      if(error)throw error;
      return res.json({connections:(data||[]).map(row=>({id:row.id,pending:!row.accepted_at,expiresAt:row.expires_at,family:row.accepted_at?(row.owner_id===userId?row.guest_snapshot:row.owner_snapshot):null}))});
    }
    if(req.method==='DELETE') {
      if(!/^[0-9a-f-]{36}$/i.test(req.body?.id||''))return res.status(400).json({error:'Invalid connection'});
      const {error}=await admin.from('planning_connections').delete().eq('id',req.body.id).or(`owner_id.eq.${userId},guest_id.eq.${userId}`);if(error)throw error;
      return res.json({ok:true});
    }
    const snapshot=safeSnapshot(req.body?.family);
    if(req.body?.action==='create') {
      const {count,error:countError}=await admin.from('planning_connections').select('id',{count:'exact',head:true}).eq('owner_id',userId);
      if(countError)throw countError;if(count>=30)return res.status(429).json({error:'Remove an old invitation or connection before creating another.'});
      const code=randomBytes(32).toString('hex');
      const {data,error}=await admin.from('planning_connections').insert({owner_id:userId,owner_snapshot:snapshot,token_hash:createHash('sha256').update(code).digest('hex')}).select('id,expires_at').single();if(error)throw error;
      return res.json({code,id:data.id,expiresAt:data.expires_at});
    }
    if(req.body?.action==='accept') {
      const code=req.body.code;if(typeof code!=='string'||!/^[a-f0-9]{64}$/.test(code))return res.status(400).json({error:'Check the invitation code.'});
      const {data,error}=await admin.from('planning_connections').update({guest_id:userId,guest_snapshot:snapshot,accepted_at:new Date().toISOString()})
        .eq('token_hash',createHash('sha256').update(code).digest('hex')).is('guest_id',null).neq('owner_id',userId).gt('expires_at',new Date().toISOString()).select('id').maybeSingle();
      if(error)throw error;if(!data)return res.status(400).json({error:'Invitation expired, already used, or belongs to you.'});
      return res.json({ok:true});
    }
    return res.status(400).json({error:'Unknown action'});
  } catch(error) {return res.status(error.message==='Invalid family details'?400:503).json({error:error.message==='Invalid family details'?error.message:'Connections are temporarily unavailable. Please try again.'});}
};
module.exports.safeSnapshot=safeSnapshot;
