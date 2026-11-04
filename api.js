import {evaluate,fixtures} from './engine.js';
const base=(import.meta.env.VITE_GATEWAY_URL||'').replace(/\/$/,'');
export const live=Boolean(base);
let localEvents=[];
async function request(path,body){
 const res=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?{apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error('Gateway returned HTTP '+res.status);
 return res.json();
}
function checkEvent(e){
 if(!e||typeof e.eventId!=='string'||typeof e.raw!=='string'||typeof e.type!=='string'||typeof e.resourceId!=='string'||!Array.isArray(e.issues)||!e.issues.every(i=>i&&['stage','path','message'].every(k=>typeof i[k]==='string'))||!['passed','failed'].includes(e.structure)||!['passed','failed','skipped'].includes(e.integrity)||!['accepted','quarantined'].includes(e.outcome)||!Number.isFinite(Date.parse(e.time)))throw Error('Unexpected gateway event format.');
 return e;
}
export async function snapshot(){
 if(!live)return {events:[...localEvents],score:null};
 const data=await request('/dashboard');
 if(!Array.isArray(data.events)||!(data.score===null||Number.isFinite(data.score)))throw Error('Unexpected dashboard response.');
 data.events.forEach(checkEvent);return data;
}
export async function submit(raw){
 if(live)return checkEvent(await request('/validate',{raw}));
 const result=evaluate(raw,localEvents);localEvents.unshift(result);return result;
}
export async function ingest(){
 if(live){await request('/ingest',{});return}
 for(const f of fixtures)await submit(JSON.stringify(f,null,2));
}
