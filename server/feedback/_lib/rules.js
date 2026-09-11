const FIELDS = {
  babyChanging: {label:'Baby changing',claim:'familyFacilities.babyChanging',question:'Was a baby-changing facility available to use?',values:['yes','no','unavailable','did_not_check']},
  pushchair: {label:'Buggy access',claim:'pushchairSuitability',question:'Could you get around comfortably with your buggy?',values:['good','mixed','difficult','did_not_check']},
  toilets: {label:'Toilets',claim:'familyFacilities.toilets',question:'Were toilets available to use?',values:['yes','no','unavailable','did_not_check']},
  parking: {label:'Parking',claim:'familyFacilities.parking',question:'Was parking available at the venue?',values:['yes','no','unavailable','did_not_check']},
  cafe: {label:'Café',claim:'familyFacilities.cafe',question:'Was the venue’s café open during your visit?',values:['yes','no','unavailable','did_not_check']},
};
function validateReport(body,now=Date.now()) {
  if(!body || typeof body.venueId!=='string' || !/^fp-[a-z0-9_-]{1,230}$/i.test(body.venueId)) throw new Error('Choose a valid venue.');
  if(typeof body.visitDate!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.visitDate))throw new Error('Choose a valid visit date.');
  const day=Date.parse(body.visitDate+'T00:00:00Z');
  // Allow today's date in UTC+14; never a future local calendar day.
  if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==body.visitDate||day>now+14*3600000||now-day>30*86400000)throw new Error('Report a visit from the last 30 days.');
  if(body.attended!==true)throw new Error('Confirm that you visited before reporting.');
  const answers=body.answers;
  if(!answers||Array.isArray(answers)||typeof answers!=='object'||Object.keys(answers).length<1||Object.keys(answers).length>3)throw new Error('Answer up to three questions.');
  for(const [key,value] of Object.entries(answers))if(!FIELDS[key]?.values.includes(value))throw new Error('Choose one of the listed answers.');
  if(Object.values(answers).every(v=>v==='did_not_check'))throw new Error('Choose at least one thing you checked, or skip this visit.');
  return {venueId:body.venueId,visitDate:body.visitDate,answers};
}
function summarizeReports(claims,reports,now=Date.now()) {
  const fields={};
  for(const [key,definition] of Object.entries(FIELDS)) {
    const claim=claims.find(c=>c.fieldKey===definition.claim);
    const observations=reports.filter(r=>r.status==='active'&&r.answers[key]&&r.answers[key]!=='did_not_check'&&now-Date.parse(r.visit_date+'T00:00:00Z')<=90*86400000);
    const latestByUser=new Map();
    for(const r of observations.sort((a,b)=>b.visit_date.localeCompare(a.visit_date)||b.created_at.localeCompare(a.created_at)))if(!latestByUser.has(r.user_id))latestByUser.set(r.user_id,r);
    const recent=[...latestByUser.values()];
    // A later source check can resolve a discrepancy; an older source cannot dismiss a new report.
    const afterSource=recent.filter(r=>!claim||r.visit_date>=String(claim.checkedAt).slice(0,10));
    const expected=claim?.valueJson==='excellent'&&key==='pushchair'?'good':claim?.valueJson;
    const conflicting=afterSource.some(r=>r.answers[key]==='unavailable'||(expected!==undefined&&r.answers[key]!==expected));
    const values=new Set(afterSource.map(r=>r.answers[key]));
    const disputed=conflicting||values.size>1;
    // Observations are displayed separately. They never manufacture official claims.
    fields[key]={label:definition.label,question:definition.question,status:disputed?'needs_recheck':claim?(claim.sourceUrl?'source_checked':'editor_checked'):recent.length?'parent_reported':'unknown',
      value:disputed?'unknown':claim?.valueJson??'unknown',sourceUrl:claim?.sourceUrl??null,checkedAt:claim?.checkedAt??null,
      reportCount:recent.length,lastReportedAt:recent[0]?.visit_date??null,
      observations:[...new Set(recent.map(r=>r.answers[key]))]};
  }
  return fields;
}
function selectQuestions(fields) {
  const order={needs_recheck:0,unknown:1,parent_reported:2,source_checked:3,editor_checked:3};
  return Object.keys(FIELDS).sort((a,b)=>(order[fields[a]?.status]??1)-(order[fields[b]?.status]??1)||String(fields[a]?.checkedAt||'').localeCompare(String(fields[b]?.checkedAt||''))).slice(0,3);
}
module.exports={FIELDS,validateReport,summarizeReports,selectQuestions};
