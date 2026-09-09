import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { PlanningFamily, PlanningOptions, PlanMatch } from '@/src/services/planning/planner';

export interface SavedPlan { id: string; date: string; plan: PlanMatch; checked: string[]; createdAt: string }
export interface PlanningData { families: PlanningFamily[]; options: PlanningOptions; saved: SavedPlan[] }
const defaults = (): PlanningData => ({ families: [], options: { date: localDate(), leaveAt:'09:00',returnBy:'',visitMinutes:90,bufferMinutes:15,environment:'either' }, saved:[] });
export function localDate() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
interface PlanningState extends PlanningData {
  hydrated: boolean; setFamily:(f:PlanningFamily)=>void; removeFamily:(id:string)=>void;
  setOptions:(o:Partial<PlanningOptions>)=>void; savePlan:(p:SavedPlan)=>void; deletePlan:(id:string)=>void;
  togglePacked:(id:string,item:string)=>void; replace:(data:PlanningData)=>void; clear:()=>void;
}
export const usePlanningStore=create<PlanningState>()(persist((set)=>({
  ...defaults(),hydrated:false,
  setFamily:f=>set(s=>({families:[...s.families.filter(x=>x.id!==f.id),f]})),
  removeFamily:id=>set(s=>({families:s.families.filter(f=>f.id!==id)})),
  setOptions:o=>set(s=>({options:{...s.options,...o}})),
  savePlan:p=>set(s=>({saved:[p,...s.saved.filter(x=>x.id!==p.id)]})),
  deletePlan:id=>set(s=>({saved:s.saved.filter(p=>p.id!==id)})),
  togglePacked:(id,item)=>set(s=>({saved:s.saved.map(p=>p.id===id?{...p,checked:p.checked.includes(item)?p.checked.filter(x=>x!==item):[...p.checked,item]}:p)})),
  replace:data=>set({...data}),clear:()=>set(defaults()),
}),{name:'familypilot-planning-v1',storage:createJSONStorage(()=>AsyncStorage),partialize:({families,options,saved})=>({families,options,saved}),onRehydrateStorage:()=>()=>usePlanningStore.setState({hydrated:true})}));
