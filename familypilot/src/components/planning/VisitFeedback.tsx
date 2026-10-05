import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Text } from '@/src/components/ui';
import { Chip } from '@/src/components/ui/Chip';
import { feedbackApi, feedbackDue, visitQuestions, VisitField, VenueTrust } from '@/src/services/planning/feedback';
import { PickedQuestion, pickVisitQuestions } from '@/src/services/planning/visit-questions';
import { useFamilyStore } from '@/src/stores/family-store';
import { localDate, usePlanningStore } from '@/src/stores/planning-store';
import { Field, formStyles as s } from '@/src/components/ui';
/** "2026-10-01" as "Thu 1 Oct": a local calendar date, so no timezone can move it a day. */
function prettyDay(iso:string){const [y,m,d]=iso.split('-').map(Number);const date=new Date(y,(m||1)-1,d||1);return Number.isNaN(date.getTime())?iso:date.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});}
const labels:Record<string,string>={yes:'Yes',no:'No',unavailable:'Closed or unusable',did_not_check:'Didn’t check',good:'Yes, comfortably',mixed:'Only in some areas',difficult:'No, difficult'};
/**
 * The two or three questions after a visit. Which ones, and in what order, is decided by what is not yet known about
 * THIS venue and what matters to THIS family (`pickVisitQuestions`); every answer is one tap, "Didn't check" is a
 * real answer, and nothing is sent until the parent says so.
 */
export function VisitFeedbackForm({venueId,date,onDone,onCancel}:{venueId:string;date:string;onDone:(id:string)=>void;onCancel:()=>void}) {
 const profile=useFamilyStore(s=>s.profile);
 const [questions,setQuestions]=useState<PickedQuestion[]|null>(null);
 const [answers,setAnswers]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const queryClient=useQueryClient();
 useEffect(()=>{
  let live=true;
  feedbackApi(`?venueId=${encodeURIComponent(venueId)}`)
   .then((data:VenueTrust)=>{if(live)setQuestions(pickVisitQuestions(data.fields,profile));})
   // Without the server's answer nothing is assumed known: ask the answerable basics.
   .catch(()=>{if(live)setQuestions(pickVisitQuestions(null,profile));});
  return()=>{live=false;};
 },[venueId,profile]);
 async function submit(){
  setBusy(true);setMessage('');
  try{
   const selected=Object.fromEntries(Object.entries(answers).filter(([,v])=>v));
   const result=await feedbackApi('','POST',{venueId,visitDate:date,attended:true,answers:selected});
   await queryClient.invalidateQueries();onDone(result.id);
  }catch(e){setMessage(e instanceof Error?e.message:'Could not submit. Please retry.');}finally{setBusy(false);}
 }
 if(questions===null)return <Card style={s.panel}><Text variant="bodySmall">Choosing the most useful questions…</Text></Card>;
 if(questions.length===0)return <Card style={s.panel} testID="visit-nothing-to-check"><Text variant="heading3">Nothing more to check</Text><Text variant="bodySmall">Everything we ask about is already confirmed for this place and checked recently. Thank you for going.</Text><Button label="Done" variant="outline" onPress={onCancel}/></Card>;
 const answered=Object.values(answers).some(v=>v&&v!=='did_not_check');
 return <Card style={s.panel} testID="visit-questions">
  <Text variant="eyebrow">QUICK CHECK</Text>
  <Text variant="heading3">What did you find?</Text>
  <Text variant="bodySmall">{questions.length===1?'One question':`${questions.length} quick questions`}, chosen because they are the least certain for this place. Only say what you checked on {prettyDay(date)}. We share a summary, never your name, your family or your routines.</Text>
  {questions.map(({key,why})=><View key={key} style={{gap:8}} testID={`visit-question-${key}`}>
   <Text>{visitQuestions[key].question}</Text>
   <Text variant="caption">{why}</Text>
   <View style={s.row}>{visitQuestions[key].values.map(value=><Chip key={value} label={labels[value]} active={answers[key]===value} onPress={()=>setAnswers(a=>({...a,[key]:value}))}/>)}</View>
  </View>)}
  <Text variant="bodySmall">“No” means it wasn’t there. “Closed or unusable” is for a temporary problem. You can remove your report under Families & routines.</Text>
  <Button label={busy?'Sharing…':'Share what I found'} disabled={busy||!answered} onPress={()=>void submit()} testID="visit-submit"/>
  <Button label="Skip" variant="ghost" disabled={busy} onPress={onCancel}/>
  {message?<Text accessibilityRole="alert">{message}</Text>:null}
 </Card>;
}
/**
 * "Did you go to X?" for a plan whose day has passed. The trigger is the strongest privacy-safe signal the product
 * has: the family saved a plan containing this venue and its date and time are behind them. Nothing here reads a
 * location, and opening a venue page never starts this.
 *
 *   Yes, we went        -> the short adaptive questions
 *   No, we didn't go    -> dismissed, no facility questions, nothing sent
 *   Ask me tomorrow     -> back in a day
 */
export function PostVisitInbox(){
 const state=usePlanningStore();
 const [now,setNow]=useState(Date.now());
 const [step,setStep]=useState<'ask'|'questions'|'thanks'>('ask');
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
 const due=state.hydrated?state.saved.filter(p=>feedbackDue(p,now)).sort((a,b)=>b.date.localeCompare(a.date))[0]:undefined;
 const [thanksFor,setThanksFor]=useState<string|null>(null);
 if(thanksFor&&step==='thanks')return <Card style={s.panel} testID="visit-thanks"><Text variant="heading3">Thank you</Text><Text variant="bodySmall">Families planning {thanksFor} will see what you found as “reported by parents”, next to what the venue says. It never replaces the venue’s own information, and more reports make it more reliable.</Text><Button label="Done" variant="outline" onPress={()=>{setThanksFor(null);setStep('ask');}}/></Card>;
 if(!due)return null;
 if(step==='questions')return <VisitFeedbackForm key={due.id} venueId={due.plan.venueId} date={due.date} onCancel={()=>setStep('ask')} onDone={reportId=>{state.setFeedback(due.id,{status:'submitted',reportId});setThanksFor(due.plan.name);setStep('thanks');}}/>;
 return <Card style={s.panel} testID="visit-ask"><Text variant="eyebrow">AFTER YOUR OUTING</Text><Text variant="heading3">Did you go to {due.plan.name}?</Text><Text variant="bodySmall">{prettyDay(due.date)} · If you did, two or three taps can help the next family.</Text>
  <Button label="Yes, we went" onPress={()=>setStep('questions')} testID="visit-yes"/>
  <Button label="No, we didn’t go" variant="outline" onPress={()=>state.setFeedback(due.id,{status:'skipped',reason:'did_not_go'})} testID="visit-no"/>
  <Button label="Ask me tomorrow" variant="ghost" onPress={()=>state.setFeedback(due.id,{status:'later',until:new Date(Date.now()+86400000).toISOString()})}/>
 </Card>;
}
export function VenueTrustPanel({venueId,startOpen=false}:{venueId:string;startOpen?:boolean}){
 const [data,setData]=useState<VenueTrust|null>(null);const [message,setMessage]=useState('');const [open,setOpen]=useState(startOpen);useEffect(()=>{if(startOpen)setOpen(true);},[startOpen]);const [date,setDate]=useState(localDate());const [revision,setRevision]=useState(0);
 useEffect(()=>{let live=true;setData(null);setMessage('');void feedbackApi(`?venueId=${encodeURIComponent(venueId)}`).then(result=>{if(live)setData(result);}).catch(()=>{if(live)setMessage('Recent visit reports are unavailable. Check with the venue for essential facilities.');});return()=>{live=false;};},[venueId,revision]);
 return <Card style={s.panel}><Text variant="heading3">Sources & parent observations</Text>
 {data?Object.entries(data.fields).map(([key,f])=><View key={key} style={{gap:4}}><Text>{f.label}: {f.status==='needs_recheck'?'Recent reports need a recheck':f.status==='source_checked'?`Source checked · ${labels[f.value]||f.value}`:f.status==='editor_checked'?`FamilyPilot review · ${labels[f.value]||f.value}`:f.status==='parent_reported'?(f.agreement==='corroborated'?`${f.reportCount} families have reported this; the venue’s own source is not confirmed`:'One family has reported this; the venue’s own source is not confirmed'):'Not yet confirmed'}</Text>
 {f.checkedAt?<Text variant="bodySmall">{f.sourceUrl?'Source checked':'Reviewed'} {f.checkedAt.slice(0,10)}</Text>:null}
 {f.reportCount?<Text variant="bodySmall">{f.reportCount} account{f.reportCount===1?'':'s'} reported in the last 90 days · Last visit {f.lastReportedAt}. Reported: {f.observations.map(v=>labels[v]||v).join(', ')}. Visits are self-reported.</Text>:null}
 {f.sourceUrl&&/^https?:\/\//.test(f.sourceUrl)?<Button label={`Read ${f.label.toLowerCase()} source`} variant="ghost" onPress={()=>void Linking.openURL(f.sourceUrl!).catch(()=>setMessage('Could not open that source.'))}/>:null}
 </View>):null}
 {message?<Text accessibilityRole="alert">{message}</Text>:null}
 {!open?<Button label="I’ve visited: share a quick check" variant="outline" onPress={()=>{setMessage('');setOpen(true);}}/>:<><Field label="Date you visited (YYYY-MM-DD)" value={date} onChange={setDate}/><VisitFeedbackForm venueId={venueId} date={date} onCancel={()=>setOpen(false)} onDone={()=>{setOpen(false);setRevision(r=>r+1);setMessage('Thank you. Your observations have been saved and a source recheck queued.');}}/></>}
 </Card>;
}
export function MyVisitReports(){
 const [reports,setReports]=useState<Array<{id:string;familypilot_place_id:string;visit_date:string;answers:Record<string,string>}>>([]);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 async function load(){setBusy(true);try{setReports((await feedbackApi()).reports);setMessage('');}catch(e){setMessage(e instanceof Error?e.message:'Could not load reports.');}finally{setBusy(false);}}
 return <Card style={s.panel}><Text variant="heading3">Your visit reports</Text><Text variant="bodySmall">Reports help check venue information. Removing a report removes it from future summaries. Only reports from the last 90 days contribute to venue summaries.</Text><Button label="Load my reports" variant="outline" disabled={busy} onPress={()=>void load()}/>
 {reports.map(r=><View key={r.id} style={{gap:4}}><Text>{r.visit_date} · {Object.keys(r.answers).map(k=>visitQuestions[k as VisitField]?.label).join(', ')}</Text><Button label="Delete this report" variant="ghost" disabled={busy} onPress={()=>{setBusy(true);void feedbackApi('','DELETE',{id:r.id}).then(()=>load()).catch(e=>{setMessage(e.message);setBusy(false);});}}/></View>)}
 {message?<Text accessibilityRole="alert">{message}</Text>:null}</Card>;
}
