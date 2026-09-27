/** Only server-extracted, recent official facts can be published automatically. */
const { extractEvidenceFromText, buildEvidenceBundle } = require('./evidence-extractor');
const { listEvidenceForVenue } = require('./evidence-store');
// One taxonomy, shared with the age-policy gate. See source-types.js for why council_page is out.
const { OFFICIAL_SOURCE_TYPES: SOURCE_TYPES } = require('./source-types');
const { isEligibleScope } = require('./source-identity');
const FIELD_MAP = {
  toilets:'familyFacilities.toilets', babyChanging:'familyFacilities.babyChanging',
  parking:'familyFacilities.parking', freeParking:'familyFacilities.freeParking', cafe:'familyFacilities.cafe',
  playground:'familyFacilities.playground', wheelchairAccessible:'accessibility.wheelchairAccessible',
  accessibleToilet:'accessibility.accessibleToilet', sensoryFriendlySessions:'sendInfo.sensoryFriendlySessions',
  pushchairSuitability:'pushchairSuitability', environment:'environment',
};
function expiryDate(fieldKey, checkedAt) {
  // agePolicy is short-lived deliberately: it is the only fact that removes a venue, so it must
  // be re-read often. Mirrored by SHORT_LIVED in claim-freshness.js -- change both together.
  const days = /Facilities|accessibility|pushchair|sendInfo|agePolicy/.test(fieldKey) ? 30 : 90;
  const date = new Date(checkedAt);
  if (!Number.isFinite(date.getTime())) return '1970-01-01';
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
/**
 * Whether one extracted fact may be published as a claim for this venue.
 *
 * Until now this gated field, conflict, confidence, source TYPE, excerpt length, recency and URL
 * protocol -- and never once asked whether the page was about this venue. It could not: nothing
 * recorded the answer. `subjectScope`, written when the page was fetched, is that record.
 *
 * `enforceSubjectScope` defaults to true, so no NEW claim can be built on evidence whose
 * relationship to the venue was never established. It is passed false from exactly one place:
 * reconciliation, which DISPUTES existing claims. Enforcing there would turn a deploy into an
 * unreviewed production repair -- `familypilot-automatic-enrichment` runs every minute, so
 * hundreds of live claims would be disputed within the hour, before anyone had approved it.
 * Repairing what is already published is Phase 6 and belongs behind its own gate.
 */
function eligibleFact(fact, bundle, now=Date.now(), { enforceSubjectScope = true } = {}) {
  if (!FIELD_MAP[fact.field] || fact.evidenceStatus==='conflict' || fact.confidence!=='high') return false;
  if (!SOURCE_TYPES.has(fact.sourceType) || typeof fact.evidenceText!=='string' || fact.evidenceText.length<15) return false;
  const age = now-Date.parse(fact.retrievedAt);
  if (!Number.isFinite(age) || age<0 || age>14*86400000) return false;
  try { if (!['http:','https:'].includes(new URL(fact.sourceUrl).protocol)) return false; } catch {return false;}
  return (bundle.sources||[]).some(source=>source.url===fact.sourceUrl
    && SOURCE_TYPES.has(source.sourceType)
    && ['ok','cached','fetched_truncated'].includes(source.fetchStatus)
    // Unknown is preferable to confidently wrong: a null scope is a row stored before provenance
    // was recorded, and it fails closed exactly like an unestablished one.
    && (!enforceSubjectScope || isEligibleScope(source.subjectScope))
    && source.facts?.some(f=>f.field===fact.field && f.value===fact.value && f.evidenceText===fact.evidenceText));
}
/**
 * `options.enforceSubjectScope` is threaded straight through to `eligibleFact`; see there for why
 * reconciliation is the one caller that turns it off.
 */
function reviewEvidence(bundle, options = {}) {
  const payload={}; const draft={familyFacilities:{},accessibility:{},sendInfo:{}};
  const withheld=[];
  let count=0;
  for(const fact of bundle?.facts||[]) {
    if(!eligibleFact(fact,bundle,Date.now(),options)){
      // Recorded, not discarded: an audit has to be able to say what was withheld and why.
      const source=(bundle.sources||[]).find(s=>s.url===fact.sourceUrl);
      if(FIELD_MAP[fact.field]&&source&&!isEligibleScope(source.subjectScope)){
        withheld.push({field:FIELD_MAP[fact.field],sourceUrl:fact.sourceUrl,subjectScope:source.subjectScope??null});
      }
      continue;
    }
    const key=FIELD_MAP[fact.field];
    const allowed=key==='pushchairSuitability'?['excellent','good','mixed','difficult']:key==='environment'?['indoor','outdoor','mixed']:['yes','no'];
    if(!allowed.includes(fact.value))continue;
    const field={value:fact.value,confidence:'high',sourceUrl:fact.sourceUrl,evidence:fact.evidenceText,sourceType:fact.sourceType,retrievedAt:fact.retrievedAt};
    const parts=key.split('.');
    if(parts.length===2){(payload[parts[0]]??={})[parts[1]]=fact.value;draft[parts[0]][parts[1]]=field;}
    else {payload[key]=fact.value;draft[key]=field;}
    count++;
  }
  return {payload,draft,fieldCount:count,eligible:count>0,withheld,
    reason:count?null:(withheld.length?'withheld_source_identity_unestablished':'no_recent_source_supported_fields')};
}
async function verifiedBundleForVenue(id) {
  const records=await listEvidenceForVenue(id);
  const latest=new Map();
  for(const record of records)if(!latest.has(record.sourceUrl))latest.set(record.sourceUrl,record);
  const sources=[...latest.values()].filter(r=>SOURCE_TYPES.has(r.sourceType)&&['ok','cached','fetched_truncated'].includes(r.fetchStatus)&&r.extractedText).map(r=>({url:r.sourceUrl,sourceType:r.sourceType,retrievedAt:r.retrievedAt,fetchStatus:r.fetchStatus,
    // Carried from the stored row, never recomputed here: re-deriving provenance downstream is
    // precisely the mistake that let a crawl's assumption become a finding.
    subjectScope:r.subjectScope??null,subjectScopeReason:r.subjectScopeReason??null,
    // Re-extract from fetched text, never trust cached/model-generated facts.
    facts:extractEvidenceFromText(r.extractedText,{url:r.sourceUrl,sourceType:r.sourceType,retrievedAt:r.retrievedAt})}));
  return buildEvidenceBundle(id,sources,'official_website');
}
module.exports={expiryDate,reviewEvidence,eligibleFact,verifiedBundleForVenue,FIELD_MAP,SOURCE_TYPES};
