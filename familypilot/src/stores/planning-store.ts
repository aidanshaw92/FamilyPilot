import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { PlanningFamily, PlanningOptions, PlanMatch } from '@/src/services/planning/planner';
import { PlanViewModelInput } from '@/src/services/planning/plan-view-model';

/** `skipped` with `reason: 'did_not_go'` is "No, we didn't go": nothing is asked and nothing is sent. */
export interface VisitFeedbackState { status:'submitted'|'skipped'|'later'; reportId?:string; until?:string; reason?:'did_not_go'|'nothing_to_check' }
export interface SavedPlan { feedback?:VisitFeedbackState; id: string; date: string; plan: PlanMatch; checked: string[]; createdAt: string }

/**
 * A multi-stop day a parent saved from the Plan screen.
 *
 * Stores what the planner answered -- the itinerary, the travel diagnostics, the caveats and the
 * anchor's parking -- rather than the rendered screen. Re-opening a saved day runs the same adapter
 * over the same input, so it reads exactly as it did, and a later change to how a day is worded
 * reaches saved days too instead of leaving them frozen in an old vocabulary.
 *
 * Separate from `saved`, which holds the older single-venue `PlanMatch`. Squeezing a three-stop day
 * into that shape would lose the stops it has.
 */
export interface SavedDay { id: string; createdAt: string; source: PlanViewModelInput }
export interface PlanningData { families: PlanningFamily[]; options: PlanningOptions; saved: SavedPlan[]; savedDays: SavedDay[] }
/** What a restored backup may look like: one taken before multi-stop days carries no `savedDays`. */
export type PlanningBackup = Omit<PlanningData, 'savedDays'> & { savedDays?: SavedDay[] };
const defaults = (): PlanningData => ({ families: [], options: { date: localDate(), leaveAt:'',returnBy:'',visitMinutes:90,bufferMinutes:15,environment:'either' }, saved:[], savedDays:[] });
export function localTime() { const d=new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
export function localDate() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
interface PlanningState extends PlanningData {
  setFeedback:(id:string,feedback:VisitFeedbackState)=>void;
  hydrated: boolean; setFamily:(f:PlanningFamily)=>void; removeFamily:(id:string)=>void;
  setOptions:(o:Partial<PlanningOptions>)=>void; savePlan:(p:SavedPlan)=>void; deletePlan:(id:string)=>void;
  saveDay:(d:SavedDay)=>void; deleteDay:(id:string)=>void;
  togglePacked:(id:string,item:string)=>void; replace:(data:PlanningBackup)=>void; clear:()=>void;
}
/** Where the planning state is persisted (AsyncStorage key), so a save can be confirmed by reading it back. */
export const PLANNING_STORAGE_KEY = 'familypilot-planning-v1';
export const usePlanningStore=create<PlanningState>()(persist((set)=>({
  ...defaults(),hydrated:false,
  setFeedback:(id,feedback)=>set(s=>({saved:s.saved.map(p=>p.id===id?{...p,feedback}:p)})),
  setFamily:f=>set(s=>({families:[...s.families.filter(x=>x.id!==f.id),f]})),
  removeFamily:id=>set(s=>({families:s.families.filter(f=>f.id!==id)})),
  setOptions:o=>set(s=>({options:{...s.options,...o}})),
  savePlan:p=>set(s=>({saved:[{...p,feedback:s.saved.find(x=>x.id===p.id)?.feedback},...s.saved.filter(x=>x.id!==p.id)]})),
  deletePlan:id=>set(s=>({saved:s.saved.filter(p=>p.id!==id)})),
  saveDay:d=>set(s=>({savedDays:[d,...s.savedDays.filter(x=>x.id!==d.id)]})),
  deleteDay:id=>set(s=>({savedDays:s.savedDays.filter(d=>d.id!==id)})),
  togglePacked:(id,item)=>set(s=>({saved:s.saved.map(p=>p.id===id?{...p,checked:p.checked.includes(item)?p.checked.filter(x=>x!==item):[...p.checked,item]}:p)})),
  // A backup taken before multi-stop days existed has no `savedDays`. Spreading it as-is would set
  // the array to undefined and break every reader, so the field is defaulted on the way in.
  replace:data=>set({...data,savedDays:data.savedDays??[]}),clear:()=>set(defaults()),
}),{name:PLANNING_STORAGE_KEY,skipHydration:Platform.OS==='web'&&typeof window==='undefined',storage:createJSONStorage(()=>AsyncStorage),partialize:({families,options,saved,savedDays})=>({families,options,saved,savedDays}),onRehydrateStorage:()=>()=>usePlanningStore.setState({hydrated:true})}));
