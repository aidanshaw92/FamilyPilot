import { Ionicons } from '@expo/vector-icons';
import { MyVisitReports } from './VisitFeedback';
import { useEffect, useState } from 'react';
import { Share, StyleSheet, Switch, View } from 'react-native';
import { Button, Card, Chip, SectionHeader, Text } from '@/src/components/ui';
import { supabase } from '@/src/services/supabase/client';
import { colors, radius, spacing } from '@/src/design-system/tokens';
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
 const [authMode,setAuthMode]=useState<'signin'|'signup'>('signin');
 useEffect(()=>{if(!supabase)return;void supabase.auth.getSession().then(({data})=>setUser(data.session?.user.id??null));const {data}=supabase.auth.onAuthStateChange((event,session)=>{setUser(session?.user.id??null);setConnections([]);setRestore(null);setInvite('');if(event==='PASSWORD_RECOVERY')setRecovering(true);});return()=>data.subscription.unsubscribe();},[]);
 async function run(action:()=>Promise<void>){setBusy(true);setMessage('');try{await action();}catch(e){setMessage(e instanceof Error?e.message:'Something went wrong.');}finally{setBusy(false);}}
 async function api(method='GET',body?:unknown){const {data}=await supabase!.auth.getSession();if(!data.session)throw new Error('Please sign in.');const r=await fetch(planningApiUrl('connections'),{method,headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await r.json();if(!r.ok)throw new Error(result.error||'Connections unavailable');return result;}
 async function refresh(){const result=await api();setConnections(result.connections);}
 // Load existing connections as soon as we know who's signed in, so returning users
 // see their friends immediately instead of an empty list until they tap Refresh.
 useEffect(()=>{if(user)void run(refresh);},[user]);
 if(!supabase)return <Card style={styles.card}><Text variant="heading3">Connect with friends</Text><Text color={colors.text.secondary}>Account connections need to be enabled by the app owner. You can already plan together on one phone.</Text></Card>;
 return <View style={styles.stack}>
  <Card style={[styles.card,styles.introCard]}>
   <View style={styles.introIcon}><Ionicons name="people-circle-outline" size={28} color={colors.primary[500]}/></View>
   <Text variant="heading2">Plan days out with friends</Text>
   <Text color={colors.text.secondary}>Connect with another family to share routines, plan a day that works for both of you, and see who’s coming.</Text>
  </Card>

  {!user?<Card style={styles.card}>
   <Text variant="heading3">{authMode==='signin'?'Sign in':'Create your account'}</Text>
   <Text variant="bodySmall" color={colors.text.secondary}>Sign in to connect with friends and back up your plans. Your device already works without an account.</Text>
   <View style={s.row}><Chip label="Sign in" active={authMode==='signin'} onPress={()=>setAuthMode('signin')}/><Chip label="Create account" active={authMode==='signup'} onPress={()=>setAuthMode('signup')}/></View>
   <Field label="Email" value={email} onChange={setEmail}/><Field label="Password" value={password} onChange={setPassword} secure/>
   {authMode==='signin'?<>
    <Button label="Sign in" disabled={busy} onPress={()=>void run(async()=>{const {error}=await supabase!.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;setPassword('');setMessage('Signed in. Device data has not been automatically uploaded.');})}/>
    <Button label="Forgot password?" variant="ghost" size="sm" disabled={busy||!email.trim()} onPress={()=>void run(async()=>{const {error}=await supabase!.auth.resetPasswordForEmail(email.trim(),{redirectTo:typeof window!=='undefined'?`${window.location.origin}/trips`:undefined});if(error)throw error;setMessage('If an account exists, check your email for a recovery link.');})}/>
   </>:<Button label="Create account" disabled={busy} onPress={()=>void run(async()=>{if(password.length<10)throw new Error('Use a password with at least 10 characters.');const {data,error}=await supabase!.auth.signUp({email:email.trim(),password});if(error)throw error;setPassword('');setMessage(data.session?'Account created.':'Check your email to confirm your account, then sign in.');})}/>}
  </Card>:<>
   <Card style={styles.card}>
    <Text variant="heading3">Your account</Text>
    <Text variant="bodySmall" color={colors.text.secondary}>Signed in. Backups are private to your account. This device’s data is separate until you choose to upload or restore it.</Text>
    {recovering?<><Field label="New password" value={password} onChange={setPassword} secure/><Button label="Save new password" disabled={busy} onPress={()=>void run(async()=>{if(password.length<10)throw new Error('Use at least 10 characters.');const {error}=await supabase!.auth.updateUser({password});if(error)throw error;setPassword('');setRecovering(false);setMessage('Password updated.');})}/></>:null}
    <Button label="Back up this device’s plans and routines" variant="outline" disabled={busy} onPress={()=>void run(async()=>{const {error}=await supabase!.from('planning_workspaces').upsert({user_id:user,data:{families:state.families,options:state.options,saved:state.saved},updated_at:new Date().toISOString()});if(error)throw error;setMessage('Private backup saved. This replaces the previous cloud backup.');})}/>
    <Button label="Check my cloud backup" variant="ghost" disabled={busy} onPress={()=>void run(async()=>{const {data,error}=await supabase!.from('planning_workspaces').select('data').eq('user_id',user).maybeSingle();if(error)throw error;if(!data)throw new Error('No cloud backup yet.');if(!Array.isArray(data.data?.families)||!Array.isArray(data.data?.saved)||!data.data?.options)throw new Error('This backup cannot be restored.');setRestore(data.data as PlanningData);})}/>
    {restore?<View style={styles.noticeBox}><Text variant="bodySmall">Restore {restore.families.length} families and {restore.saved.length} plans? This replaces planning data on this device.</Text><Button label="Replace device data with this backup" disabled={busy} onPress={()=>{state.replace(restore);setRestore(null);setMessage('Backup restored.');}}/><Button label="Keep device data" variant="ghost" onPress={()=>setRestore(null)}/></View>:null}
   </Card>

   <MyVisitReports key={user}/>

   <Card style={styles.card}>
    <Text variant="heading3">Connect a friend’s family</Text>
    <Text variant="bodySmall" color={colors.text.secondary}>Creating or accepting a code shares your family label, approximate area (rounded to about 1km), children’s ages and venue preferences with that family. It does not share children’s names or addresses. Codes expire after seven days and can be used once.</Text>
    <View style={s.row}><Switch accessibilityLabel="Also share home busy times" value={shareAvailability} onValueChange={setShareAvailability}/><Text>Also share home busy times</Text></View>
    <Text variant="bodySmall" color={colors.text.secondary}>Optional: shares the start and length of home routines as “Home time”, without the child’s name or whether it is a nap or feed. This lets the planner respect both families’ availability.</Text>
    {!mine?<View style={styles.noticeBox}><Text variant="bodySmall">Add your own family under Families &amp; routines first.</Text></View>:null}
    <Button label="Create a connection code" disabled={busy||!mine} onPress={()=>void run(async()=>{const result=await api('POST',{action:'create',family:{...mine,shareAvailability}});setInvite(result.code);await refresh();})}/>
    {invite?<View style={styles.inviteBox}>
     <Text variant="label">Your code</Text>
     <Text variant="heading2" style={styles.inviteCode} selectable>{invite}</Text>
     <Button label="Share this code" variant="outline" size="sm" onPress={()=>void run(async()=>{await Share.share({message:`Connect our families in FamilyPilot. In Plans → Families & routines, enter this one-use code: ${invite}`});})}/>
    </View>:null}
    <Field label="Code from a friend" value={code} onChange={setCode}/>
    <Button label="Accept and share my planning details" variant="outline" disabled={busy||!mine||!code.trim()} onPress={()=>void run(async()=>{await api('POST',{action:'accept',code:code.trim(),family:{...mine,shareAvailability}});setCode('');await refresh();setMessage('Connected. Load the family below to plan together.');})}/>
   </Card>

   <Card style={styles.card}>
    <SectionHeader title="Connections" actionLabel="Refresh" onAction={()=>void run(refresh)}/>
    {!connections.length?<Text variant="bodySmall" color={colors.text.secondary}>No connections yet. Create or accept a code above to connect with a friend’s family.</Text>:connections.map((c,i)=>
     <View key={c.id} style={[styles.connectionRow,i>0&&styles.connectionRowBorder]}>
      <View style={styles.connectionHeader}>
       <Text variant="heading3" style={styles.connectionLabel} numberOfLines={1}>{c.pending?'Invitation waiting':c.family?.label}</Text>
       <View style={[styles.badge,c.pending?styles.badgePending:styles.badgeConnected]}>
        <Text variant="caption" color={c.pending?colors.warning[600]:colors.secondary[600]}>{c.pending?'Pending':'Connected'}</Text>
       </View>
      </View>
      {c.pending?<Text variant="bodySmall" color={colors.text.secondary}>Expires {c.expiresAt.slice(0,10)}</Text>:<>
       <Text variant="bodySmall" color={colors.text.secondary}>Shared preferences are a snapshot. Ask your friend for updated timings before planning. Only explicitly shared home busy times are included.</Text>
       <Button label="Add shared family to this device" variant="outline" size="sm" onPress={()=>{if(c.family){state.setFamily({...c.family,id:`connected-${c.id}`});setMessage('Family added. Confirm routines together before finalising a plan.');}}}/>
      </>}
      <Button label={c.pending?'Cancel invitation':'Disconnect family'} variant="ghost" size="sm" disabled={busy} onPress={()=>void run(async()=>{await api('DELETE',{id:c.id});state.removeFamily(`connected-${c.id}`);await refresh();setMessage('Connection removed. Previously shared copies on another device cannot be recalled.');})}/>
     </View>)}
   </Card>

   <Card style={styles.card}>
    <Text variant="heading3">Account actions</Text>
    <Button label="Delete my cloud planning backup" variant="ghost" disabled={busy} onPress={()=>void run(async()=>{const {error}=await supabase!.from('planning_workspaces').delete().eq('user_id',user);if(error)throw error;setMessage('Cloud backup deleted. Device plans are unchanged.');})}/>
    <Button label="Sign out" variant="outline" disabled={busy} onPress={()=>void run(async()=>{const {error}=await supabase!.auth.signOut();if(error)throw error;setMessage('Signed out. Device plans remain here; clear them before sharing this device.');})}/>
   </Card>
  </>}

  <Card style={styles.card}>
   <Text variant="heading3">Device data</Text>
   <Text variant="bodySmall" color={colors.text.secondary}>Removes this device’s planning families, routines and saved plans. Does not delete your account or cloud backup.</Text>
   {!clearConfirm?<Button label="Clear planning data on this device" variant="ghost" onPress={()=>setClearConfirm(true)}/>:<>
    <Button label="Confirm clear device planning data" onPress={()=>{state.clear();setClearConfirm(false);setMessage('Device planning data cleared.');}}/>
    <Button label="Cancel" variant="ghost" onPress={()=>setClearConfirm(false)}/>
   </>}
  </Card>

  {message?<Text accessibilityRole="alert" color={colors.warning[600]}>{message}</Text>:null}
 </View>;
}

const styles=StyleSheet.create({
 stack:{gap:spacing.lg},
 card:{gap:spacing.md},
 introCard:{alignItems:'flex-start',gap:spacing.sm},
 introIcon:{width:48,height:48,borderRadius:radius.full,backgroundColor:colors.primary[50],alignItems:'center',justifyContent:'center'},
 noticeBox:{gap:spacing.sm,padding:spacing.md,backgroundColor:colors.primary[50],borderRadius:radius.md},
 inviteBox:{gap:spacing.sm,padding:spacing.lg,backgroundColor:colors.primary[50],borderRadius:radius.md,alignItems:'center'},
 inviteCode:{letterSpacing:2},
 connectionRow:{gap:spacing.sm,paddingTop:spacing.md},
 connectionRowBorder:{borderTopWidth:1,borderColor:colors.border,marginTop:spacing.sm},
 connectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:spacing.sm},
 connectionLabel:{flex:1},
 badge:{paddingHorizontal:spacing.sm,paddingVertical:2,borderRadius:radius.full},
 badgePending:{backgroundColor:colors.warning[50]},
 badgeConnected:{backgroundColor:colors.secondary[50]},
});
