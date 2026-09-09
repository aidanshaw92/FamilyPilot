import { useEffect, useState } from 'react';
import { Share, Switch, View } from 'react-native';
import { Button, Text } from '@/src/components/ui';
import { supabase } from '@/src/services/supabase/client';
import { planningApiUrl } from '@/src/services/planning/recommendations';
import { PlanningFamily } from '@/src/services/planning/planner';
import { PlanningData, usePlanningStore } from '@/src/stores/planning-store';
import { Field, formStyles as s } from './FamilyEditor';

type Connection={id:string;pending:boolean;expiresAt:string;family:PlanningFamily|null};
export function PlanningAccount(){
 const state=usePlanningStore();const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [user,setUser]=useState<string|null>(null);
 const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [code,setCode]=useState('');const [invite,setInvite]=useState('');const [connections,setConnections]=useState<Connection[]>([]);
 const [restore,setRestore]=useState<PlanningData|null>(null);const mine=state.families.find(f=>f.id==='mine');
 const [shareAvailability,setShareAvailability]=useState(false);const [clearConfirm,setClearConfirm]=useState(false);const [recovering,setRecovering]=useState(false);
 useEffect(()=>{if(!supabase)return;void supabase.auth.getSession().then(({data})=>setUser(data.session?.user.id??null));const {data}=supabase.auth.onAuthStateChange((event,session)=>{setUser(session?.user.id??null);setConnections([]);setRestore(null);setInvite('');if(event==='PASSWORD_RECOVERY')setRecovering(true);});return()=>data.subscription.unsubscribe();},[]);
 async function run(action:()=>Promise<void>){setBusy(true);setMessage('');try{await action();}catch(e){setMessage(e instanceof Error?e.message:'Something went wrong.');}finally{setBusy(false);}}
 async function api(method='GET',body?:unknown){const {data}=await supabase!.auth.getSession();if(!data.session)throw new Error('Please sign in.');const r=await fetch(planningApiUrl('connections'),{method,headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await r.json();if(!r.ok)throw new Error(result.error||'Connections unavailable');return result;}
 async function refresh(){const result=await api();setConnections(result.connections);}
 if(!supabase)return <View style={s.panel}><Text variant="heading3">Connect with friends</Text><Text>Account connections need to be enabled by the app owner. You can already plan together on one phone.</Text></View>;
 return <View style={s.panel}><Text variant="heading2">Your account & friends</Text>
 {!user?<>
  <Field label="Email" value={email} onChange={setEmail}/><Field label="Password" value={password} onChange={setPassword} secure/>
  <Button label="Sign in" disabled={busy} onPress={()=>void run(async()=>{const {error}=await supabase!.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;setPassword('');setMessage('Signed in. Device data has not been automatically uploaded.');})}/>
  <Button label="Create account" variant="outline" disabled={busy} onPress={()=>void run(async()=>{if(password.length<10)throw new Error('Use a password with at least 10 characters.');const {data,error}=await supabase!.auth.signUp({email:email.trim(),password});if(error)throw error;setPassword('');setMessage(data.session?'Account created.':'Check your email to confirm your account, then sign in.');})}/>
  <Button label="Send password recovery email" variant="ghost" disabled={busy||!email.trim()} onPress={()=>void run(async()=>{const {error}=await supabase!.auth.resetPasswordForEmail(email.trim(),{redirectTo:typeof window!=='undefined'?`${window.location.origin}/trips`:undefined});if(error)throw error;setMessage('If an account exists, check your email for a recovery link.');})}/>
 </>:<>
  <Text variant="bodySmall">Signed in. Backups are private to your account. This device’s data is separate until you choose to upload or restore it.</Text>
  {recovering?<><Field label="New password" value={password} onChange={setPassword} secure/><Button label="Save new password" disabled={busy} onPress={()=>void run(async()=>{if(password.length<10)throw new Error('Use at least 10 characters.');const {error}=await supabase!.auth.updateUser({password});if(error)throw error;setPassword('');setRecovering(false);setMessage('Password updated.');})}/></>:null}
  <Button label="Back up this device’s plans and routines" disabled={busy} onPress={()=>void run(async()=>{const {error}=await supabase!.from('planning_workspaces').upsert({user_id:user,data:{families:state.families,options:state.options,saved:state.saved},updated_at:new Date().toISOString()});if(error)throw error;setMessage('Private backup saved. This replaces the previous cloud backup.');})}/>
  <Button label="Check my cloud backup" variant="outline" disabled={busy} onPress={()=>void run(async()=>{const {data,error}=await supabase!.from('planning_workspaces').select('data').eq('user_id',user).maybeSingle();if(error)throw error;if(!data)throw new Error('No cloud backup yet.');if(!Array.isArray(data.data?.families)||!Array.isArray(data.data?.saved)||!data.data?.options)throw new Error('This backup cannot be restored.');setRestore(data.data as PlanningData);})}/>
  {restore?<><Text>Restore {restore.families.length} families and {restore.saved.length} plans? This replaces planning data on this device.</Text><Button label="Replace device data with this backup" disabled={busy} onPress={()=>{state.replace(restore);setRestore(null);setMessage('Backup restored.');}}/><Button label="Keep device data" variant="ghost" onPress={()=>setRestore(null)}/></>:null}
  <Text variant="heading3">Connect a friend’s family</Text>
  <Text variant="bodySmall">Creating or accepting a code shares your family label, approximate area (rounded to about 1km), children’s ages and venue preferences with that family. It does not share children’s names or addresses. Codes expire after seven days and can be used once.</Text>
  <View style={s.row}><Switch accessibilityLabel="Also share home busy times" value={shareAvailability} onValueChange={setShareAvailability}/><Text>Also share home busy times</Text></View><Text variant="bodySmall">Optional: shares the start and length of home routines as “Home time”, without the child’s name or whether it is a nap or feed. This lets the planner respect both families’ availability.</Text>
  {!mine?<Text>Add your own family first.</Text>:null}
  <Button label="Create a connection code with these shared details" disabled={busy||!mine} onPress={()=>void run(async()=>{const result=await api('POST',{action:'create',family:{...mine,shareAvailability}});setInvite(result.code);await refresh();})}/>
  {invite?<><Text selectable>{invite}</Text><Button label="Share this code" variant="outline" onPress={()=>void run(async()=>{await Share.share({message:`Connect our families in FamilyPilot. In Plans → Families & routines, enter this one-use code: ${invite}`});})}/></>:null}
  <Field label="Code from a friend" value={code} onChange={setCode}/>
  <Button label="Accept and share my planning details" disabled={busy||!mine||!code.trim()} onPress={()=>void run(async()=>{await api('POST',{action:'accept',code:code.trim(),family:{...mine,shareAvailability}});setCode('');await refresh();setMessage('Connected. Load the family below to plan together.');})}/>
  <Button label="Refresh connections" variant="outline" disabled={busy} onPress={()=>void run(refresh)}/>
  {connections.map(c=><View key={c.id} style={{gap:8}}><Text variant="heading3">{c.pending?'Invitation waiting':c.family?.label}</Text>{c.pending?<Text variant="bodySmall">Expires {c.expiresAt.slice(0,10)}</Text>:<><Text variant="bodySmall">Shared preferences are a snapshot. Ask your friend for updated timings before planning. Only explicitly shared home busy times are included.</Text><Button label="Add shared family to this device" variant="outline" onPress={()=>{if(c.family){state.setFamily({...c.family,id:`connected-${c.id}`});setMessage('Family added. Confirm routines together before finalising a plan.');}}}/></>}
   <Button label={c.pending?'Cancel invitation':'Disconnect family'} variant="ghost" disabled={busy} onPress={()=>void run(async()=>{await api('DELETE',{id:c.id});state.removeFamily(`connected-${c.id}`);await refresh();setMessage('Connection removed. Previously shared copies on another device cannot be recalled.');})}/>
  </View>)}
  <Button label="Delete my cloud planning backup" variant="ghost" disabled={busy} onPress={()=>void run(async()=>{const {error}=await supabase!.from('planning_workspaces').delete().eq('user_id',user);if(error)throw error;setMessage('Cloud backup deleted. Device plans are unchanged.');})}/>
  <Button label="Sign out" variant="outline" disabled={busy} onPress={()=>void run(async()=>{const {error}=await supabase!.auth.signOut();if(error)throw error;setMessage('Signed out. Device plans remain here; clear them before sharing this device.');})}/>
 </>}
 <Button label="Clear planning data on this device" variant="ghost" onPress={()=>setClearConfirm(true)}/>{clearConfirm?<><Text>This removes this device’s planning families, routines and saved plans. It does not delete your account or cloud backup.</Text><Button label="Confirm clear device planning data" onPress={()=>{state.clear();setClearConfirm(false);setMessage('Device planning data cleared.');}}/><Button label="Cancel" variant="ghost" onPress={()=>setClearConfirm(false)}/></>:null}
 {message?<Text accessibilityRole="alert">{message}</Text>:null}
 </View>;
}
