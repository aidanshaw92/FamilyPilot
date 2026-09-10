const {getSupabaseAdmin}=require('../../server/enrichment/_lib/supabase-admin');
const {getActiveClaims}=require('../../server/enrichment/_lib/claims-store');
const {resolvePrimaryPlaceId}=require('../../server/places/lib/canonical-venues');
const {venueFeedback}=require('../../server/feedback/_lib/store');
const {validateReport,selectQuestions}=require('../../server/feedback/_lib/rules');
module.exports=async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST','DELETE'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 try {
  const admin=getSupabaseAdmin();if(!admin)return res.status(503).json({error:'Visit feedback is not configured yet.'});
  if(req.method==='GET'&&req.query.venueId){
   if(typeof req.query.venueId!=='string'||!/^fp-[a-z0-9_-]{1,230}$/i.test(req.query.venueId))return res.status(400).json({error:'Invalid venue'});
   const id=await resolvePrimaryPlaceId(req.query.venueId);
   const fields=await venueFeedback(id,await getActiveClaims(id));
   return res.json({fields,questions:selectQuestions(fields)});
  }
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!token)return res.status(401).json({error:'Sign in under Families & routines to share visit feedback.'});
  const {data:auth,error:authError}=await admin.auth.getUser(token);
  if(authError||!auth.user||auth.user.is_anonymous)return res.status(401).json({error:'Please sign in to share feedback.'});
  if(req.method==='GET'){
   const {data,error}=await admin.from('venue_visit_reports').select('id,familypilot_place_id,visit_date,answers').eq('user_id',auth.user.id).order('created_at',{ascending:false}).limit(100);
   if(error)throw error;return res.json({reports:data||[]});
  }
  if(req.method==='DELETE'){
   if(typeof req.body?.id!=='string'||!/^[a-f0-9-]{36}$/i.test(req.body.id))return res.status(400).json({error:'Invalid report'});
   const {error}=await admin.from('venue_visit_reports').delete().eq('id',req.body.id).eq('user_id',auth.user.id);if(error)throw error;
   return res.json({ok:true});
  }
  let input;try{input=validateReport(req.body);}catch(e){return res.status(400).json({error:e.message});}
  input.venueId=await resolvePrimaryPlaceId(input.venueId);
  const {data,error}=await admin.rpc('submit_venue_visit_report',{p_user_id:auth.user.id,p_venue_id:input.venueId,p_visit_date:input.visitDate,p_answers:input.answers});
  if(error){if(error.message.includes('rate limit'))return res.status(429).json({error:'Please wait a minute before another report. There is also a limit of ten reports per day.'});if(error.message.includes('Unknown venue'))return res.status(400).json({error:'Open this venue in the app before reporting.'});throw error;}
  return res.json({ok:true,id:data});
 }catch{return res.status(503).json({error:'Feedback is temporarily unavailable. Your answers have not been submitted; please retry.'});}
};
