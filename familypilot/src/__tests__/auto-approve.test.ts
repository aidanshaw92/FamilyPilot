import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const {extractEvidenceFromText,buildEvidenceBundle}=require('../../../server/enrichment/_lib/evidence-extractor');
const {buildAutoApprovePayload,tryAutoApproveDraft}=require('../../../server/enrichment/_lib/auto-approve');
const {getActiveClaims}=require('../../../server/enrichment/_lib/claims-store');
const {saveEvidenceRecord}=require('../../../server/enrichment/_lib/evidence-store');
const id='fp-google-auto-approve';
const meta={url:'https://example.org/visit',sourceType:'official_website',retrievedAt:'2026-09-09T09:00:00Z'};
const page='Toilets are available in the visitor centre. Baby changing facilities are available. Free on-site parking is available for visitors.';
function bundle(text=page){const facts=extractEvidenceFromText(text,meta);return buildEvidenceBundle(id,[{...meta,fetchStatus:'ok',facts}],'official_website');}
let env:NodeJS.ProcessEnv;
beforeEach(()=>{
 env={...process.env};delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.ENRICHMENT_AUTO_APPROVE='true';vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-09-10T10:00:00Z'));
 fs.mkdirSync('.data',{recursive:true});
 for(const [file,data] of Object.entries({'venue-claims.json':{claims:[]},'venue-source-evidence.json':{records:[]},'enrichment-store.json':{places:{},metadata:{[id]:{enrichment_status:'ai_draft'}}},'enrichment-drafts.json':{drafts:[{id:'draft-1',familypilot_place_id:id,status:'pending_review',draft_json:{recommendedAge:{min:0,max:17,confidence:'high'},suggestedVisitDuration:120},model:'test',source_context:{evidenceBundle:bundle()}}]}}))fs.writeFileSync(path.join('.data',file),JSON.stringify(data));
});
afterEach(()=>{process.env=env;vi.useRealTimers();});
describe('source evidence automatic publication',()=>{
 it('never publishes AI confidence, guessed age suitability, or visit length',()=>{
  const review=buildAutoApprovePayload({recommendedAge:{min:0,max:17,confidence:'high'},familyFacilities:{babyChanging:{value:'yes',confidence:'high',evidenceBacked:true}}},{facts:[]});
  expect(review.eligible).toBe(false);expect(review.fieldCount).toBe(0);
 });
 it('publishes explicit source facts independently of missing ages',()=>{
  const review=buildAutoApprovePayload({},bundle());expect(review.eligible).toBe(true);
  expect(review.payload.familyFacilities.babyChanging).toBe('yes');expect(review.payload.minRecommendedAge).toBeUndefined();expect(review.payload.visitDurationMinutes).toBeUndefined();
 });
 it('withholds contradictory fields but retains unrelated supported facts',()=>{
  const review=buildAutoApprovePayload({},bundle(page+' No baby changing facilities are provided.'));
  expect(review.payload.familyFacilities.babyChanging).toBeUndefined();expect(review.payload.familyFacilities.toilets).toBe('yes');
 });
 it('rejects unsupported URLs and future or stale source timestamps',()=>{
  for(const retrievedAt of ['2026-01-01','2027-01-01','bad-date']){const b=bundle();b.facts=b.facts.map((f:any)=>({...f,retrievedAt}));expect(buildAutoApprovePayload({},b).eligible).toBe(false);}
  const b=bundle();b.sources=[];expect(buildAutoApprovePayload({},b).eligible).toBe(false);
 });
 it('does not infer baby changing from a closed facility, proposed facility, or generic parent room',()=>{
  for(const text of ['Baby changing facilities are closed today.','Baby changing facilities will open soon.','Parent and baby facilities are available.'])expect(buildAutoApprovePayload({},bundle(text)).payload.familyFacilities?.babyChanging).toBeUndefined();
 });
 it('checks fetched source text again and stores expiry and honest provenance',async()=>{
  await saveEvidenceRecord({familypilotPlaceId:id,sourceUrl:meta.url,sourceType:meta.sourceType,retrievedAt:meta.retrievedAt,extractedText:page,extractedEvidence:[],fetchStatus:'ok'});
  const result=await tryAutoApproveDraft(id);expect(result.approved).toBe(true);
  const claims=await getActiveClaims(id);expect(claims.length).toBeGreaterThan(0);
  expect(claims.every((c:any)=>c.approvedBy==='source_evidence_auto_v2'&&c.sourceEvidenceId&&c.validUntil==='2026-10-09')).toBe(true);
  expect(claims.some((c:any)=>c.fieldKey==='minRecommendedAge')).toBe(false);
  const source=JSON.parse(result.metadata.enrichmentProvenance.sourceReference);expect(source.humanReviewed).toBe(false);
 });
 it('withdraws an automatic claim when a fresh source no longer supports it',async()=>{
  await saveEvidenceRecord({familypilotPlaceId:id,sourceUrl:meta.url,sourceType:meta.sourceType,retrievedAt:meta.retrievedAt,extractedText:page,fetchStatus:'ok'});
  await tryAutoApproveDraft(id);
  const file=path.join('.data','enrichment-drafts.json');const records=JSON.parse(fs.readFileSync(file,'utf8'));records.drafts[0].status='pending_review';fs.writeFileSync(file,JSON.stringify(records));
  await saveEvidenceRecord({familypilotPlaceId:id,sourceUrl:meta.url,sourceType:meta.sourceType,retrievedAt:'2026-09-10T09:00:00Z',extractedText:'Toilets are available in the visitor centre.',fetchStatus:'ok'});
  await tryAutoApproveDraft(id);
  expect((await getActiveClaims(id)).some((c:any)=>c.fieldKey==='familyFacilities.babyChanging')).toBe(false);
 });
 it('ignores a fabricated draft evidence bundle when fetched text is absent',async()=>{expect((await tryAutoApproveDraft(id)).approved).toBe(false);});
 it('respects the automatic publication off switch',async()=>{process.env.ENRICHMENT_AUTO_APPROVE='false';expect((await tryAutoApproveDraft(id)).reason).toBe('auto_approve_disabled');});
});
