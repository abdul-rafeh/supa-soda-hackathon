import { checkSize, resourcesFrom, sourceUrl } from './imports.js';
const env = import.meta.env || {};
const base = (env.VITE_GATEWAY_URL || '').replace(/\/$/, '');
const projectUrl = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
export const gatewayConfigured = Boolean(base);
export const projectName = env.VITE_SUPABASE_PROJECT_NAME || 'supa-soda-hackathon';
async function request(path,body){
 if (!base) throw Error('Backend in progress. The ingestion gateway is not configured yet.');
 const res=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(publishableKey?{apikey:publishableKey}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 if (res.status === 404) throw Error('Backend endpoint is not deployed yet.');
 if (res.status === 401 || res.status === 403) throw Error('Gateway access is not ready. Check the backend authentication setup.');
 if (!res.ok) {
  const error = await res.json().catch(() => ({}));
  throw Error(error.error || 'Gateway returned HTTP ' + res.status);
 }
 return res.json();
}
function checkEvent(e){
 if(!e||typeof e.eventId!=='string'||typeof e.raw!=='string'||typeof e.type!=='string'||typeof e.resourceId!=='string'||!Array.isArray(e.issues)||!e.issues.every(i=>i&&['stage','path','message'].every(k=>typeof i[k]==='string'))||!['passed','failed'].includes(e.structure)||!['passed','failed','skipped'].includes(e.integrity)||!['accepted','quarantined'].includes(e.outcome)||!Number.isFinite(Date.parse(e.time)))throw Error('Unexpected gateway event format.');
 return e;
}
export async function snapshot() {
 if (!projectUrl || !base) throw Error('Live Supabase configuration is missing.');
 if (projectUrl) {
  if (!publishableKey) throw Error('The Supabase publishable key is missing.');
  const response = await fetch(projectUrl + '/auth/v1/settings', {
   headers: { apikey: publishableKey },
   signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw Error('Supabase connection check returned HTTP ' + response.status + '.');
 }
 if (!gatewayConfigured) {
  return { events: [], score: null, connection: 'connected', backend: 'pending' };
 }
 const data = await request('/dashboard');
 if (!Array.isArray(data.events) || !(data.score === null || Number.isFinite(data.score))) {
  throw Error('Unexpected dashboard response.');
 }
 data.events.forEach(checkEvent);
 return { ...data, connection: 'connected', backend: 'ready' };
}
export async function submit(raw, source){
 return checkEvent(await request('/validate',{raw,source,requestId:crypto.randomUUID()}));
}

export async function fetchSource(value) {
 const url=sourceUrl(value);
 const result=await request('/fetch-url',{url});
 if(typeof result.raw!=='string') throw Error('Unexpected source response.');
 return {raw:checkSize(result.raw),url};
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

export async function quality() {
 if (!gatewayConfigured) return {status:'not_configured',reports:[]};
 return request('/quality');
}
