import { PostVisitInbox } from '@/src/components/planning/VisitFeedback';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Linking, ScrollView, Share, View } from 'react-native';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Button, Card, Text } from '@/src/components/ui';
import { Chip } from '@/src/components/ui/Chip';
import { VenueImage } from '@/src/components/ui/VenueImage';
import { colors, spacing } from '@/src/design-system/tokens';
import { FamilyEditor } from '@/src/components/planning/FamilyEditor';
import { DateField, TimeField, formStyles as s } from '@/src/components/ui';
import { PlanningAccount } from '@/src/components/planning/PlanningAccount';
import { useFamilyStore } from '@/src/stores/family-store';
import { localDate, usePlanningStore } from '@/src/stores/planning-store';
import { resolveHomeCoordinates } from '@/src/services/places/geo-utils';
import { PlanningFamily, clockLabel, clockMinutes, sharePlanText } from '@/src/services/planning/planner';
import { PlanningResult, recommendPlans, addMeal } from '@/src/services/planning/recommendations';

export default function TripsScreen() {
 const router=useRouter();const state=usePlanningStore();const profile=useFamilyStore(x=>x.profile);
 const [editor,setEditor]=useState<PlanningFamily|null>(null);const [selected,setSelected]=useState<string[]>(['mine']);
 const [results,setResults]=useState<PlanningResult[]>([]);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [searched,setSearched]=useState(false);
 const [tab,setTab]=useState<'plan'|'saved'|'families'>('plan');const [resultKey,setResultKey]=useState('');
 const active=state.families.filter(f=>selected.includes(f.id));const inputKey=JSON.stringify({active,options:state.options});
 useEffect(()=>{if(state.hydrated&&state.options.date<localDate())state.setOptions({date:localDate()});},[state.hydrated]);
 // "mine" is seeded from the profile once when first created, but a parent's home, pushchair or
 // children's ages are facts, not a planning-session choice — keep them in sync so they can't
 // silently drift from the profile that's meant to be the one source of truth. Label, budget,
 // max drive, required facilities and routines stay untouched: those are legitimately something
 // a parent might set differently for a specific day plan than for general browsing.
 useEffect(()=>{
   if(!state.hydrated)return;
   const mine=usePlanningStore.getState().families.find(f=>f.id==='mine');
   if(!mine)return;
   const home=resolveHomeCoordinates(profile);
   const ages=profile.members.filter(m=>m.role==='child').map(m=>m.age);
   const pushchair=Boolean(profile.pushchair);
   const agesChanged=JSON.stringify(ages)!==JSON.stringify(mine.ages);
   if(mine.area!==profile.homeLocation||mine.latitude!==home.latitude||mine.longitude!==home.longitude||mine.pushchair!==pushchair||agesChanged){
     usePlanningStore.getState().setFamily({...mine,area:profile.homeLocation,latitude:home.latitude,longitude:home.longitude,pushchair,ages});
   }
   // eslint-disable-next-line react-hooks/exhaustive-deps
 },[state.hydrated,profile.homeLocation,profile.homeLatitude,profile.homeLongitude,profile.pushchair,profile.members]);
 const blank=(mine:boolean):PlanningFamily=>{const home=mine?resolveHomeCoordinates(profile):null;return {id:mine?'mine':`guest-${Date.now()}`,label:mine?'Our family':'',area:mine?profile.homeLocation:'',latitude:home?.latitude??NaN,longitude:home?.longitude??NaN,ages:mine?profile.members.filter(m=>m.role==='child').map(m=>m.age):[],maxDriveMinutes:mine?profile.maxDriveMinutes:30,budgetTier:mine?profile.budgetTier:'moderate',pushchair:mine?Boolean(profile.pushchair):false,required:[],routines:mine?(profile.routines??[]).map(r=>({...r})):[]};};
 async function find(){setBusy(true);setMessage('');setResults([]);setSearched(false);try{
   clockMinutes(state.options.leaveAt);if(state.options.returnBy)clockMinutes(state.options.returnBy);
   if(!active.length)throw new Error('Add your family and select who is coming.');
   const data=await recommendPlans(active,state.options);setResults(data);setResultKey(inputKey);setSearched(true);
 }catch(e){setMessage(e instanceof Error?e.message:'Could not find plans. Please try again.');}finally{setBusy(false);}}
 async function share(text:string){try{await Share.share({message:text});}catch{setMessage('Sharing is unavailable on this device.');}}
 if(!state.hydrated)return <ScreenContainer><Text>Loading your plans…</Text></ScreenContainer>;
 return <ScreenContainer><ScrollView contentContainerStyle={{padding:spacing.screenPadding,paddingBottom:60,gap:spacing.md}} keyboardShouldPersistTaps="handled">
  <PostVisitInbox/>
  <Text variant="heading1">Make a plan</Text><Text color={colors.text.secondary}>A day that works for everyone.</Text>
  <View style={s.row}>{(['plan','saved','families'] as const).map(t=><Chip key={t} label={{plan:'Plan a day',saved:'Saved plans',families:'Families & routines'}[t]} active={tab===t} onPress={()=>setTab(t)}/>)}</View>
  {editor?<FamilyEditor key={editor.id} initial={editor} onCancel={()=>setEditor(null)} onSave={f=>{state.setFamily(f);setSelected(ids=>[...new Set([...ids,f.id])]);setEditor(null);}}/>:null}
  {tab==='families'?<>
    <Text variant="bodySmall">Family details and saved plans stay on this device unless you choose to back them up. Friend connections share only the details you explicitly approve.</Text>
    {state.families.map(f=><Card key={f.id} style={s.panel}><Text variant="heading3">{f.label}</Text><Text>{f.area} · {f.ages.length?`Ages ${f.ages.join(', ')}`:'Adults only'} · {f.routines.length} routines</Text><Button label="Edit family and routines" variant="outline" onPress={()=>setEditor(f)}/><Button label="Remove from this device" variant="ghost" onPress={()=>{state.removeFamily(f.id);setSelected(ids=>ids.filter(id=>id!==f.id));}}/></Card>)}
    {!state.families.some(f=>f.id==='mine')?<Button label="Add your family" onPress={()=>setEditor(blank(true))}/>:null}
    <Button label="Add a family together on this phone" variant="outline" onPress={()=>setEditor(blank(false))}/>
    <PlanningAccount/>
  </>:null}
  {tab==='plan'?<>
   <Card style={s.panel}><Text variant="heading2">Who’s coming?</Text>
    <View style={s.row}>{state.families.map(f=><Chip key={f.id} label={f.label} active={selected.includes(f.id)} onPress={()=>setSelected(ids=>ids.includes(f.id)?ids.filter(x=>x!==f.id):[...ids,f.id])}/>)}</View>
    {!state.families.length?<Button label="Set up your family & routines" onPress={()=>setEditor(blank(true))}/>:null}
    <Button label="Manage families and routines" variant="ghost" onPress={()=>setTab('families')}/>
    <DateField label="Date" value={state.options.date} onChange={date=>state.setOptions({date})}/>
    <TimeField label="Earliest departure" value={state.options.leaveAt} onChange={leaveAt=>state.setOptions({leaveAt})}/>
    <Button label="Leave from now" variant="ghost" onPress={()=>{const d=new Date();state.setOptions({date:localDate(),leaveAt:`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`});}}/>
    <TimeField label="Everyone home by (optional)" value={state.options.returnBy} onChange={returnBy=>state.setOptions({returnBy})} optional/>
    <Text variant="bodySmall">Time at the activity</Text><View style={s.row}>{[60,90,120,180].map(n=><Chip key={n} label={`${n} min`} active={state.options.visitMinutes===n} onPress={()=>state.setOptions({visitMinutes:n})}/>)}</View>
    <Text variant="bodySmall">Extra time each way for traffic, parking and getting ready</Text><View style={s.row}>{[10,15,30].map(n=><Chip key={n} label={`${n} min`} active={state.options.bufferMinutes===n} onPress={()=>state.setOptions({bufferMinutes:n})}/>)}</View>
    <View style={s.row}>{(['either','indoor','outdoor'] as const).map(v=><Chip key={v} label={{either:'Any setting',indoor:'Indoors',outdoor:'Outdoors'}[v]} active={state.options.environment===v} onPress={()=>state.setOptions({environment:v})}/>)}</View>
    <Button label={busy?'Finding a plan for everyone…':'Find our best plans'} disabled={busy||!active.length} onPress={()=>void find()}/>
    {!busy&&!active.length?<Text variant="bodySmall" color={colors.warning[600]}>{state.families.length?'Select at least one family above to find a plan.':'Add your family above first — we need to know who’s coming.'}</Text>:null}
   </View>
   {message?<Text accessibilityRole="alert" color={colors.warning[600]}>{message}</Text>:null}
   {searched&&inputKey!==resultKey?<Text>Preferences have changed. Find plans again to update the timings.</Text>:null}
   {searched&&inputKey===resultKey&&!results.length?<Card style={s.panel}><Text variant="heading3">No confident match yet</Text><Text>No place in the available data meets every family’s requirements and timing. Try another date, a longer travel limit, or update a must-have. We won’t silently relax your requirements.</Text><Button label="Explore places and their details" variant="outline" onPress={()=>router.push('/(tabs)/explore' as never)}/></Card>:null}
   {inputKey===resultKey?results.map((result,i)=>{const {plan,place,food,foodStatus,meal}=result;return (<Card key={plan.venueId} style={s.panel}>
    <VenueImage uri={place.photos[0]} category={place.category} alt={place.name} style={{height:180,width:'100%'}}/>
    <Text variant="bodySmall" color={colors.primary[600]}>{i===0?'Our first suggestion':'Another option'}</Text><Text variant="heading2">{plan.name}</Text>
    <Text>{clockLabel(plan.start)}–{clockLabel(plan.end)} · {active.length} {active.length===1?'family':'families'}</Text>
    {plan.reasons.map(reason=><Text key={reason} variant="bodySmall">✓ {reason}</Text>)}
    {plan.timings.map(t=><View key={t.familyId} style={{gap:6,paddingVertical:10}}><Text variant="heading3">{t.label}</Text><Text>Leave {clockLabel(t.depart)} · Home about {clockLabel(t.home)}</Text><Text variant="bodySmall">{t.journey.outbound} min out / {t.journey.inbound} min back, estimated. Latest departure for a full visit before the next home commitment: {clockLabel(t.latestDeparture)}.</Text>{t.notes.map(n=><Text key={n} variant="bodySmall">{n}</Text>)}</View>)}
    <Text variant="bodySmall" color={colors.warning[600]}>Opening hours for your visit are not verified. Confirm before committing. Return traffic is estimated; feed and sleep times remain flexible.</Text>
    {plan.unknowns.map(u=><Text key={u} variant="bodySmall">{u}</Text>)}
    <Button label="View venue facilities and evidence" variant="outline" onPress={()=>router.push(`/venue/${place.familypilotId}` as never)}/>
    <Text variant="heading3">{meal?`Lunch: ${meal.name}`:'Food nearby'}</Text>{meal?<Text>Lunch at {clockLabel(meal.start)} for {meal.duration} minutes. The plan and home times include the transfer and meal.</Text>:null}<Text variant="bodySmall">{foodStatus}</Text>
    {food.map(f=><View key={f.id} style={{gap:6}}><Text variant="heading3">{f.name}</Text><Text variant="bodySmall">{f.metres}m straight-line distance · {f.facts.join(' · ')||'Family details need checking'}</Text><Text variant="bodySmall">{f.unknowns.join(' · ')}</Text><Button label="Add a 45-minute lunch and recheck timings" variant="outline" onPress={()=>{try{const updated=addMeal(result,f,active,state.options);setResults(rows=>rows.map(row=>row.place.familypilotId===place.familypilotId?updated:row));setMessage('Lunch added. Check the updated departure and return times.');}catch(e){setMessage(e instanceof Error?e.message:'Lunch does not fit.');}}}/><Button label="Check restaurant and directions" variant="ghost" onPress={()=>void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${f.name} near ${place.name}`)}`)}/></View>)}
    <Text variant="bodySmall">{meal?'Confirm restaurant opening hours and availability.':'Add lunch above to include meal and transfer time in your plan.'}</Text>
    <Button label="Save this plan" onPress={()=>{state.savePlan({id:`${state.options.date}-${plan.venueId}`,date:state.options.date,plan,checked:[],createdAt:new Date().toISOString()});setTab('saved');}}/>
    <Button label="Share a summary" variant="outline" onPress={()=>void share(sharePlanText(plan,state.options.date))}/>
   </Card>); }):null}
  </>:null}
  {tab==='saved'?<>
   {!state.saved.length?<Card style={s.panel}><Text>No saved plans yet.</Text><Button label="Plan a day" onPress={()=>setTab('plan')}/></Card>:null}
   {state.saved.map(saved=><Card key={saved.id} style={s.panel}><Text variant="heading2">{saved.plan.name}</Text><Text>{saved.date} · {clockLabel(saved.plan.start)}–{clockLabel(saved.plan.end)}</Text>
    {saved.plan.timings.map(t=><Text key={t.familyId}>{t.label}: leave {clockLabel(t.depart)}, home about {clockLabel(t.home)}</Text>)}
    <Text variant="bodySmall">Saved timings are a snapshot. Recheck before leaving if routines, weather or travel change.</Text>
    <Text variant="heading3">Before you go</Text>{['Check opening hours and booking','Check travel time','Pack feeds and snacks','Nappies, wipes and spare clothes','Buggy and weather layers'].map(item=><Chip key={item} label={`${saved.checked.includes(item)?'✓ ':''}${item}`} active={saved.checked.includes(item)} onPress={()=>state.togglePacked(saved.id,item)}/>)}
    <Button label="Share plan" onPress={()=>void share(sharePlanText(saved.plan,saved.date))}/><Button label="Replan with current preferences" variant="outline" onPress={()=>{state.setOptions({date:saved.date<localDate()?localDate():saved.date});setTab('plan');setSearched(false);}}/><Button label="Delete saved plan" variant="ghost" onPress={()=>state.deletePlan(saved.id)}/>
   </Card>)}
  </>:null}
 </ScrollView></ScreenContainer>;
}
