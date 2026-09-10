/** Only server-extracted, recent official facts can be published automatically. */
const { extractEvidenceFromText, buildEvidenceBundle } = require('./evidence-extractor');
const { listEvidenceForVenue } = require('./evidence-store');
const SOURCE_TYPES = new Set(['official_website','accessibility_page','visitor_info','faq_page','family_page']);
const FIELD_MAP = {
  toilets:'familyFacilities.toilets', babyChanging:'familyFacilities.babyChanging',
  parking:'familyFacilities.parking', freeParking:'familyFacilities.freeParking', cafe:'familyFacilities.cafe',
  playground:'familyFacilities.playground', wheelchairAccessible:'accessibility.wheelchairAccessible',
  accessibleToilet:'accessibility.accessibleToilet', sensoryFriendlySessions:'sendInfo.sensoryFriendlySessions',
  pushchairSuitability:'pushchairSuitability', environment:'environment',
};
function expiryDate(fieldKey, checkedAt) {
  const days = /Facilities|accessibility|pushchair|sendInfo/.test(fieldKey) ? 30 : 90;
  const date = new Date(checkedAt);
  if (!Number.isFinite(date.getTime())) return '1970-01-01';
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
function eligibleFact(fact, bundle, now=Date.now()) {
  if (!FIELD_MAP[fact.field] || fact.evidenceStatus==='conflict' || fact.confidence!=='high') return false;
  if (!SOURCE_TYPES.has(fact.sourceType) || typeof fact.evidenceText!=='string' || fact.evidenceText.length<15) return false;
  const age = now-Date.parse(fact.retrievedAt);
  if (!Number.isFinite(age) || age<0 || age>14*86400000) return false;
  try { if (!['http:','https:'].includes(new URL(fact.sourceUrl).protocol)) return false; } catch {return false;}
  return (bundle.sources||[]).some(source=>source.url===fact.sourceUrl && SOURCE_TYPES.has(source.sourceType) && ['ok','cached','fetched_truncated'].includes(source.fetchStatus) && source.facts?.some(f=>f.field===fact.field && f.value===fact.value && f.evidenceText===fact.evidenceText));
}
function reviewEvidence(bundle) {
  const payload={}; const draft={familyFacilities:{},accessibility:{},sendInfo:{}};
  let count=0;
  for(const fact of bundle?.facts||[]) {
    if(!eligibleFact(fact,bundle))continue;
    const key=FIELD_MAP[fact.field];
    const allowed=key==='pushchairSuitability'?['excellent','good','mixed','difficult']:key==='environment'?['indoor','outdoor','mixed']:['yes','no'];
    if(!allowed.includes(fact.value))continue;
    const field={value:fact.value,confidence:'high',sourceUrl:fact.sourceUrl,evidence:fact.evidenceText,sourceType:fact.sourceType,retrievedAt:fact.retrievedAt};
    const parts=key.split('.');
    if(parts.length===2){(payload[parts[0]]??={})[parts[1]]=fact.value;draft[parts[0]][parts[1]]=field;}
    else {payload[key]=fact.value;draft[key]=field;}
    count++;
  }
  return {payload,draft,fieldCount:count,eligible:count>0,reason:count?null:'no_recent_source_supported_fields'};
}
async function verifiedBundleForVenue(id) {
  const records=await listEvidenceForVenue(id);
  const latest=new Map();
  for(const record of records)if(!latest.has(record.sourceUrl))latest.set(record.sourceUrl,record);
  const sources=[...latest.values()].filter(r=>SOURCE_TYPES.has(r.sourceType)&&['ok','cached','fetched_truncated'].includes(r.fetchStatus)&&r.extractedText).map(r=>({url:r.sourceUrl,sourceType:r.sourceType,retrievedAt:r.retrievedAt,fetchStatus:r.fetchStatus,
    // Re-extract from fetched text, never trust cached/model-generated facts.
    facts:extractEvidenceFromText(r.extractedText,{url:r.sourceUrl,sourceType:r.sourceType,retrievedAt:r.retrievedAt})}));
  return buildEvidenceBundle(id,sources,'official_website');
}
module.exports={expiryDate,reviewEvidence,eligibleFact,verifiedBundleForVenue,FIELD_MAP};
