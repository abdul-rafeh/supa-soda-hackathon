import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import SourceInput from './SourceInput.jsx';
import {snapshot,importDocument,projectName,quality} from './api.js';
import './style.css';
const paths={shield:'M12 2 21 6v6c0 5-5 8-9 10-4-2-9-5-9-10V6z M7 12h3l1-3 2 6 1-3h3',code:'m7 6-5 6 5 6m10-12 5 6-5 6m-4-15-2 18',chart:'M3 3v17h18 M7 15v-4m5 4V6m5 9v-7',flow:'M4 6h9l5 6-5 6H4m0-12v12m14-6h4',stack:'m12 3 10 5-10 5L2 8z M2 12l10 5 10-5M2 16l10 5 10-5',check:'m4 12 5 5L20 6',alert:'m12 3 10 18H2z M12 9v5m0 3v1',arrow:'M4 12h15m-6-6 6 6-6 6',play:'m7 4 13 8-13 8z',pulse:'M1 12h6l3-8 4 16 3-8h6',circle:'M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0',clock:'M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0 M12 7v5l3 2'};
function Icon({name,size=18}){return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]}/></svg>}

function Diagram(){return <div className="diagram" aria-hidden="true"><svg viewBox="0 0 340 120"><g fill="none" stroke="#6b9984" strokeWidth="1.5"><path d="M16 60h35q12 0 22-11l16-19q8-10 22-10h65q12 0 22 11l17 19q8 10 18 10h85M16 60h35q12 0 22 11l16 19q8 10 22 10h65q12 0 22-11l17-19q8-10 18-10M50 60h184"/><path strokeDasharray="2 6" d="M4 60h33m240 0h55"/></g>{[[16,60],[115,20],[172,100],[255,60],[318,60]].map(([x,y])=><circle key={x} cx={x} cy={y} r="4" fill="#b9e2a4"/>)}<rect x="117" y="39" width="54" height="42" rx="7" fill="#caeba9"/><path d="m132 60 8 7 15-15" fill="none" stroke="#234735" strokeWidth="3"/></svg></div>}
function Verdict({event}){return <section className="panel inspector" aria-live="polite"><div className="panelHead"><span className="tile"><Icon name="pulse"/></span><h2>Validation result</h2></div><div className="verdict"><small>GATEWAY VERDICT</small><h3 className={event?.outcome||''}>{event?event.outcome==='accepted'?'Accepted':'Quarantined':'Awaiting resource'}</h3><p>{event?event.type+' / '+event.resourceId:'Submit a resource to inspect its checks.'}</p></div>{[['structure','Implemented R4 checks'],['integrity','Local integrity']].map(([key,label],i)=><div className="checkrow" key={key}><span className="ordinal">0{i+1}</span><strong>{label}</strong><span className={'badge '+event?.[key]}>{event?.[key]||'Pending'}</span></div>)}{event?.issues.map((issue,i)=><div className="issue" key={i}><code>{issue.path}</code><p>{issue.message}</p></div>)}</section>}
function QualityPanel({status,busy,onRefresh}) {
 const labels={checking:'Checking Sodabase…',connected:'Sodabase connected',not_configured:'Sodabase access needed',authentication_error:'Sodabase token needs attention',unavailable:'Sodabase temporarily unavailable'};
 return <section className="panel qualityPanel" aria-live="polite">
 <div className="panelHead"><span className="tile"><Icon name="pulse"/></span><h2>{labels[status.status] || 'Sodabase trust'}</h2><button className="secondary ml-auto" disabled={busy} onClick={onRefresh}>Refresh checks</button></div>
 <div className="editorBody"><p>{status.message || 'Live trust reports from Sodabase. These are separate from the gateway’s validation outcomes.'}</p>
 {status.checkedAt && <p className="inputHint">Retrieved {new Date(status.checkedAt).toLocaleString()} · refreshes at most once per minute</p>}
 {(status.reports || []).map(report=><details className="trustReport" key={report.table}><summary>{report.table}<span className="badge">{report.status}</span></summary><div className="trustDetails">{report.asOf && <p className="inputHint">Last scan: {new Date(report.asOf).toLocaleString()}</p>}{report.message && <p>{report.message}</p>}{report.status==='trusted' && !report.findings?.length && <p>No findings in the latest scan.</p>}{report.findings?.map((f,i)=><p key={i}>{f.title}{f.count!=null ? ' · '+f.count+' affected' : ''}</p>)}</div></details>)}
 <p className="inputHint">A numeric score is shown only when supplied by Sodabase; trust verdicts are not converted into scores.</p>
 <a href="https://sodabase.io/projects/dbloynewlgozjpqgkyft" target="_blank" rel="noreferrer">Open Sodabase project ↗</a></div></section>
}
function App(){const [page,nav]=useState('Validator'),[data,setData]=useState({events:[],score:null,connection:'checking',backend:'pending'}),[result,setResult]=useState(null),[report,setReport]=useState(null),[imported,setImported]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[filter,setFilter]=useState('All'),[detail,inspect]=useState(null);
 async function refresh() {
  try { setData(await snapshot()); }
  catch (error) {
   setData(previous => ({...previous, connection:'error', backend:'unavailable'}));
   throw error;
  }
 }
 useEffect(()=>{refresh().catch(e=>setError(e.message))},[]);
 async function run(fn) {
  setBusy(true);
  setError('');
  try { await fn(); }
  catch (error) { setError(error.message); }
  try { await refresh(); }
  catch (error) { setError(previous => [previous, 'History refresh failed. ' + error.message].filter(Boolean).join(' ')); }
  setBusy(false);
 }
 function importInput(raw, source, dryRun = false) {
  setReport(null);
  setResult(null);
  setImported([]);
  return run(async () => setReport(await importDocument(raw, source, event => {
   setResult(event);
   setImported(previous => [...previous, event]);
  }, dryRun)));
 }
 const [trust,setTrust]=useState({status:'checking',reports:[]}),[trustBusy,setTrustBusy]=useState(false);
 async function refreshTrust(){setTrustBusy(true);try{setTrust(await quality());}catch{setTrust({status:'unavailable',reports:[],message:'Could not fetch Sodabase results. Try again shortly.'});}finally{setTrustBusy(false);}}
 useEffect(()=>{refreshTrust();},[]);
 const canImport = data.backend === 'ready';
 const connectionLabel = data.connection === 'checking' ? 'Checking connection' : data.connection === 'connected' ? 'Supabase connected' : 'Connection needs attention';
 const total=data.totals?.ingested ?? data.events.length,accepted=data.totals?.accepted ?? data.events.filter(e=>e.outcome==='accepted').length;
 return <div className="shell"><aside><div className="brand"><span className="logo"><Icon name="shield" size={26}/></span>FHIRGuard</div><small className="sideLabel">WORKSPACE</small><nav>{[['Validator','code'],['Dashboard','chart']].map(([n,ic])=><button key={n} className={page===n?'nav active':'nav'} onClick={()=>nav(n)}><Icon name={ic}/>{n}{page===n&&<b>•</b>}</button>)}</nav><div className="sideFoot"><i/> {connectionLabel}<small>FHIR R4 · v1.0</small></div></aside>
 <main><header><div>Workspace <span>/</span> <strong>{page}</strong></div><div className="env"><i/>{connectionLabel}</div></header>
 <div className="content"><div className="hero"><div><small><i/> DATA INTEGRITY LAB</small><h1>{page==='Validator'?'Resource validator':'Quality dashboard'}</h1><p>{page==='Validator'?'Inspect FHIR records before they enter trusted storage.':'Trace ingestion outcomes across your workspace.'}</p></div><Diagram/></div>
 {<section className="connectionBanner" aria-live="polite">
 <div><strong>{projectName}</strong><p>{data.connection === 'checking' ? 'Checking project access…' : data.connection === 'error' ? 'Connection needs attention. Retry the check below.' : canImport ? 'Supabase and the ingestion gateway are available.' : 'Supabase connected · Backend in progress. You can preview files and links. Import and live metrics become available when the gateway is configured.'}</p></div>
 <button className="secondary" disabled={busy || data.connection === 'checking'} onClick={() => run(async () => {})}>Recheck connection</button>
 </section>}
 <div className="stats">{[['Ingested',total,'stack'],['Accepted',accepted,'check'],['Quarantined',total-accepted,'alert'],['Sodabase trust',data.score??(trust.status==='connected'?(trust.reports.filter(r=>r.status==='trusted').length+' / '+trust.reports.length):trust.status==='checking'?'Checking':'Pending'),'pulse']].map(([label,val,ic])=><div key={label}><small><Icon name={ic} size={15}/>{label}</small><strong>{!canImport ? '—' : val}</strong>{label==='Sodabase trust'&&<em>{data.score==null?'Tables trusted':'Provider score'}</em>}</div>)}</div>
 <QualityPanel status={trust} busy={trustBusy} onRefresh={refreshTrust}/>
 {data.dataset && <p className="datasetSummary"><strong>{data.dataset.title}</strong> · {data.dataset.resources?.toLocaleString()} source records · {data.dataset.validatedResources?.toLocaleString()} with passing current validation. New submissions use the shared trusted-resource store.</p>}
 {error&&<p role="alert" className="issue">{error}</p>}
 {page==='Validator' && report && <section className="panel importCheck" aria-live="polite">
 <div className="panelHead"><h2>{report.single ? 'Validation complete' : report.ok ? report.dryRun ? 'Check passed · nothing saved' : 'Import complete' : 'Import blocked · nothing saved'}</h2></div>
 <div className="editorBody"><p>{report.count} resources checked · {report.inserted} saved to trusted storage.{report.quarantined ? ' 1 quarantined event recorded.' : ''}{report.dryRun && report.ok ? ' Structure and references passed. Import also checks existing IDs and workspace limits.' : ''}</p>
 {report.issues.length>0 && <ul>{report.issues.map((issue,i)=><li key={i}><strong>{issue.path}</strong><p>{issue.message}</p></li>)}</ul>}</div></section>}
 {page==='Validator'?<div className="cols"><SourceInput busy={busy} canImport={canImport} onSubmit={importInput}/><div><Verdict event={result}/>
 {imported.length > 0 && <section className="panel importSummary" aria-live="polite">
 <div className="panelHead"><h2>This import · {imported.length} processed</h2></div>
 <div className="editorBody">{imported.map(event => <button className="event" key={event.eventId} onClick={() => setResult(event)}><strong>{event.type} / {event.resourceId}</strong><span className={'badge '+event.outcome}>{event.outcome}</span></button>)}</div>
 </section>}</div></div>:
 <section className="panel"><div className="panelHead"><span className="tile"><Icon name="clock"/></span><h2>Ingestion history</h2></div><div className="editorBody"><div className="examples">{['All','Accepted','Quarantined'].map(n=><button key={n} aria-pressed={filter===n} onClick={()=>setFilter(n)}>{n}</button>)}{<button disabled={busy} onClick={()=>run(async()=>{})}>Refresh</button>}</div>{data.events.filter(e=>filter==='All'||e.outcome===filter.toLowerCase()).map(e=><div key={e.eventId}><button className="event" aria-expanded={detail===e.eventId} onClick={()=>inspect(detail===e.eventId?null:e.eventId)}><Icon name="code"/><strong>{e.type} / {e.resourceId}</strong><span className={'badge '+e.outcome}>{e.outcome}</span><time>{new Date(e.time).toLocaleTimeString()}</time></button>{detail===e.eventId&&<div className="eventDetail"><Verdict event={e}/><p className="inputHint sourceName">Source · {e.source?.name || 'Unspecified'}</p><pre>{e.raw}</pre></div>}</div>)}{!data.events.some(e=>filter==='All'||e.outcome===filter.toLowerCase())&&<p className="empty">{!canImport ? 'Ingestion history will be available when the backend is ready.' : total?'No events match this filter.':'No ingestion events yet. Upload a file or import a link to start the log.'}</p>}</div></section>}
 <footer><Icon name="shield" size={14}/> FHIRGuard <span> / </span> {data.connection === 'connected' ? 'Live workspace' : 'Connection unavailable'}</footer></div></main></div>}
createRoot(document.getElementById('root')).render(<App/>);
