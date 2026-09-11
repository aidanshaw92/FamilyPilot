import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Text } from '@/src/components/ui';
import { Chip } from '@/src/components/ui/Chip';
import { feedbackApi, feedbackDue, visitQuestions, VisitField, VenueTrust } from '@/src/services/planning/feedback';
import { localDate, usePlanningStore } from '@/src/stores/planning-store';
import { Field, formStyles as s } from './FamilyEditor';
const labels:Record<string,string>={yes:'Yes',no:'No',unavailable:'Closed or unusable',did_not_check:'Didn’t check',good:'Yes, comfortably',mixed:'Only in some areas',difficult:'No, difficult'};
export function VisitFeedbackForm({venueId,date,onDone,onCancel}:{venueId:string;date:string;onDone:(id:string)=>void;onCancel:()=>void}) {
 const [questions,setQuestions]=useState<VisitField[]>(['babyChanging','pushchair','toilets']);
 const [answers,setAnswers]=useState<Record<string,string>>({});const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 const queryClient=useQueryClient();
 useEffect(()=>{let live=true;void feedbackApi(`?venueId=${encodeURIComponent(venueId)}`).then((data:VenueTrust)=>{if(live)setQuestions(data.questions);}).catch(()=>{});return()=>{live=false;};},[venueId]);
 async function submit(){setBusy(true);setMessage('');try{
  const selected=Object.fromEntries(questions.filter(k=>answers[k]).map(k=>[k,answers[k]]));
  const result=await feedbackApi('','POST',{venueId,visitDate:date,attended:true,answers:selected});
  await queryClient.invalidateQueries();onDone(result.id);
 }catch(e){setMessage(e instanceof Error?e.message:'Could not submit. Please retry.');}finally{setBusy(false);}}
 return <View style={s.panel}><Text variant="heading3">What did you find?</Text><Text variant="bodySmall">Only report what you checked on {date}. We share a summary of observations, never your name, family details or routines.</Text>
 {questions.map(key=><View key={key} style={{gap:8}}><Text>{visitQuestions[key].question}</Text><View style={s.row}>{visitQuestions[key].values.map(value=><Chip key={value} label={labels[value]} active={answers[key]===value} onPress={()=>setAnswers(a=>({...a,[key]:value}))}/>)}</View></View>)}
 <Text variant="bodySmall">“No” means the facility wasn’t there. Use “Closed or unusable” for a temporary problem. You can remove your report under Families & routines.</Text>
 <Button label={busy?'Sharing…':'Confirm I visited & share observations'} disabled={busy||!questions.some(k=>answers[k]&&answers[k]!=='did_not_check')} onPress={()=>void submit()}/>
 <Button label="Cancel" variant="ghost" disabled={busy} onPress={onCancel}/>{message?<Text accessibilityRole="alert">{message}</Text>:null}
 </View>;
}
export function PostVisitInbox(){
 const state=usePlanningStore();const [now,setNow]=useState(Date.now());const [attending,setAttending]=useState<string|null>(null);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
 const due=state.hydrated?state.saved.filter(p=>feedbackDue(p,now)).sort((a,b)=>b.date.localeCompare(a.date))[0]:undefined;
 if(!due)return null;
 if(attending===due.id)return <VisitFeedbackForm key={due.id} venueId={due.plan.venueId} date={due.date} onCancel={()=>setAttending(null)} onDone={reportId=>{state.setFeedback(due.id,{status:'submitted',reportId});setAttending(null);}}/>;
 return <View style={s.panel}><Text variant="heading3">Did you visit {due.plan.name}?</Text><Text>{due.date} · A couple of quick checks can help the next family.</Text>
 <Button label="Yes, we went" onPress={()=>setAttending(due.id)}/><View style={s.row}><Button label="Plans changed / skip" variant="ghost" onPress={()=>state.setFeedback(due.id,{status:'skipped'})}/><Button label="Ask me tomorrow" variant="ghost" onPress={()=>state.setFeedback(due.id,{status:'later',until:new Date(Date.now()+86400000).toISOString()})}/></View>
 </View>;
}
export function VenueTrustPanel({venueId}:{venueId:string}){
 const [data,setData]=useState<VenueTrust|null>(null);const [message,setMessage]=useState('');const [open,setOpen]=useState(false);const [date,setDate]=useState(localDate());const [revision,setRevision]=useState(0);
 useEffect(()=>{let live=true;setData(null);setMessage('');void feedbackApi(`?venueId=${encodeURIComponent(venueId)}`).then(result=>{if(live)setData(result);}).catch(()=>{if(live)setMessage('Recent visit reports are unavailable. Check with the venue for essential facilities.');});return()=>{live=false;};},[venueId,revision]);
 return <View style={s.panel}><Text variant="heading3">Sources & parent observations</Text>
 {data?Object.entries(data.fields).map(([key,f])=><View key={key} style={{gap:4}}><Text>{f.label}: {f.status==='needs_recheck'?'Recent reports need a recheck':f.status==='source_checked'?`Source checked · ${labels[f.value]||f.value}`:f.status==='editor_checked'?`FamilyPilot review · ${labels[f.value]||f.value}`:f.status==='parent_reported'?'Parents have reported; source not confirmed':'Not yet confirmed'}</Text>
 {f.checkedAt?<Text variant="bodySmall">{f.sourceUrl?'Source checked':'Reviewed'} {f.checkedAt.slice(0,10)}</Text>:null}
 {f.reportCount?<Text variant="bodySmall">{f.reportCount} account{f.reportCount===1?'':'s'} reported in the last 90 days · Last visit {f.lastReportedAt}. Reported: {f.observations.map(v=>labels[v]||v).join(', ')}. Visits are self-reported.</Text>:null}
 {f.sourceUrl&&/^https?:\/\//.test(f.sourceUrl)?<Button label={`Read ${f.label.toLowerCase()} source`} variant="ghost" onPress={()=>void Linking.openURL(f.sourceUrl!).catch(()=>setMessage('Could not open that source.'))}/>:null}
 </View>):null}
 {message?<Text accessibilityRole="alert">{message}</Text>:null}
 {!open?<Button label="I’ve visited — share a quick check" variant="outline" onPress={()=>{setMessage('');setOpen(true);}}/>:<><Field label="Date you visited (YYYY-MM-DD)" value={date} onChange={setDate}/><VisitFeedbackForm venueId={venueId} date={date} onCancel={()=>setOpen(false)} onDone={()=>{setOpen(false);setRevision(r=>r+1);setMessage('Thank you. Your observations have been saved and a source recheck queued.');}}/></>}
 </View>;
}
export function MyVisitReports(){
 const [reports,setReports]=useState<Array<{id:string;familypilot_place_id:string;visit_date:string;answers:Record<string,string>}>>([]);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 async function load(){setBusy(true);try{setReports((await feedbackApi()).reports);setMessage('');}catch(e){setMessage(e instanceof Error?e.message:'Could not load reports.');}finally{setBusy(false);}}
 return <View style={s.panel}><Text variant="heading3">Your visit reports</Text><Text variant="bodySmall">Reports help check venue information. Removing a report removes it from future summaries. Only reports from the last 90 days contribute to venue summaries.</Text><Button label="Load my reports" variant="outline" disabled={busy} onPress={()=>void load()}/>
 {reports.map(r=><View key={r.id} style={{gap:4}}><Text>{r.visit_date} · {Object.keys(r.answers).map(k=>visitQuestions[k as VisitField]?.label).join(', ')}</Text><Button label="Delete this report" variant="ghost" disabled={busy} onPress={()=>{setBusy(true);void feedbackApi('','DELETE',{id:r.id}).then(()=>load()).catch(e=>{setMessage(e.message);setBusy(false);});}}/></View>)}
 {message?<Text accessibilityRole="alert">{message}</Text>:null}</View>;
}
