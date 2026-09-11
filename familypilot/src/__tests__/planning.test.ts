import { describe,it,expect } from 'vitest';
import { clockMinutes, planVenue, sharePlanText, PlanningFamily, PlanningOptions } from '@/src/services/planning/planner';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { addMeal, PlanningResult } from '@/src/services/planning/recommendations';

const now=new Date('2026-09-10T08:00:00');
const family:PlanningFamily={id:'a',label:'Family A',area:'Town',latitude:51.6,longitude:-0.3,ages:[3,0],maxDriveMinutes:45,budgetTier:'moderate',pushchair:true,required:['babyChanging'],routines:[]};
const options:PlanningOptions={date:'2026-09-10',leaveAt:'09:00',returnBy:'',visitMinutes:60,bufferMinutes:15,environment:'either'};
const facts:MatchableVenueFacts={placeId:'test',name:'Test venue',category:'park',driveMinutes:20,enrichmentStatus:'verified',minRecommendedAge:0,maxRecommendedAge:10,toilets:'yes',babyChanging:'yes',parking:'yes',pushchairSuitability:'good',environment:'outdoor',energyLevel:'moderate',visitDurationMinutes:60,estimatedSpend:'Free',goodToKnow:[],warnings:[],openingStatus:'unknown'};
const journeys={a:{outbound:20,inbound:25,source:'estimated' as const}};
describe('family planning',()=>{
 it('calculates outbound, buffer, visit and asymmetric return',()=>{const p=planVenue(facts,[family],journeys,options,now)!;expect(p.timings[0].depart).toBe(540);expect(p.start).toBe(575);expect(p.timings[0].home).toBe(675);});
 it('gets home before a nap when there is room',()=>{const p=planVenue(facts,[{...family,routines:[{id:'nap',label:'Nap',kind:'nap',time:'12:00',durationMinutes:60,atHome:true}]}],journeys,options,now)!;expect(p.timings[0].home).toBeLessThanOrEqual(720);expect(p.timings[0].notes[0]).toContain('12:00');});
 it('moves an outing after a home feed rather than delaying the feed',()=>{const p=planVenue(facts,[{...family,routines:[{id:'feed',label:'Feed',kind:'feed',time:'09:30',durationMinutes:30,atHome:true}]}],journeys,options,now)!;expect(p.timings[0].depart).toBeGreaterThanOrEqual(600);});
 it('rejects a schedule that cannot fit a home deadline',()=>{expect(planVenue(facts,[family],journeys,{...options,returnBy:'10:00'},now)).toBeNull();});
 it('synchronises arrivals and measures fairness',()=>{const b={...family,id:'b',label:'Family B'};const p=planVenue(facts,[family,b],{...journeys,b:{outbound:35,inbound:30,source:'estimated'}},options,now)!;expect(p.timings[0].arrive).toBe(p.timings[1].arrive);expect(p.fairnessGap).toBe(15);expect(p.timings[0].depart-p.timings[1].depart).toBe(15);});
 it('checks return travel against each family’s limit',()=>{expect(planVenue(facts,[family],{a:{outbound:20,inbound:60,source:'estimated'}},options,now)).toBeNull();});
 it('does not substitute unknown required facilities',()=>{expect(planVenue({...facts,babyChanging:'unknown'},[family],journeys,options,now)).toBeNull();});
 it('requires a confirmed range for every child, not overlapping ages',()=>{expect(planVenue({...facts,minRecommendedAge:2},[family],journeys,options,now)).toBeNull();});
 it('rejects a nonfinite journey instead of recommending it',()=>{expect(planVenue(facts,[family],{a:{outbound:NaN,inbound:10,source:'estimated'}},options,now)).toBeNull();});
 it('flags an out-of-home feed without inventing facilities',()=>{const p=planVenue(facts,[{...family,routines:[{id:'feed',label:'Feed',kind:'feed',time:'10:00',durationMinutes:20,atHome:false}]}],journeys,options,now)!;expect(p.timings[0].notes.join(' ')).toContain('check facilities');});
 it('does not schedule driving during an out-of-home feed',()=>{const p=planVenue(facts,[{...family,routines:[{id:'feed',label:'Feed',kind:'feed',time:'09:15',durationMinutes:30,atHome:false}]}],journeys,options,now)!;expect(p.timings[0].depart).toBeGreaterThanOrEqual(585);});
 it('rejects invalid times and dates',()=>{expect(()=>clockMinutes('25:90')).toThrow();expect(()=>planVenue(facts,[family],journeys,{...options,date:'2026-02-31'},now)).toThrow();});
 it('does not propose a departure in the past today',()=>{const p=planVenue(facts,[family],journeys,options,new Date('2026-09-10T11:00:00'))!;expect(p.timings[0].depart).toBeGreaterThanOrEqual(660);});
 it('never shares private locations or routine notes in a plan summary',()=>{const p=planVenue(facts,[family],journeys,options,now)!;p.timings[0].notes=['Private baby feed'];const text=sharePlanText(p,options.date);expect(text).not.toContain('Private baby feed');expect(text).not.toContain('Town');expect(text).not.toContain('51.6');});
});

describe('connection snapshot consent',()=>{
 it('strips private fields and rounds coordinates',async()=>{
  const {safeSnapshot}=await import('../../../api/planning/connections.js');
  const result=safeSnapshot({...family,latitude:51.64321,longitude:-0.36789,address:'Private street',childName:'Private child',routines:[{id:'feed',label:'Private feed',time:'12:00',durationMinutes:30,atHome:true}]});
  expect(result.latitude).toBe(51.64);expect(result.longitude).toBe(-0.37);expect(result.routines).toEqual([]);expect(JSON.stringify(result)).not.toContain('Private');
 });
 it('shares only anonymous home windows with explicit consent',async()=>{
  const {safeSnapshot}=await import('../../../api/planning/connections.js');
  const result=safeSnapshot({...family,shareAvailability:true,routines:[{id:'feed',label:'Private feed',time:'12:00',durationMinutes:30,atHome:true},{id:'out',time:'14:00',durationMinutes:20,atHome:false}]});
  expect(result.routines).toHaveLength(1);expect(result.routines[0].label).toBe('Home time');expect(result.routines[0].time).toBe('12:00');expect(JSON.stringify(result)).not.toContain('Private feed');
 });
 it('rejects malformed coordinates',async()=>{const {safeSnapshot}=await import('../../../api/planning/connections.js');expect(()=>safeSnapshot({...family,latitude:NaN})).toThrow();});
});

describe('lunch planning',()=>{
 const future={...options,date:'2099-09-10'};
 const food={id:'food',name:'Test café',latitude:family.latitude,longitude:family.longitude,metres:500,facts:[],unknowns:[]};
 function result():PlanningResult{return {plan:planVenue(facts,[family],journeys,future,now)!,place:{familypilotId:'test',externalId:'test',provider:'google',name:'Test venue',latitude:family.latitude,longitude:family.longitude,category:'park',photos:[],provenance:{},fetchedAt:'2099-09-10',familyMetadata:{familypilotPlaceId:'test',enrichmentStatus:'verified',minRecommendedAge:0,maxRecommendedAge:10,familyFacilities:{babyChanging:'yes'},provenance:{},updatedAt:'2099-09-10'}},food:[],foodStatus:''};}
 it('includes a meal and transfer in the new schedule',()=>{const original=result();const next=addMeal(original,food,[family],future);expect(next.meal?.duration).toBe(45);expect(next.plan.end-next.plan.start).toBe(116);});
 it('rejects a meal that misses the home deadline',()=>{expect(()=>addMeal(result(),food,[family],{...future,returnBy:'11:30'})).toThrow(/Lunch does not fit/);});
});
