import { useTabBarClearance } from '@/src/hooks/use-tab-bar-clearance';
import { PostVisitInbox } from '@/src/components/planning/VisitFeedback';
import { familyUsesBuggy } from '@/src/utils/family-mobility';
import { routinesForPlanner } from '@/src/utils/routine-schedule';
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { Button, Card, Text } from '@/src/components/ui';
import { Chip } from '@/src/components/ui/Chip';
import { colors, spacing } from '@/src/design-system/tokens';
import { FamilyEditor } from '@/src/components/planning/FamilyEditor';
import { formStyles as s } from '@/src/components/ui';
import { PlanningAccount } from '@/src/components/planning/PlanningAccount';
import { accountRequired } from '@/src/stores/auth-store';
import { useFamilyStore } from '@/src/stores/family-store';
import { localDate, localTime, usePlanningStore } from '@/src/stores/planning-store';
import { resolveHomeCoordinates } from '@/src/services/places/geo-utils';
import { PlanningFamily, clockLabel, sharePlanText } from '@/src/services/planning/planner';
import { makeSubjectResolver } from '@/src/services/planning/routine-subjects';
import { toPlanViewModel } from '@/src/services/planning/plan-view-model';
import { householdTitle } from '@/src/utils/household';
import { PlanningConnection, listAcceptedConnections } from '@/src/services/planning/connections';
import { PlanInvite, listPlanInvites, createPlanInvite, respondToPlanInvite, cancelPlanInvite } from '@/src/services/planning/plan-invites';
import { SavedPlan } from '@/src/stores/planning-store';
import { supabase } from '@/src/services/supabase/client';
import { familyDisplayName } from '@/src/utils/family-title';
import { useSavedStore } from '@/src/stores/saved-store';

const linkStyle={alignSelf:'flex-start' as const,minHeight:44,justifyContent:'center' as const};

export default function TripsScreen() {
 const savedPlaces=useSavedStore(x=>x.items.length);
 const router=useRouter();
 const tabBarClearance=useTabBarClearance();const state=usePlanningStore();const profile=useFamilyStore(x=>x.profile);
 const [editor,setEditor]=useState<PlanningFamily|null>(null);
 const [message,setMessage]=useState('');
 const [tab,setTab]=useState<'plan'|'saved'|'families'>('plan');
 // "See all your plans", from a plan just saved, lands here with its id: the list opens on Plans with that row marked,
 // so the parent sees where it went.
 const params=useLocalSearchParams();
 const justSavedParam=typeof params.justSaved==='string'?params.justSaved:null;
 const [justSaved,setJustSaved]=useState<string|null>(null);
 useEffect(()=>{
  if(!justSavedParam)return;
  setJustSaved(justSavedParam);
  setTab('plan');
  router.setParams({justSaved:undefined} as never);
 },[justSavedParam,router]);
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
   const pushchair=familyUsesBuggy(profile);
   const agesChanged=JSON.stringify(ages)!==JSON.stringify(mine.ages);
   if(mine.area!==profile.homeLocation||mine.latitude!==home.latitude||mine.longitude!==home.longitude||mine.pushchair!==pushchair||agesChanged){
     usePlanningStore.getState().setFamily({...mine,area:profile.homeLocation,latitude:home.latitude,longitude:home.longitude,pushchair,ages});
   }
   // eslint-disable-next-line react-hooks/exhaustive-deps
 },[state.hydrated,profile.homeLocation,profile.homeLatitude,profile.homeLongitude,profile.pushchair,profile.members]);
 const blank=(mine:boolean):PlanningFamily=>{const home=mine?resolveHomeCoordinates(profile):null;return {id:mine?'mine':`guest-${Date.now()}`,label:mine?'Our family':'',area:mine?profile.homeLocation:'',latitude:home?.latitude??NaN,longitude:home?.longitude??NaN,ages:mine?profile.members.filter(m=>m.role==='child').map(m=>m.age):[],maxDriveMinutes:mine?profile.maxDriveMinutes:30,budgetTier:mine?profile.budgetTier:'moderate',pushchair:mine?familyUsesBuggy(profile):false,required:[],routines:mine?routinesForPlanner(profile):[]};};
 async function share(text:string){try{await Share.share({message:text});}catch{setMessage('Sharing is unavailable on this device.');}}

 // Sharing a specific saved plan with a connected family, and tracking whether they've
 // accepted it, is separate from the standing family "connection" itself - a family can be
 // connected but only invited to some days, and each invite has its own pending/accepted state.
 const [connections, setConnections] = useState<PlanningConnection[]>([]);
 const [invites, setInvites] = useState<PlanInvite[]>([]);
 const [sharingBusy, setSharingBusy] = useState(false);
 const [sharingMessage, setSharingMessage] = useState('');
 const [inviteTargetPlanId, setInviteTargetPlanId] = useState<string | null>(null);

 async function loadSharing() {
   // Silent no-op for a device that hasn't created a planning account - sharing a plan is an
   // opt-in extra on top of local-only planning, not something to nag every Saved-tab visitor
   // with a "please sign in" message for.
   if (!supabase) return;
   const { data } = await supabase.auth.getSession();
   if (!data.session) { setConnections([]); setInvites([]); return; }
   setSharingBusy(true);
   setSharingMessage('');
   try {
     const [conns, invs] = await Promise.all([listAcceptedConnections(), listPlanInvites()]);
     setConnections(conns);
     setInvites(invs);
   } catch (e) {
     setSharingMessage(e instanceof Error ? e.message : 'Could not load sharing status.');
   } finally {
     setSharingBusy(false);
   }
 }
 useEffect(() => { if (tab === 'saved') void loadSharing(); }, [tab]);

 async function sendInvite(connectionId: string, saved: SavedPlan) {
   setSharingBusy(true);
   setSharingMessage('');
   try {
     await createPlanInvite(connectionId, { id: saved.id, date: saved.date, plan: saved.plan });
     setInviteTargetPlanId(null);
     setSharingMessage('Invite sent. They’ll see it as pending until they respond.');
     await loadSharing();
   } catch (e) {
     setSharingMessage(e instanceof Error ? e.message : 'Could not send invite.');
   } finally {
     setSharingBusy(false);
   }
 }
 async function respondInvite(id: string, status: 'accepted' | 'declined') {
   setSharingBusy(true);
   setSharingMessage('');
   try {
     await respondToPlanInvite(id, status);
     await loadSharing();
   } catch (e) {
     setSharingMessage(e instanceof Error ? e.message : 'Could not respond to invite.');
   } finally {
     setSharingBusy(false);
   }
 }
 async function cancelInvite(id: string) {
   setSharingBusy(true);
   try {
     await cancelPlanInvite(id);
     await loadSharing();
   } catch (e) {
     setSharingMessage(e instanceof Error ? e.message : 'Could not cancel invite.');
   } finally {
     setSharingBusy(false);
   }
 }
 function addSharedPlanToMine(invite: PlanInvite) {
   state.savePlan({ id: invite.planId, date: invite.planDate, plan: invite.plan, checked: [], createdAt: new Date().toISOString() });
   setSharingMessage(`Added "${invite.plan.name}" to your saved plans.`);
 }
 if(!state.hydrated)return <ScreenContainer><Text>Loading your plans…</Text></ScreenContainer>;
 return <ScreenContainer><ScrollView contentContainerStyle={{padding:spacing.screenPadding,paddingBottom:tabBarClearance,gap:spacing.md}} keyboardShouldPersistTaps="handled">
  <PostVisitInbox/>
  <Text variant="heading1">Plans</Text><Text color={colors.text.secondary}>Days that work for everyone involved.</Text>
  <View style={s.row}>{(['plan','saved','families'] as const).map(t=><Chip key={t} label={{plan:'Plans',saved:'Saved plans',families:'Families & routines'}[t]} active={tab===t} onPress={()=>setTab(t)}/>)}</View>
  {editor?<FamilyEditor key={editor.id} initial={editor} onCancel={()=>setEditor(null)} onSave={f=>{state.setFamily(f);setEditor(null);}}/>:null}
  {tab==='families'?<>
    <Text variant="bodySmall">Family details and saved plans stay on this device unless you choose to back them up. Friend connections share only the details you explicitly approve.</Text>
    {state.families.map(f=><Card key={f.id} style={s.panel}><Text variant="heading3">{familyDisplayName(f.label)}</Text><Text>{f.area} · {f.ages.length?`Ages ${f.ages.join(', ')}`:'Adults only'} · {f.routines.length} routines</Text><Button label="Edit family and routines" variant="outline" onPress={()=>setEditor(f)}/><Button label="Remove from this device" variant="ghost" onPress={()=>state.removeFamily(f.id)}/></Card>)}
    {!state.families.some(f=>f.id==='mine')?<Button label="Add your family" onPress={()=>setEditor(blank(true))}/>:null}
    <Button label="Add a family together on this phone" variant="outline" onPress={()=>setEditor(blank(false))}/>
    <PlanningAccount/>
  </>:null}
  {tab==='plan'?<>
   {/* The Plans tab is where plans are kept and where a plan begins from a person, not a second place to build one.
       A day is created from a place (Create a plan on any venue), so there is one way to build it, with one set of
       questions; this tab shows what has been made and offers the two other beginnings. */}
   <Card style={s.panel}>
    <Text variant="heading2">Start a plan</Text>
    <Text color={colors.text.secondary}>A plan begins with a place. Choose somewhere that suits your family, then tap Create a plan.</Text>
    <View style={s.row}>
     <Button label="Best for us today" onPress={()=>router.push('/(tabs)' as never)} testID="plans-go-home"/>
     <Button label="Explore London" variant="outline" onPress={()=>router.push('/(tabs)/explore' as never)} testID="plans-go-explore"/>
    </View>
   </Card>
   {/* Saved places live here now: the bottom navigation's Saved tab became Halfway, and the places a family keeps are part
       of what they plan from. */}
   <Pressable onPress={()=>router.push('/saved' as never)} accessibilityRole="button" accessibilityLabel={`Saved places, ${savedPlaces} ${savedPlaces===1?'place':'places'}`} testID="plans-saved-places">
    <Card style={s.panel}>
     <Text variant="heading2">Saved places</Text>
     <Text color={colors.text.secondary}>{savedPlaces?`${savedPlaces} ${savedPlaces===1?'place':'places'} your family wants to remember.`:'Places you save with the heart appear here.'}</Text>
     <Text variant="link">Open saved places →</Text>
    </Card>
   </Pressable>
   {state.savedDays.length?<Card style={s.panel} testID="plans-saved-days">
    <Text variant="heading2">Your plans</Text>
    {state.savedDays.map((day,i)=>{
     const view=toPlanViewModel(day.source,{resolveSubject:makeSubjectResolver(profile,state.families),householdTitle:householdTitle(profile)});
     const fresh=day.id===justSaved;
     return <Pressable key={day.id} onPress={()=>router.push({pathname:'/saved-plan',params:{id:day.id}} as never)} accessibilityRole="button" accessibilityLabel={`Open ${view.title}${fresh?', just saved':''}`} testID={fresh?'plans-just-saved':undefined} style={[{minHeight:56,justifyContent:'center',gap:2},i>0?{borderTopWidth:1,borderColor:colors.border,paddingTop:spacing.sm}:undefined,fresh?{backgroundColor:colors.actionSoft,borderRadius:12,paddingHorizontal:spacing.sm,paddingBottom:spacing.xs}:undefined]}>
      {fresh?<Text variant="caption" color={colors.action}>✓ Just saved</Text>:null}
      <Text variant="heading3">{view.title}</Text>
      <Text variant="bodySmall" color={colors.text.secondary}>{view.dateSummary}</Text>
     </Pressable>;})}
   </Card>:<Card style={s.panel}><Text variant="bodySmall" color={colors.text.secondary}>Plans you save appear here.</Text></Card>}
   {message?<Text accessibilityRole="alert" color={colors.warning[600]}>{message}</Text>:null}
  </>:null}
  {tab==='saved'?<>
   {sharingMessage?<Text accessibilityRole="alert" color={colors.warning[600]}>{sharingMessage}</Text>:null}

   {invites.some(i=>i.direction==='received')?<Card style={s.panel}>
    <Text variant="heading2">Shared with you</Text>
    <Text variant="bodySmall" color={colors.text.secondary}>Days another connected family has invited you to.</Text>
    {invites.filter(i=>i.direction==='received').map((invite,i)=><View key={invite.id} style={i>0?{borderTopWidth:1,borderColor:colors.border,marginTop:spacing.md,paddingTop:spacing.md}:undefined}>
     <View style={s.row}><Text variant="heading3" style={{flex:1}}>{invite.plan.name}</Text>
      <View style={{paddingHorizontal:spacing.sm,paddingVertical:2,borderRadius:999,backgroundColor:invite.status==='pending'?colors.warning[50]:invite.status==='accepted'?colors.secondary[50]:colors.error[50]}}>
       <Text variant="caption" color={invite.status==='pending'?colors.warning[600]:invite.status==='accepted'?colors.secondary[600]:colors.error[600]}>{invite.status==='pending'?'Pending your response':invite.status==='accepted'?'Accepted':'Declined'}</Text>
      </View>
     </View>
     <Text variant="bodySmall" color={colors.text.secondary}>From {invite.otherLabel} · {invite.planDate} · {clockLabel(invite.plan.start)}–{clockLabel(invite.plan.end)}</Text>
     {invite.plan.timings.map(t=><Text key={t.familyId} variant="bodySmall">{t.familyId==='mine'?t.label:familyDisplayName(t.label)}: leave {clockLabel(t.depart)}, home about {clockLabel(t.home)}</Text>)}
     {invite.status==='pending'?<View style={s.row}>
      <Button label="Accept" size="sm" disabled={sharingBusy} onPress={()=>void respondInvite(invite.id,'accepted')}/>
      <Button label="Decline" size="sm" variant="ghost" disabled={sharingBusy} onPress={()=>void respondInvite(invite.id,'declined')}/>
     </View>:invite.status==='accepted'?<Button label="Add to my saved plans" size="sm" variant="outline" onPress={()=>addSharedPlanToMine(invite)}/>:null}
    </View>)}
   </Card>:null}

   {!state.saved.length?<Card style={s.panel}><Text>No saved plans yet.</Text><Button label="Start a plan" onPress={()=>setTab('plan')}/></Card>:null}
   {state.saved.map(saved=>{
    const sent=invites.filter(i=>i.direction==='sent'&&i.planId===saved.id);
    return <Card key={saved.id} style={s.panel}><Text variant="heading2">{saved.plan.name}</Text><Text>{saved.date} · {clockLabel(saved.plan.start)}–{clockLabel(saved.plan.end)}</Text>
    {saved.plan.timings.map(t=><Text key={t.familyId}>{t.familyId==='mine'?t.label:familyDisplayName(t.label)}: leave {clockLabel(t.depart)}, home about {clockLabel(t.home)}</Text>)}
    <Text variant="bodySmall">Saved timings are a snapshot. Recheck before leaving if routines, weather or travel change.</Text>
    <Text variant="heading3">Before you go</Text>{['Check opening hours and booking','Check travel time','Pack feeds and snacks','Nappies, wipes and spare clothes','Buggy and weather layers'].map(item=><Chip key={item} label={`${saved.checked.includes(item)?'✓ ':''}${item}`} active={saved.checked.includes(item)} onPress={()=>state.togglePacked(saved.id,item)}/>)}

    <Text variant="heading3">Invite a family</Text>
    {sent.length?sent.map(invite=><View key={invite.id} style={[s.row,{alignItems:'center'}]}>
     <Text variant="bodySmall" style={{flex:1}}>{invite.otherLabel}</Text>
     <View style={{paddingHorizontal:spacing.sm,paddingVertical:2,borderRadius:999,backgroundColor:invite.status==='pending'?colors.warning[50]:invite.status==='accepted'?colors.secondary[50]:colors.error[50]}}>
      <Text variant="caption" color={invite.status==='pending'?colors.warning[600]:invite.status==='accepted'?colors.secondary[600]:colors.error[600]}>{invite.status==='pending'?'Pending':invite.status==='accepted'?'Accepted':'Declined'}</Text>
     </View>
     {invite.status==='pending'?<Button label="Cancel" size="sm" variant="ghost" onPress={()=>void cancelInvite(invite.id)}/>:null}
    </View>):null}
    {connections.length?<>
     {inviteTargetPlanId===saved.id?<>
      <Text variant="bodySmall" color={colors.text.secondary}>Choose a connected family to invite:</Text>
      <View style={s.row}>{connections.filter(c=>!sent.some(i=>i.status!=='declined'&&i.connectionId===c.id)).map(c=><Chip key={c.id} label={familyDisplayName(c.family?.label)} onPress={()=>void sendInvite(c.id,saved)}/>)}</View>
      <Button label="Cancel" variant="ghost" size="sm" onPress={()=>setInviteTargetPlanId(null)}/>
     </>:<Button label="Invite a family to this plan" variant="outline" disabled={sharingBusy} onPress={()=>setInviteTargetPlanId(saved.id)}/>}
    </>:<Text variant="bodySmall" color={colors.text.secondary}>Connect a family under Families &amp; routines to invite them here.</Text>}

    <Button label="Share plan" onPress={()=>void share(sharePlanText(saved.plan,saved.date))}/><Button label="Plan another day" variant="outline" onPress={()=>setTab('plan')}/><Button label="Delete saved plan" variant="ghost" onPress={()=>state.deletePlan(saved.id)}/>
   </Card>;})}
  </>:null}
 </ScrollView></ScreenContainer>;
}
