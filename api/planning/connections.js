const {refuseOnPreview}=require('../../server/accounts/preview-guard');
const { randomBytes, createHash } = require('node:crypto');
const { getSupabaseAdmin } = require('../../server/enrichment/_lib/supabase-admin');

// Share only a coarse area and planning preferences. Never names of children. Routine times and whether each is a nap or a
// feed are shared only when the person ticked "share routines" (shareAvailability), and never with a name or an id.
function safeSnapshot(input) {
  if (!input || typeof input.label !== 'string' || typeof input.area !== 'string' || !Array.isArray(input.ages) || input.ages.length>10 || input.ages.some(n=>!Number.isFinite(n)||n<0||n>17) || !Number.isFinite(input.latitude) || Math.abs(input.latitude)>90 || !Number.isFinite(input.longitude) || Math.abs(input.longitude)>180 || (input.maxDriveMinutes!=null && (!Number.isFinite(input.maxDriveMinutes) || input.maxDriveMinutes<5 || input.maxDriveMinutes>120))) throw new Error('Invalid family details');
  return { label:input.label.slice(0,60),area:input.area.slice(0,80),latitude:Math.round(input.latitude*100)/100,longitude:Math.round(input.longitude*100)/100,ages:input.ages,
    // A limit or budget the family never stated is stored as nothing, never as a number or a tier the server made up.
    maxDriveMinutes:input.maxDriveMinutes==null?null:input.maxDriveMinutes,budgetTier:['budget','moderate','premium'].includes(input.budgetTier)?input.budgetTier:null,pushchair:input.pushchair===true,
    required:Array.isArray(input.required)?input.required.filter(x=>['toilets','babyChanging','parking','pushchair'].includes(x)):[],
    // Only a short, fixed set of words about who the invite is for. Never free text: this reaches another person.
    relationship:['partner','family','friend'].includes(input.relationship)?input.relationship:undefined,
    routines:input.shareAvailability===true&&Array.isArray(input.routines)?input.routines.filter(r=>r.atHome===true&&/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)&&Number.isFinite(r.durationMinutes)&&r.durationMinutes>0&&r.durationMinutes<=240).slice(0,20).map((r,i)=>{const kind=r.kind==='feed'?'feed':'nap';return {id:`busy-${i}`,label:kind==='feed'?'Feed':'Nap',kind,time:r.time,durationMinutes:r.durationMinutes,atHome:true};}):[] };
}
/**
 * What THIS person currently shares in one connection, from their own stored snapshot. Their own data, returned to them only:
 *   none     no routines are shared
 *   legacy   routines were shared before routines carried a kind, so only "Home time" is known to the other family and
 *            plans treat it conservatively until it is updated
 *   current  routines are shared with their kind (nap or feed)
 */
function mySharingOf(snapshot) {
  const routines=Array.isArray(snapshot?.routines)?snapshot.routines:[];
  if(routines.length===0)return {routines:'none',routineCount:0};
  const legacy=routines.some(r=>!r||(r.kind!=='nap'&&r.kind!=='feed')||r.label==='Home time');
  return {routines:legacy?'legacy':'current',routineCount:routines.length};
}
async function previewInvitation(admin,code,res) {
  if(!/^[a-f0-9]{64}$/.test(code))return res.json({valid:false});
  try {
    const {data,error}=await admin.from('planning_connections').select('owner_snapshot,expires_at,accepted_at').eq('token_hash',createHash('sha256').update(code).digest('hex')).maybeSingle();
    if(error)throw error;
    if(!data||data.accepted_at||Date.parse(data.expires_at)<=Date.now())return res.json({valid:false});
    const snapshot=data.owner_snapshot||{};
    return res.json({valid:true,inviter:{label:typeof snapshot.label==='string'?snapshot.label.slice(0,60):'A FamilyPilot family',relationship:snapshot.relationship||null}});
  } catch {return res.status(503).json({error:'Invitations are temporarily unavailable. Please try again.'});}
}
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(refuseOnPreview(res))return;
  if(!['GET','POST','DELETE'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  const admin=getSupabaseAdmin();if(!admin)return res.status(503).json({error:'Family connections are not configured yet.'});
  // What an invitation link may show BEFORE anyone is signed in: whether it can still be used, and the label the inviter
  // chose for their family. Nothing else from the snapshot (no area, ages or preferences) leaves the database until the
  // invitation is accepted. The code is 256 random bits and is stored only as a hash, so holding a valid one is the proof.
  if(req.method==='GET'&&typeof req.query?.preview==='string')return previewInvitation(admin,req.query.preview,res);
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!token)return res.status(401).json({error:'Sign in to connect families.'});
  const {data:auth,error:authError}=await admin.auth.getUser(token);
  if(authError||!auth.user)return res.status(401).json({error:'Please sign in again.'});
  const userId=auth.user.id;
  try {
    if(req.method==='GET') {
      const {data,error}=await admin.from('planning_connections').select('id,owner_id,guest_id,owner_snapshot,guest_snapshot,accepted_at,expires_at').or(`owner_id.eq.${userId},guest_id.eq.${userId}`);
      if(error)throw error;
      return res.json({connections:(data||[]).map(row=>({id:row.id,pending:!row.accepted_at,expiresAt:row.expires_at,relationship:row.accepted_at?null:(row.owner_snapshot?.relationship||null),family:row.accepted_at?(row.owner_id===userId?row.guest_snapshot:row.owner_snapshot):null,
        // What I share with them, so an older connection can be updated in place rather than remade.
        mySharing:row.accepted_at?mySharingOf(row.owner_id===userId?row.owner_snapshot:row.guest_snapshot):null}))});
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
    /**
     * Update what I share in a connection I already have, in place. The row, its id and the other family's side are untouched:
     * nobody reconnects, nothing is re-invited, and the other family keeps its own snapshot. Only MY side of the row is
     * rewritten, through the same allow-list `safeSnapshot` applies to a new invitation, and only because I asked. The
     * relationship I set when the connection was made is kept (an update never widens or changes who this is for).
     */
    if(req.body?.action==='update') {
      if(!/^[0-9a-f-]{36}$/i.test(req.body?.id||''))return res.status(400).json({error:'Invalid connection'});
      const {data:row,error:findError}=await admin.from('planning_connections').select('id,owner_id,guest_id,owner_snapshot,guest_snapshot,accepted_at').eq('id',req.body.id).or(`owner_id.eq.${userId},guest_id.eq.${userId}`).maybeSingle();
      if(findError)throw findError;
      if(!row||!row.accepted_at)return res.status(404).json({error:'That connection is no longer there.'});
      const isOwner=row.owner_id===userId;
      const previous=isOwner?row.owner_snapshot:row.guest_snapshot;
      const next={...snapshot,relationship:previous?.relationship};
      if(next.relationship===undefined)delete next.relationship;
      const column=isOwner?'owner_snapshot':'guest_snapshot';
      const {error}=await admin.from('planning_connections').update({[column]:next}).eq('id',row.id);
      if(error)throw error;
      return res.json({ok:true,mySharing:mySharingOf(next)});
    }
    if(req.body?.action==='accept') {
      const code=req.body.code;if(typeof code!=='string'||!/^[a-f0-9]{64}$/.test(code))return res.status(400).json({error:'Check the invitation code.'});
      const {data,error}=await admin.from('planning_connections').update({guest_id:userId,guest_snapshot:snapshot,accepted_at:new Date().toISOString()})
        .eq('token_hash',createHash('sha256').update(code).digest('hex')).is('guest_id',null).neq('owner_id',userId).gt('expires_at',new Date().toISOString()).select('id,owner_snapshot').maybeSingle();
      if(error)throw error;if(!data)return res.status(400).json({error:'Invitation expired, already used, or belongs to you.'});
      return res.json({ok:true,id:data.id,inviter:{label:data.owner_snapshot?.label||'A FamilyPilot family'}});
    }
    return res.status(400).json({error:'Unknown action'});
  } catch(error) {return res.status(error.message==='Invalid family details'?400:503).json({error:error.message==='Invalid family details'?error.message:'Connections are temporarily unavailable. Please try again.'});}
};
module.exports.safeSnapshot=safeSnapshot;
module.exports.mySharingOf=mySharingOf;
