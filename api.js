import {evaluate,fixtures} from './engine.js';
import { checkSize, resourcesFrom, sourceUrl, readJsonResponse } from './imports.js';
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
export async function submit(raw, source){
 if(live)return checkEvent(await request('/validate',{raw,source}));
 const result={...evaluate(raw,localEvents),source};localEvents.unshift(result);return result;
}
export async function ingest(){
 if(live){await request('/ingest',{});return}
 for(const f of fixtures)await submit(JSON.stringify(f,null,2));
}


export async function fetchSource(value) {
  const url = sourceUrl(value);
  if (live) {
    const result = await request('/fetch-url', { url });
    if (typeof result.raw !== 'string') throw new Error('Unexpected source response.');
    return { raw: checkSize(result.raw), url };
  }
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/fhir+json, application/json' },
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(15000)
    });
    return { raw: await readJsonResponse(response), url };
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Could not load the URL. Check browser access (CORS), network availability and use a direct URL without redirects.');
    }
    throw error;
  }
}

export async function importDocument(raw, source, onEvent) {
  const resources = resourcesFrom(raw);
  let completed = 0;
  for (const resource of resources) {
    let event;
    try {
      event = await submit(resource, source);
    } catch (error) {
      throw new Error(completed + ' of ' + resources.length + ' records confirmed. ' + error.message + '. Check history before retrying; the last request may have reached the gateway.');
    }
    completed++;
    onEvent(event);
  }
}
