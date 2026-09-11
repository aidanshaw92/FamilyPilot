import { placesApiClient } from '@/src/services/places/places-api-client';
import { contextApiClient } from '@/src/services/context/context-api-client';
import { estimateDriveMinutes, distanceKm } from '@/src/services/places/geo-utils';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { ExternalPlaceRecord } from '@/src/types/places';
import { Journey, PlanMatch, PlanningFamily, PlanningOptions, planVenue } from './planner';

export interface FoodOption { id: string; name: string; latitude:number; longitude:number; website?: string; phone?: string; metres: number; facts: string[]; unknowns: string[] }
export interface PlanningResult { plan: PlanMatch; place: ExternalPlaceRecord; food: FoodOption[]; foodStatus: string; meal?:{name:string;start:number;duration:number;transfer:number}; }
export function planningApiUrl(path: string) {
  const base = process.env.EXPO_PUBLIC_PLANNING_API_URL || (typeof window !== 'undefined' ? `${window.location.origin}/api/planning` : '');
  if (!base) throw new Error('Planning service is not configured for this app.');
  return `${base.replace(/\/$/, '')}/${path}`;
}
export async function locateArea(area: string): Promise<{ area: string; latitude: number; longitude: number }> {
  const response = await fetch(planningApiUrl('location'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ area }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not find that area.'); return data;
}
async function journeyTimes(origin: { latitude: number; longitude: number }, places: ExternalPlaceRecord[]) {
  const values = new Map<string, { driveMinutes: number; source: 'live' | 'estimated' }>();
  for (let i=0;i<places.length;i+=25) {
    const batch = places.slice(i,i+25);
    try {
      const result = await contextApiClient.getDriveTimes(origin, batch.map(p => ({ placeId: p.familypilotId, latitude: p.latitude, longitude: p.longitude })));
      result.journeys.forEach(j => values.set(j.placeId, j));
    } catch { /* Explicitly labelled distance estimate below. */ }
    batch.forEach(p => { if (!values.has(p.familypilotId)) values.set(p.familypilotId, { driveMinutes: estimateDriveMinutes(origin.latitude,origin.longitude,p.latitude,p.longitude), source: 'estimated' }); });
  }
  return values;
}
export async function getFoodNear(place: ExternalPlaceRecord, families: PlanningFamily[]): Promise<{ food: FoodOption[]; foodStatus: string }> {
  try {
    const result = await placesApiClient.search({ latitude: place.latitude, longitude: place.longitude, radiusKm: 3, intent: 'restaurant' });
    if (result.provider === 'mock') return { food: [], foodStatus: 'Live restaurant information is not connected yet.' };
    const food = result.places.filter(p => p.provider !== 'mock' && ['restaurant','cafe'].includes(p.category)).map(p => {
      const metadata = p.familyMetadata;
      const trusted = metadata?.enrichmentStatus === 'verified' || metadata?.enrichmentStatus === 'enriched';
      const facts = trusted ? metadata?.familyFacilities : undefined;
      const requested = [...new Set(families.flatMap(f => f.required).filter(f => f !== 'pushchair'))];
      const unknowns: string[] = [];
      const labels: string[] = [];
      for (const field of ['toilets', 'babyChanging', 'parking'] as const) {
        if (facts?.[field] === 'yes') labels.push(`${field === 'babyChanging' ? 'Baby changing' : field}: confirmed`);
        else if (!facts?.[field] || facts[field] === 'unknown') unknowns.push(`${field === 'babyChanging' ? 'Baby changing' : field}: not confirmed`);
      }
      const needsBuggy = families.some(f => f.required.includes('pushchair'));
      const buggy = trusted ? metadata?.pushchairSuitability : undefined;
      if (buggy === 'good' || buggy === 'excellent') labels.push('Buggy access: confirmed');
      else unknowns.push('Buggy access: not confirmed as easy');
      const meetsRequired = requested.every(f => facts?.[f as 'toilets'|'babyChanging'|'parking'] === 'yes') && (!needsBuggy || buggy === 'good' || buggy === 'excellent');
      return { id:p.familypilotId, name:p.name, latitude:p.latitude,longitude:p.longitude,website:p.website, phone:p.phone, metres:Math.round(distanceKm(place.latitude,place.longitude,p.latitude,p.longitude)*1000), facts:labels, unknowns, meetsRequired };
    }).filter(p => p.metres <= 3000 && p.meetsRequired).sort((a,b) => b.facts.length-a.facts.length || a.metres-b.metres).slice(0,3);
    return { food, foodStatus: food.length ? 'Nearby food options ranked by confirmed facilities, then straight-line distance. Check opening hours, menus and availability.' : 'No nearby food options meet the confirmed facilities you require. Food has not been included in the timing.' };
  } catch { return { food: [], foodStatus: 'Restaurant lookup is unavailable. Food has not been included in the timing.' }; }
}
export function addMeal(result:PlanningResult,food:FoodOption,families:PlanningFamily[],options:PlanningOptions):PlanningResult {
  const transfer=estimateDriveMinutes(result.place.latitude,result.place.longitude,food.latitude,food.longitude)+10;
  const mealMinutes=45;
  const journeys:Record<string,Journey>={};
  families.forEach(f=>{const previous=result.plan.timings.find(t=>t.familyId===f.id)!;journeys[f.id]={outbound:previous.journey.outbound,inbound:estimateDriveMinutes(food.latitude,food.longitude,f.latitude,f.longitude),source:'estimated'};});
  const metadata=result.place.familyMetadata;
  const facts=extractMatchableFacts(result.place.familypilotId,result.place.name,result.place.category,0,metadata?.enrichmentStatus,metadata??null);
  const plan=planVenue(facts,families,journeys,{...options,visitMinutes:options.visitMinutes+transfer+mealMinutes});
  if(!plan)throw new Error('Lunch does not fit everyone’s routines and return time. Try a shorter activity or plan after the next home routine.');
  plan.reasons.push(`Includes ${mealMinutes} minutes at ${food.name} and ${transfer} minutes to transfer and settle in.`);
  return {...result,plan,meal:{name:food.name,start:plan.start+options.visitMinutes+transfer,duration:mealMinutes,transfer}};
}
export async function recommendPlans(families: PlanningFamily[], options: PlanningOptions): Promise<PlanningResult[]> {
  if (!families.length || families.length > 6) throw new Error('Choose between one and six families.');
  if (families.some(f => !Number.isFinite(f.latitude) || !Number.isFinite(f.longitude))) throw new Error('Confirm an area for every family.');
  // Search around every family; a geometric midpoint can miss suitable and fair venues.
  const searches = await Promise.all(families.map(f => placesApiClient.search({ latitude:f.latitude, longitude:f.longitude, radiusKm:Math.min(50,f.maxDriveMinutes*0.8), intent:'explore' })));
  if (searches.some(s => s.provider === 'mock')) throw new Error('Live places are not available. We will not recommend demonstration venues as real plans.');
  const places = [...new Map(searches.flatMap(s => s.places).filter(p=>p.provider !== 'mock').map(p => [p.familypilotId,p])).values()].slice(0,60);
  const outbound = await Promise.all(families.map(f => journeyTimes(f,places)));
  const provisional: Array<{ plan: PlanMatch; place: ExternalPlaceRecord }> = [];
  for (const place of places) {
    const metadata = place.familyMetadata;
    const facts = extractMatchableFacts(place.familypilotId,place.name,place.category,0,metadata?.enrichmentStatus,metadata ?? null,place.isOpen);
    const journeys: Record<string,Journey> = {};
    families.forEach((f,i) => { const j=outbound[i].get(place.familypilotId)!; journeys[f.id]={ outbound:j.driveMinutes, inbound:j.driveMinutes, source:'estimated' }; });
    // Future/return traffic is unknown. Even live outbound estimates do not make a scheduled round trip live.
    const plan = planVenue(facts,families,journeys,options);
    if (plan) provisional.push({ plan,place });
  }
  const selected = provisional.sort((a,b)=>b.plan.score-a.plan.score || a.place.familypilotId.localeCompare(b.place.familypilotId)).slice(0,3);
  return Promise.all(selected.map(async item => ({ ...item,...await getFoodNear(item.place,families) })));
}
