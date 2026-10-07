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
/**
 * `venueFeedback` for many venues at once: id -> the same summary `venueFeedback(id, claims)` returns, from paged
 * set-based reads instead of two queries per venue. Each venue keeps its own rules exactly: its 500 newest reports in
 * the last 90 days, and a household map built only from that venue's first 200 reporters.
 * `claimsById` maps each venue to the claims `venueFeedback` would have been given.
 */
async function venueFeedbackBatch(claimsById) {
 const ids=[...claimsById.keys()];
 const out=new Map();
 if(ids.length===0)return out;
 const admin=getSupabaseAdmin();
 if(!admin){for(const id of ids)out.set(id,summarizeReports(claimsById.get(id),[]));return out;}
 const {readAllRows}=require('../../enrichment/_lib/enrichment-store');
 const since=new Date(Date.now()-90*86400000).toISOString().slice(0,10);
 const chunks=[];for(let i=0;i<ids.length;i+=100)chunks.push(ids.slice(i,i+100));
 const rowsById=new Map(ids.map(id=>[id,[]]));
 // Every active report in the window for the chunk, page by page (PostgREST stops at 1000 rows without saying so), newest
 // visit first; each venue then keeps its own 500 newest, as venueFeedback does.
 await Promise.all(chunks.map(async chunk=>{
  let rows;
  try{rows=await readAllRows(()=>admin.from('venue_visit_reports').select('id,familypilot_place_id,user_id,visit_date,answers,status,created_at').in('familypilot_place_id',chunk).eq('status','active').gte('visit_date',since).order('visit_date',{ascending:false}).order('id',{ascending:true}));}
  catch{throw new Error('Visit reports are temporarily unavailable.');}
  for(const row of rows){const {familypilot_place_id:id,id:_rowId,...rest}=row;rowsById.get(id)?.push(rest);}
 }));
 // Each venue's reporters, capped as householdsOf caps them; one connections lookup for all of them together.
 const reportersById=new Map();
 for(const id of ids){const rows=(rowsById.get(id)||[]).slice(0,500);rowsById.set(id,rows);reportersById.set(id,[...new Set(rows.map(r=>r.user_id))].slice(0,200));}
 const everyone=[...new Set([...reportersById.values()].filter(list=>list.length>=2).flat())];
 let partners=[];
 if(everyone.length>=2){
  const parts=[];for(let i=0;i<everyone.length;i+=150)parts.push(everyone.slice(i,i+150));
  const pairs=await Promise.all(parts.flatMap(a=>parts.map(async b=>{
   // householdsOf treats a failed lookup as "no partners"; so does this.
   try{return await readAllRows(()=>admin.from('planning_connections').select('id,owner_id,guest_id,owner_snapshot').not('guest_id','is',null).in('owner_id',a).in('guest_id',b).order('id',{ascending:true}));}
   catch{return [];}
  })));
  partners=pairs.flat();
 }
 for(const id of ids){
  const reporters=reportersById.get(id);
  const households=new Map();
  if(reporters.length>=2){
   const set=new Set(reporters);
   for(const row of partners){
    if(!set.has(row.owner_id)||!set.has(row.guest_id))continue;
    if(row.owner_snapshot?.relationship!=='partner')continue;
    const key=[row.owner_id,row.guest_id].sort()[0];
    households.set(row.owner_id,households.get(row.owner_id)||key);households.set(row.guest_id,households.get(row.guest_id)||key);
   }
  }
  out.set(id,summarizeReports(claimsById.get(id),rowsById.get(id),Date.now(),households));
 }
 return out;
}
module.exports={venueFeedback,venueFeedbackBatch,householdsOf};
