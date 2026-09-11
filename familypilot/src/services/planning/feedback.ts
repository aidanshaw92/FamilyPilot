import { supabase } from '@/src/services/supabase/client';
import { planningApiUrl } from './recommendations';
import { SavedPlan } from '@/src/stores/planning-store';
export const visitQuestions = {
 babyChanging:{label:'Baby changing',question:'Was a baby-changing facility available to use?',values:['yes','no','unavailable','did_not_check']},
 pushchair:{label:'Buggy access',question:'Could you get around comfortably with your buggy?',values:['good','mixed','difficult','did_not_check']},
 toilets:{label:'Toilets',question:'Were toilets available to use?',values:['yes','no','unavailable','did_not_check']},
 parking:{label:'Parking',question:'Was parking available at the venue?',values:['yes','no','unavailable','did_not_check']},
 cafe:{label:'Café',question:'Was the venue’s café open during your visit?',values:['yes','no','unavailable','did_not_check']},
} as const;
export type VisitField=keyof typeof visitQuestions;
export type VenueTrustField={label:string;question:string;status:'needs_recheck'|'source_checked'|'editor_checked'|'parent_reported'|'unknown';value:string;sourceUrl:string|null;checkedAt:string|null;reportCount:number;lastReportedAt:string|null;observations:string[]};
export type VenueTrust={fields:Record<VisitField,VenueTrustField>;questions:VisitField[]};
export async function feedbackApi(path='',method='GET',body?:unknown){
 const headers:Record<string,string>={'Content-Type':'application/json'};
 if(method!=='GET'||!path){
  if(!supabase)throw new Error('Sign-in is not configured yet.');
  const {data}=await supabase.auth.getSession();if(!data.session)throw new Error('Sign in under Plans → Families & routines to share feedback.');
  headers.Authorization=`Bearer ${data.session.access_token}`;
 }
 const response=await fetch(planningApiUrl('feedback')+path,{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Feedback unavailable. Please retry.');return data;
}
export function feedbackDue(plan:SavedPlan,now=Date.now()) {
 if(plan.feedback?.status==='submitted'||plan.feedback?.status==='skipped')return false;
 if(plan.feedback?.until&&Date.parse(plan.feedback.until)>now)return false;
 const finish=new Date(`${plan.date}T00:00:00`);finish.setMinutes(plan.plan.end+60);
 return Number.isFinite(finish.getTime())&&now>=finish.getTime()&&now-finish.getTime()<30*86400000;
}
