import { useState } from 'react';
import { View, Switch } from 'react-native';
import { Button, Field, TimeField, Text, formStyles } from '@/src/components/ui';
import { Chip } from '@/src/components/ui/Chip';
import { colors } from '@/src/design-system/tokens';
import { PlanningFamily, Routine, clockMinutes } from '@/src/services/planning/planner';
import { locateArea } from '@/src/services/planning/recommendations';

export function FamilyEditor({initial,onSave,onCancel}:{initial:PlanningFamily;onSave:(f:PlanningFamily)=>void;onCancel:()=>void}) {
 const [family,setFamily]=useState(initial);const [ages,setAges]=useState(initial.ages.join(', '));const [area,setArea]=useState(initial.area);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const change=(v:Partial<PlanningFamily>)=>setFamily(f=>({...f,...v}));
 const editRoutine=(id:string,v:Partial<Routine>)=>change({routines:family.routines.map(r=>r.id===id?{...r,...v}:r)});
 async function save(){setBusy(true);setError('');try{
   const parsed=ages.trim()?ages.split(',').map(v=>Number(v.trim())):[];
   if(!family.label.trim()||parsed.some(n=>!Number.isFinite(n)||n<0||n>17)||parsed.length>10)throw new Error('Add a family name and children’s ages from 0 to 17, separated by commas.');
   if(!Number.isFinite(family.maxDriveMinutes)||family.maxDriveMinutes<5||family.maxDriveMinutes>120)throw new Error('Maximum drive must be between 5 and 120 minutes.');
   family.routines.forEach(r=>{clockMinutes(r.time);if(!Number.isFinite(r.durationMinutes)||r.durationMinutes<1||r.durationMinutes>240)throw new Error('Routine lengths must be 1–240 minutes.');});
   const location=area===initial.area&&Number.isFinite(initial.latitude)?{area:initial.area,latitude:initial.latitude,longitude:initial.longitude}:await locateArea(area);
   onSave({...family,...location,ages:parsed,label:family.label.trim()});
 }catch(e){setError(e instanceof Error?e.message:'Could not save family.');}finally{setBusy(false);}}
 return <View style={formStyles.panel}>
   <Text variant="heading2">{initial.id==='mine'?'Your family':'Family planning details'}</Text>
   <Text variant="bodySmall">Use a town or postcode, not a street address. Only add another family’s details with their agreement.</Text>
   <Field label="Family label" value={family.label} onChange={label=>change({label})}/>
   <Field label="UK town or postcode" value={area} onChange={setArea}/>
   <Field label="Children’s ages (0 for under one)" value={ages} onChange={setAges} placeholder="3, 0"/>
   <Field label="Maximum drive each way in minutes" value={String(family.maxDriveMinutes)} onChange={v=>change({maxDriveMinutes:Number(v)})}/>
   <Text variant="bodySmall">Budget preference</Text><View style={formStyles.row}>{(['budget','moderate','premium'] as const).map(b=><Chip key={b} label={b} active={family.budgetTier===b} onPress={()=>change({budgetTier:b})}/>)}</View>
   <View style={formStyles.row}><Switch accessibilityLabel="Bringing a buggy" value={family.pushchair} onValueChange={pushchair=>change({pushchair})}/><Text>Bringing a buggy</Text></View>
   <Text variant="bodySmall">Must-have facilities (unknown details exclude a place)</Text>
   <View style={formStyles.row}>{(['toilets','babyChanging','parking','pushchair'] as const).map(field=><Chip key={field} label={{toilets:'Toilets',babyChanging:'Baby changing',parking:'Parking',pushchair:'Buggy access'}[field]} active={family.required.includes(field)} onPress={()=>change({required:family.required.includes(field)?family.required.filter(x=>x!==field):[...family.required,field]})}/>)}</View>
   <Text variant="heading3">Usual feeds and naps</Text>
   <Text variant="bodySmall">Times apply on the day you plan. Adjust them for that day. These are planning preferences; always follow your baby’s cues.</Text>
   {family.routines.map(r=><View key={r.id} style={{gap:10,borderTopWidth:1,borderColor:colors.border,paddingTop:12}}>
     <Field label="Routine label" value={r.label} onChange={label=>editRoutine(r.id,{label})}/>
     <View style={formStyles.row}>{(['nap','feed'] as const).map(kind=><Chip key={kind} label={kind==='nap'?'Nap':'Feed'} active={r.kind===kind} onPress={()=>editRoutine(r.id,{kind})}/>)}</View>
     <TimeField label="Time" value={r.time} onChange={time=>editRoutine(r.id,{time})}/>
     <Field label="Duration in minutes" value={String(r.durationMinutes)} onChange={v=>editRoutine(r.id,{durationMinutes:Number(v)})}/>
     <View style={formStyles.row}><Switch accessibilityLabel="Be at home for this routine" value={r.atHome} onValueChange={atHome=>editRoutine(r.id,{atHome})}/><Text>Be at home</Text></View>
     <Button label="Remove routine" variant="ghost" onPress={()=>change({routines:family.routines.filter(x=>x.id!==r.id)})}/>
   </View>)}
   <Button label="Add feed or nap" variant="outline" onPress={()=>change({routines:[...family.routines,{id:`routine-${Date.now()}`,label:'',kind:'nap',time:'13:00',durationMinutes:60,atHome:true}]})}/>
   {error?<Text accessibilityRole="alert" color={colors.warning[600]}>{error}</Text>:null}
   <Button label={busy?'Saving…':'Save family'} disabled={busy} onPress={()=>void save()}/><Button label="Cancel" variant="ghost" disabled={busy} onPress={onCancel}/>
 </View>;
}
