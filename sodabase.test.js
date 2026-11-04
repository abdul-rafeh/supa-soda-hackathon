import test from 'node:test';
import assert from 'node:assert/strict';
import {connectSodabase,readRpcResponse,reportFromResult,sodabaseStatus} from './supabase/functions/_shared/sodabase.js';
test('server missing secret is explicit and never fabricates score',async()=>{
 const result=await sodabaseStatus('');
 assert.equal(result.status,'not_configured'); assert.equal(result.score,undefined);
});
test('MCP negotiates session and reads SSE replies',async()=>{
 const requests=[];
 const client=await connectSodabase('test-only-token',async(url,options)=>{
  const body=JSON.parse(options.body); requests.push({body,headers:options.headers,url});
  if(body.method==='initialize') return Response.json({jsonrpc:'2.0',id:body.id,result:{protocolVersion:'2025-03-26'}},{headers:{'mcp-session-id':'test-session'}});
  if(body.method==='notifications/initialized') return new Response(null,{status:202});
  return new Response('event: message\ndata: '+JSON.stringify({jsonrpc:'2.0',id:body.id,result:{content:[{type:'text',text:'Scanning'}]}})+'\n\n',{headers:{'content-type':'text/event-stream'}});
 });
 const result=await client.call('tools/call',{name:'data_trust',arguments:{table:'fhirguard.resources'}});
 assert.equal(result.content[0].text,'Scanning');
 assert.equal(requests[2].headers['Mcp-Session-Id'],'test-session');
 assert.equal(requests[2].headers.Authorization,'Bearer test-only-token');
 assert.equal(requests[2].body.params.arguments.table,'fhirguard.resources');
});
test('provider auth failure and tool errors do not become healthy results',async()=>{
 await assert.rejects(readRpcResponse(new Response('',{status:401}),1),/auth/);
 assert.equal(reportFromResult('fhirguard.resources',{isError:true,content:[]}).status,'unavailable');
});
test('provider verdict is preserved without numeric score conversion',()=>{
 const r=reportFromResult('fhirguard.resources',{structuredContent:{result:'wrapped provider payload'},content:[{type:'text',text:'{"table":"fhirguard.resources","status":"trusted","findings":[]}'}]});
 assert.equal(r.status,'trusted'); assert.equal(r.score,undefined);
});
