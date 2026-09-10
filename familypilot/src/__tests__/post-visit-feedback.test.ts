import {describe,it,expect,vi} from 'vitest';
vi.mock('@/src/services/supabase/client',()=>({supabase:null}));
vi.mock('@/src/services/planning/recommendations',()=>({planningApiUrl:()=>''}));
import {feedbackDue} from '@/src/services/planning/feedback';
const {validateReport,summarizeReports,selectQuestions}=require('../../../api/feedback/_lib/rules');
const {isClaimActive}=require('../../../api/enrichment/_lib/claims-store');
const now=Date.parse('2026-09-10T12:00:00Z');
const valid={venueId:'fp-google-test',visitDate:'2026-09-09',attended:true,answers:{babyChanging:'yes'}};
const claim={fieldKey:'familyFacilities.babyChanging',valueJson:'yes',checkedAt:'2026-09-08',sourceUrl:'https://example.org'};
const report=(answer:string,user='u1',day='2026-09-09')=>({user_id:user,visit_date:day,answers:{babyChanging:answer},status:'active',created_at:`${day}T15:00:00Z`});
describe('post-visit accuracy loop',()=>{
 it('requires first-hand attendance and validates dates, answers and question count',()=>{
  expect(validateReport(valid,now)).toEqual({venueId:valid.venueId,visitDate:valid.visitDate,answers:valid.answers});
  for(const change of [{attended:false},{visitDate:'2026-02-31'},{visitDate:'2026-09-15'},{visitDate:'2026-07-01'},{answers:{babyChanging:'probably'}},{answers:{babyChanging:'did_not_check'}},{answers:{babyChanging:'yes',toilets:'yes',parking:'yes',cafe:'yes'}}])expect(()=>validateReport({...valid,...change},now)).toThrow();
 });
 it('asks after the outing finishes and respects skip, snooze and completion',()=>{
  const p:any={date:'2026-09-09',plan:{end:720}};const due=new Date('2026-09-09T13:00:00').getTime();
  expect(feedbackDue(p,due-1)).toBe(false);expect(feedbackDue(p,due)).toBe(true);
  expect(feedbackDue({...p,feedback:{status:'skipped'}},due)).toBe(false);
  expect(feedbackDue({...p,feedback:{status:'submitted'}},due)).toBe(false);
  expect(feedbackDue({...p,feedback:{status:'later',until:new Date(due+1000).toISOString()}},due)).toBe(false);
  expect(feedbackDue(p,due+31*86400000)).toBe(false);
 });
 it('downgrades a disputed must-have without overwriting its official claim',()=>{
  const result=summarizeReports([claim],[report('no')],now);
  expect(result.babyChanging.status).toBe('needs_recheck');expect(result.babyChanging.value).toBe('unknown');expect(claim.valueJson).toBe('yes');
  expect(selectQuestions(result)[0]).toBe('babyChanging');
 });
 it('keeps temporary closures separate from permanent absence and ignores unchecked answers',()=>{
  expect(summarizeReports([claim],[report('unavailable')],now).babyChanging.status).toBe('needs_recheck');
  expect(summarizeReports([claim],[report('did_not_check')],now).babyChanging.reportCount).toBe(0);
 });
 it('counts an account once, ignores old reports and permits a later source recheck',()=>{
  const rows=[report('yes'),report('yes','u1','2026-09-08'),report('no','u2','2026-01-01')];
  expect(summarizeReports([claim],rows,now).babyChanging.reportCount).toBe(1);
  expect(summarizeReports([{...claim,checkedAt:'2026-09-10'}],[report('no')],now).babyChanging.status).toBe('source_checked');
 });
 it('never turns parent observations into an official positive claim',()=>{expect(summarizeReports([],[report('yes')],now).babyChanging).toMatchObject({status:'parent_reported',value:'unknown'});});
 it('expires legacy undated approvals and excludes old confidence-only auto approvals',()=>{
  expect(isClaimActive({status:'active',approvedBy:'ai_auto_approved',checkedAt:new Date().toISOString(),fieldKey:'familyFacilities.toilets'})).toBe(false);
  expect(isClaimActive({status:'active',approvedBy:'editor',checkedAt:'2020-01-01',fieldKey:'familyFacilities.toilets'})).toBe(false);
 });
});
