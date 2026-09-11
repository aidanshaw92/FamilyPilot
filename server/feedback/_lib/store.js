const {getSupabaseAdmin}=require('../../enrichment/_lib/supabase-admin');
const {summarizeReports}=require('./rules');
async function venueFeedback(id,claims) {
 const admin=getSupabaseAdmin();
 if(!admin)return summarizeReports(claims,[]);
 const {data,error}=await admin.from('venue_visit_reports').select('user_id,visit_date,answers,status,created_at').eq('familypilot_place_id',id).eq('status','active').gte('visit_date',new Date(Date.now()-90*86400000).toISOString().slice(0,10)).order('visit_date',{ascending:false}).limit(500);
 if(error)throw new Error('Visit reports are temporarily unavailable.');
 return summarizeReports(claims,data||[]);
}
module.exports={venueFeedback};
