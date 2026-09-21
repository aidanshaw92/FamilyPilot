import { describe,it,expect } from 'vitest';
import { clockMinutes, planVenue, sharePlanText, PlanningFamily, PlanningOptions } from '@/src/services/planning/planner';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { addMeal, PlanningResult } from '@/src/services/planning/recommendations';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { VenueFamilyMetadata } from '@/src/types/places';

const now=new Date('2026-09-10T08:00:00');
const family:PlanningFamily={id:'a',label:'Family A',area:'Town',latitude:51.6,longitude:-0.3,ages:[3,0],maxDriveMinutes:45,budgetTier:'moderate',pushchair:true,required:['babyChanging'],routines:[]};
const options:PlanningOptions={date:'2026-09-10',leaveAt:'09:00',returnBy:'',visitMinutes:60,bufferMinutes:15,environment:'either'};
const facts:MatchableVenueFacts={placeId:'test',name:'Test venue',category:'park',driveMinutes:20,enrichmentStatus:'verified',minRecommendedAge:0,maxRecommendedAge:10,venueAgePolicy:null,toilets:'yes',babyChanging:'yes',parking:'yes',pushchairSuitability:'good',environment:'outdoor',energyLevel:'moderate',visitDurationMinutes:60,estimatedSpend:'Free',goodToKnow:[],warnings:[],openingStatus:'unknown'};
const journeys={a:{outbound:20,inbound:25,source:'estimated' as const}};
describe('family planning',()=>{
 it('calculates outbound, buffer, visit and asymmetric return',()=>{const p=planVenue(facts,[family],journeys,options,now)!;expect(p.timings[0].depart).toBe(540);expect(p.start).toBe(575);expect(p.timings[0].home).toBe(675);});
 it('gets home before a nap when there is room',()=>{const p=planVenue(facts,[{...family,routines:[{id:'nap',label:'Nap',kind:'nap',time:'12:00',durationMinutes:60,atHome:true}]}],journeys,options,now)!;expect(p.timings[0].home).toBeLessThanOrEqual(720);expect(p.timings[0].notes[0]).toContain('12:00');});
 it('moves an outing after a home feed rather than delaying the feed',()=>{const p=planVenue(facts,[{...family,routines:[{id:'feed',label:'Feed',kind:'feed',time:'09:30',durationMinutes:30,atHome:true}]}],journeys,options,now)!;expect(p.timings[0].depart).toBeGreaterThanOrEqual(600);});
 it('rejects a schedule that cannot fit a home deadline',()=>{expect(planVenue(facts,[family],journeys,{...options,returnBy:'10:00'},now)).toBeNull();});
 it('synchronises arrivals and measures fairness',()=>{const b={...family,id:'b',label:'Family B'};const p=planVenue(facts,[family,b],{...journeys,b:{outbound:35,inbound:30,source:'estimated'}},options,now)!;expect(p.timings[0].arrive).toBe(p.timings[1].arrive);expect(p.fairnessGap).toBe(15);expect(p.timings[0].depart-p.timings[1].depart).toBe(15);});
 it('checks return travel against each family’s limit',()=>{expect(planVenue(facts,[family],{a:{outbound:20,inbound:60,source:'estimated'}},options,now)).toBeNull();});
 it('does not substitute unknown required facilities',()=>{expect(planVenue({...facts,babyChanging:'unknown'},[family],journeys,options,now)).toBeNull();});
 it('keeps a venue whose recommended range starts above the youngest child',()=>{expect(planVenue({...facts,minRecommendedAge:2},[family],journeys,options,now)).not.toBeNull();});
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

/**
 * Regression: production venues carry no age range at all. Verified against the live database
 * on 2026-09-15 — 0 of 122 place_records had both min_recommended_age and max_recommended_age,
 * and venue_claims held no age-range field key. This fixture mirrors one of those rows
 * (Beckenham Place Park, fp-google-ChIJRfXNwPoBdkgRqdTuM7Baxuw: enriched, facilities confirmed,
 * age range absent) and is built through extractMatchableFacts so it exercises the real
 * production mapping rather than a hand-written facts object.
 */
describe('age suitability policy',()=>{
 const realMetadata:VenueFamilyMetadata={familypilotPlaceId:'fp-google-ChIJRfXNwPoBdkgRqdTuM7Baxuw',enrichmentStatus:'enriched',familyFacilities:{toilets:'yes',playground:'yes',babyChanging:'yes'},provenance:{},updatedAt:'2026-09-01T00:00:00.000Z'};
 const realFacts=(overrides:Partial<VenueFamilyMetadata>={}):MatchableVenueFacts=>extractMatchableFacts('fp-google-ChIJRfXNwPoBdkgRqdTuM7Baxuw','Beckenham Place Park','park',20,'enriched',{...realMetadata,...overrides},undefined);

 it('plans a real venue whose age range was never recorded',()=>{
  const f=realFacts();
  expect(f.minRecommendedAge).toBeNull();
  expect(f.maxRecommendedAge).toBeNull();
  expect(planVenue(f,[family],journeys,options,now)).not.toBeNull();
 });

 it('still reports the missing age range as unconfirmed',()=>{
  const p=planVenue(realFacts(),[family],journeys,options,now)!;
  expect(p.unknowns).toContain('ageRecommendedFit: not confirmed');
 });

 it('keeps a documented range that excludes both children — a recommendation is not a gate',()=>{
  expect(planVenue(realFacts({minRecommendedAge:5,maxRecommendedAge:12}),[family],journeys,options,now)).not.toBeNull();
 });

 it('allows a documented range that covers every child',()=>{
  expect(planVenue(realFacts({minRecommendedAge:0,maxRecommendedAge:8}),[family],journeys,options,now)).not.toBeNull();
 });

 it('never excludes on a lower bound alone',()=>{
  expect(planVenue(realFacts({minRecommendedAge:2}),[family],journeys,options,now)).not.toBeNull();
  expect(planVenue(realFacts({minRecommendedAge:0}),[family],journeys,options,now)).not.toBeNull();
 });

 it('never excludes on an upper bound alone',()=>{
  expect(planVenue(realFacts({maxRecommendedAge:2}),[family],journeys,options,now)).not.toBeNull();
  expect(planVenue(realFacts({maxRecommendedAge:5}),[family],journeys,options,now)).not.toBeNull();
 });

 it('does not gate an adults-only party on an absent range',()=>{
  expect(planVenue(realFacts(),[{...family,ages:[]}],journeys,options,now)).not.toBeNull();
 });

 it('does not claim an age check that did not happen',()=>{
  const p=planVenue(realFacts(),[family],journeys,options,now)!;
  expect(p.reasons[0]).not.toContain('age range checked');
  expect(p.reasons[0]).toContain('Recommended ages are not published');
 });

 it('reports a documented range without claiming it was enforced',()=>{
  const p=planVenue(realFacts({minRecommendedAge:0,maxRecommendedAge:8}),[family],journeys,options,now)!;
  expect(p.reasons[0]).toContain('publishes recommended ages');
  expect(p.reasons[0]).not.toContain('age range checked');
 });

 it('makes no age claim for a party with no children',()=>{
  const p=planVenue(realFacts(),[{...family,ages:[]}],journeys,options,now)!;
  expect(p.reasons[0]).toBe('Required facilities checked for every family.');
 });
});
