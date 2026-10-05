const {getSupabaseAdmin}=require('../../enrichment/_lib/supabase-admin');
const {summarizeReports}=require('./rules');
/**
 * Accounts linked as partners are one household, so they count as one witness. Only an ACCEPTED connection labelled
 * "partner" collapses; friends and wider family are separate households. Returns user_id -> household key.
 */
async function householdsOf(admin,userIds) {
 const households=new Map();
 const ids=[...new Set(userIds)].slice(0,200);
 if(ids.length<2)return households;
 const {data,error}=await admin.from('planning_connections').select('owner_id,guest_id,owner_snapshot').not('guest_id','is',null).in('owner_id',ids).in('guest_id',ids);
 if(error||!data)return households;
 for(const row of data){
  if(row.owner_snapshot?.relationship!=='partner')continue;
  const key=[row.owner_id,row.guest_id].sort()[0];
  households.set(row.owner_id,households.get(row.owner_id)||key);households.set(row.guest_id,households.get(row.guest_id)||key);
 }
 return households;
}
async function venueFeedback(id,claims) {
 const admin=getSupabaseAdmin();
 if(!admin)return summarizeReports(claims,[]);
 const {data,error}=await admin.from('venue_visit_reports').select('user_id,visit_date,answers,status,created_at').eq('familypilot_place_id',id).eq('status','active').gte('visit_date',new Date(Date.now()-90*86400000).toISOString().slice(0,10)).order('visit_date',{ascending:false}).limit(500);
 if(error)throw new Error('Visit reports are temporarily unavailable.');
 const rows=data||[];
 return summarizeReports(claims,rows,Date.now(),await householdsOf(admin,rows.map(r=>r.user_id)));
}
module.exports={venueFeedback,householdsOf};
