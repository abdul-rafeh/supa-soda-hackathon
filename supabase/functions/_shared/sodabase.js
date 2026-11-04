// Server-only: the token never enters a dashboard response or browser bundle.
const ENDPOINT = 'https://sodabase.io/mcp';
export const watchedTables = ['fhirguard.resources', 'fhirguard.resource_validation', 'fhirguard.trusted_resources'];
const projectUrl = 'https://sodabase.io/projects/dbloynewlgozjpqgkyft';

export async function readRpcResponse(response, id) {
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'auth' : 'upstream');
  if (id === undefined) { await response.body?.cancel(); return; }
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const message = await response.json();
    if (message.id !== id || message.error) throw new Error('protocol');
    return message.result;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', size = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) throw new Error('incomplete');
      size += value.byteLength;
      if (size > 1024 * 1024) throw new Error('too-large');
      buffer += decoder.decode(value, {stream:true});
      buffer = buffer.replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0,end); buffer = buffer.slice(end+2);
        const data = block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
        if (!data) continue;
        const message = JSON.parse(data);
        if (message.id !== id) continue;
        if (message.error) throw new Error('protocol');
        return message.result;
      }
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
}

export async function connectSodabase(token, fetcher = fetch) {
  let session, version = '2025-03-26', sequence = 0;
  const signal = AbortSignal.timeout(10000);
  async function call(method, params, notify = false) {
    const id = notify ? undefined : ++sequence;
    const response = await fetcher(ENDPOINT, {
      method:'POST', redirect:'error', signal,
      headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:'Bearer '+token,
        'MCP-Protocol-Version':version,...(session ? {'Mcp-Session-Id':session} : {})},
      body:JSON.stringify({jsonrpc:'2.0',...(id === undefined ? {} : {id}),method,params})
    });
    session = response.headers.get('mcp-session-id') || session;
    return readRpcResponse(response,id);
  }
  const init = await call('initialize',{protocolVersion:version,capabilities:{},clientInfo:{name:'fhirguard',version:'1.1.0'}});
  version = init.protocolVersion;
  await call('notifications/initialized',{},true);
  return {call};
}

export function reportFromResult(table, result) {
  if (result?.isError) return {table,status:'unavailable',findings:[],message:'Sodabase could not return a result for this table.'};
  const text = (result?.content || []).filter(c=>c.type==='text').map(c=>c.text).join('\n');
  let report = result?.structuredContent;
  if (!report) { try { report = JSON.parse(text); } catch { /* Unknown provider shape must not appear healthy. */ } }
  const verdicts = ['trusted','caveated','untrusted','unknown','scanning'];
  if (!report || report.table !== table || !verdicts.includes(report.status)) {
    return {table,status:'unavailable',findings:[],message:'Sodabase returned an unrecognized report format.'};
  }
  return {table,status:report.status,asOf:report.as_of || null,
    message:typeof report.reason === 'string' ? report.reason.slice(0,1000) : null,
    findings:Array.isArray(report.findings) ? report.findings.slice(0,50).map(f=>({
      title:String(f.title || f.message || f.description || f.name || 'Data quality finding').slice(0,1000),
      count:Number.isFinite(f.count) ? f.count : null
    })) : []};
}

let cached, pending;
export async function sodabaseStatus(token) {
  if (!token) return {status:'not_configured',projectUrl,reports:[],message:'Sodabase API access has not been configured.'};
  if (cached && Date.now()-cached.time < 60000) return cached.value;
  if (pending) return pending;
  pending = (async()=>{
    let value;
    try {
      const client = await connectSodabase(token);
      const reports = [];
      for (const table of watchedTables) {
        reports.push(reportFromResult(table,await client.call('tools/call',{name:'data_trust',arguments:{table}})));
      }
      value = {status:'connected',projectUrl,reports,checkedAt:new Date().toISOString()};
    } catch (error) {
      value = {status:error.message === 'auth' ? 'authentication_error' : 'unavailable',projectUrl,reports:[],
        message:error.message === 'auth' ? 'Sodabase rejected the configured token.' : 'Sodabase results could not be fetched. Try refreshing shortly.'};
    }
    cached = {time:Date.now(),value};
    return value;
  })();
  try { return await pending; } finally { pending = undefined; }
}
