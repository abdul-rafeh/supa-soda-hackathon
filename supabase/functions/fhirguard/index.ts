import { evaluate, fixtures } from '../_shared/engine.js';
import { checkSize, readJsonResponse, sourceUrl, MAX_BYTES } from '../_shared/imports.js';

const projectUrl = Deno.env.get('SUPABASE_URL');
const publishableKeys = Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}'));
const legacyAnon = Deno.env.get('SUPABASE_ANON_KEY');
if (legacyAnon) publishableKeys.push(legacyAnon);
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const serverKey = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const allowedOrigins = new Set([
  'https://fhirguard-integrity-lab.arafeh-rana.chatgpt.site',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174'
]);
const allowedSourceHosts = new Set(['hapi.fhir.org', 'raw.githubusercontent.com']);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function rpc(name, args = {}) {
  const response = await fetch(projectUrl + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {
      apikey: serverKey,
      ...(serverKey.startsWith('eyJ') ? { Authorization: 'Bearer ' + serverKey } : {}),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (error.code === '22023') throw new HttpError(409, 'Request id already belongs to a different payload.');
    console.error('Database operation failed', name, response.status, error.code);
    throw new HttpError(503, 'Database operation failed. Check history before retrying.');
  }
  return response.json();
}

async function bodyJson(request) {
  // JSON escaping can expand a raw document to six times its byte length.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'A JSON request body is required.');
  let size = 0;
  let body = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES * 6 + 4096) throw new HttpError(413, 'Request is too large.');
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  try {
    const data = JSON.parse(body);
    if (!data || Array.isArray(data) || typeof data !== 'object') throw Error();
    return data;
  } catch {
    throw new HttpError(400, 'Send a JSON object as the request body.');
  }
}

async function persist(data) {
  if (typeof data.raw !== 'string') throw new HttpError(400, 'raw must contain the original JSON text.');
  try { checkSize(data.raw); } catch (error) { throw new HttpError(413, error.message); }
  const source = data.source || { kind: 'manual', name: 'API submission' };
  if (!['manual', 'file', 'url'].includes(source.kind) || typeof source.name !== 'string' || source.name.length > 2048) {
    throw new HttpError(400, 'Invalid source metadata.');
  }
  const cleanSource = { kind: source.kind, name: source.name };
  let scope = 'uploads';
  if (source.kind === 'url') {
    try { scope = new URL(sourceUrl(source.name)).origin; }
    catch (error) { throw new HttpError(400, error.message); }
  }
  const event = evaluate(data.raw, []);
  if (data.requestId !== undefined) {
    if (typeof data.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.requestId)) {
      throw new HttpError(400, 'requestId must be a UUID.');
    }
    event.eventId = data.requestId;
  }
  event.source = cleanSource;
  let resource = null;
  try { resource = JSON.parse(data.raw); } catch { /* Stored as a structural quarantine. */ }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([data.raw, cleanSource])));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return rpc('fhirguard_store_event', { p_event: event, p_resource: resource, p_scope: scope, p_hash: hash });
}

async function preview(data) {
  let url;
  try { url = new URL(sourceUrl(data.url)); }
  catch { throw new HttpError(400, 'Provide a full HTTPS URL without credentials.'); }
  if (url.port || !allowedSourceHosts.has(url.hostname)) {
    throw new HttpError(400, 'URL imports currently support hapi.fhir.org and raw.githubusercontent.com.');
  }
  if (url.hostname === 'hapi.fhir.org' && !/^\/baseR4\/(Patient|Observation)(\/[A-Za-z0-9.-]+)?$/.test(url.pathname)) {
    throw new HttpError(400, 'Use a HAPI R4 Patient or Observation endpoint.');
  }
  try {
    const response = await fetch(url.href, {
      headers: { Accept: 'application/fhir+json, application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(8000)
    });
    return { raw: await readJsonResponse(response) };
  } catch (error) {
    throw new HttpError(502, 'Could not fetch source JSON. ' + error.message);
  }
}

Deno.serve(async request => {
  const origin = request.headers.get('Origin');
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    ...(origin && allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {})
  };
  const respond = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (origin && !allowedOrigins.has(origin)) return respond({ error: 'Origin is not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const key = request.headers.get('apikey');
  if (!key || !publishableKeys.includes(key)) return respond({ error: 'A valid project API key is required.' }, 401);
  try {
    if (!projectUrl || !serverKey) throw new HttpError(503, 'Database configuration is unavailable.');
    const path = new URL(request.url).pathname.replace(/^.*\/fhirguard/, '') || '/';
    if (request.method === 'GET' && path === '/dashboard') return respond(await rpc('fhirguard_dashboard'));
    if (request.method !== 'POST') return respond({ error: 'Route not found.' }, 404);
    const data = await bodyJson(request);
    if (path === '/validate') return respond(await persist(data));
    if (path === '/fetch-url') return respond(await preview(data));
    if (path === '/ingest') {
      const events = [];
      for (const resource of fixtures) {
        events.push(await persist({ raw: JSON.stringify(resource), source: { kind: 'manual', name: 'Synthetic demo batch' } }));
      }
      return respond({ events });
    }
    return respond({ error: 'Route not found.' }, 404);
  } catch (error) {
    return respond({ error: error instanceof HttpError ? error.message : 'Unexpected gateway error. Check history before retrying.' }, error instanceof HttpError ? error.status : 500);
  }
});
