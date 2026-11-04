import { checkSize, MAX_RESOURCES } from './imports.js';
import { structureIssues } from './structure.js';
const localReference = /^[A-Z][A-Za-z0-9]*\/[A-Za-z0-9.-]{1,64}$/;
const key = resource => resource.resourceType + '/' + resource.id;
function visit(value, callback, path = '') {
  if (!value || typeof value !== 'object') return;
  if (typeof value.reference === 'string') callback(value, path + '.reference');
  for (const [name, child] of Object.entries(value)) visit(child, callback, path ? path + '.' + name : name);
}
function lookup(reference) {
  if (localReference.test(reference)) {
    const [type, id] = reference.split('/');
    return { reference, type, id };
  }
  const match = /^([A-Z][A-Za-z0-9]*)\?identifier=([^&]+)$/.exec(reference);
  if (!match) return null;
  let token;
  try { token = decodeURIComponent(match[2]); } catch { return null; }
  const parts = token.split('|');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { reference, type: match[1], system: parts[0], value: parts[1] };
}
export function prepareBundle(raw) {
  checkSize(raw);
  const document = JSON.parse(raw);
  if (document?.resourceType !== 'Bundle') throw Error('Expected a FHIR Bundle.');
  if (!['collection', 'searchset', 'transaction'].includes(document.type)) throw Error('Use a collection, searchset or transaction Bundle.');
  if (!Array.isArray(document.entry) || !document.entry.length || document.entry.length > MAX_RESOURCES) throw Error('A Bundle must contain 1–100 resources.');
  const issues = [], records = [], aliases = new Map(), resources = new Map();
  const add = (index, path, message, reference) => issues.push({stage:'structure',path:'entry['+index+'].'+path,message,...(reference?{reference}:{})});
  document.entry.forEach((entry, index) => {
    const resource = entry?.resource;
    if (!resource || typeof resource !== 'object' || Array.isArray(resource)) { add(index,'resource','Every entry must contain a resource.'); return; }
    records.push({ resource: structuredClone(resource), raw: JSON.stringify(resource), index });
    for (const issue of structureIssues(resource)) issues.push({...issue,path:'entry['+index+'].resource.'+issue.path});
    if (!/^[A-Za-z0-9.-]{1,64}$/.test(resource.id || '')) add(index,'resource.id','Every imported resource needs a valid FHIR id.');
    const id = key(resource);
    if (resources.has(id)) add(index,'resource.id','Duplicate resource identity: '+id+'.');
    resources.set(id, resource);
    if (entry.fullUrl) {
      if (typeof entry.fullUrl !== 'string' || aliases.has(entry.fullUrl)) add(index,'fullUrl','fullUrl must be a unique string.');
      else aliases.set(entry.fullUrl,id);
    }
    if (document.type === 'transaction') {
      const request = entry.request;
      // Import a create-only transaction document; never execute arbitrary FHIR HTTP requests.
      if (!request || request.method !== 'POST' || request.url !== resource.resourceType || Object.keys(request).some(k=>!['method','url'].includes(k))) {
        add(index,'request','Transaction imports support unconditional POST entries with request.url equal to resourceType. Conditional writes, updates and deletes are not supported.');
      }
    } else if (entry.request) add(index,'request','Write instructions require a supported transaction Bundle.');
  });
  const lookups = new Map();
  let references = 0;
  for (const record of records) {
    visit(record.resource,(object,path)=>{
      references++;
      if (aliases.has(object.reference)) object.reference = aliases.get(object.reference);
      const ref = object.reference;
      if (ref.startsWith('#') || resources.has(ref)) return;
      const query = lookup(ref);
      if (query) lookups.set(ref,query);
      else issues.push({stage:'integrity',path:'entry['+record.index+'].resource.'+path,reference:ref,message:'Unresolved reference '+ref+'. Include its resource in this Bundle using a matching fullUrl, or use a local Type/id reference.'});
    });
  }
  if (references > 5000 || lookups.size > 200) throw Error('This Bundle exceeds the limit of 5,000 references or 200 external lookups.');
  return { records, issues, lookups:[...lookups.values()], transaction:document.type==='transaction' };
}
export function resolveBundle(prepared, resolutions) {
  const issues = [...prepared.issues], records = prepared.records;
  const local = new Map(records.map(r=>[key(r.resource),r.resource]));
  const remote = new Map(resolutions.map(r=>[r.reference,r.matches]));
  const resolved = new Map();
  for (const query of prepared.lookups) {
    const matches = new Map((remote.get(query.reference)||[]).map(r=>[key(r),r]));
    if (query.system) {
      for (const {resource} of records) if (resource.resourceType===query.type && resource.identifier?.some(i=>i.system===query.system&&i.value===query.value)) matches.set(key(resource),resource);
    }
    // Multiple sources with conflicting payloads are deliberately not resolved automatically.
    if (matches.size===1 && (remote.get(query.reference)||[]).length<=1) resolved.set(query.reference,[...matches.values()][0]);
  }
  const seen = new Set();
  const add = (index,path,message,reference) => {
    const signature=reference || index+':'+path;
    if(seen.has(signature))return;
    seen.add(signature);
    issues.push({stage:'integrity',path:'entry['+index+'].resource.'+path,message,...(reference?{reference}:{})});
  };
  for (const record of records) {
    const resource = record.resource;
    visit(resource,(object,path)=>{
      const ref = object.reference;
      if (ref.startsWith('#')) {
        if (!resource.contained?.some(r=>r.id===ref.slice(1))) add(record.index,path,'Missing contained resource '+ref+'.',ref);
        return;
      }
      if (local.has(ref)) return;
      const target = resolved.get(ref);
      if (target) object.reference=key(target);
      else if (lookup(ref)) add(record.index,path,'Missing or ambiguous dependency: '+ref+'. Include the matching resource in this Bundle or import it first.',ref);
    });
  }
  for (const record of records) {
    const resource = record.resource;
    if (['Observation','Condition','Procedure'].includes(resource.resourceType) && resource.encounter?.reference) {
      const ref=resource.encounter.reference;
      const encounter=local.get(ref) || resolved.get(ref) || [...resolved.values()].find(r=>key(r)===ref);
      if(encounter?.subject?.reference && resource.subject?.reference && encounter.subject.reference!==resource.subject.reference) add(record.index,'encounter.reference','Encounter and resource must reference the same subject.');
    }
  }
  // Recheck after normalization so an invalid mapped reference cannot slip through.
  for(const {resource,index} of records) for(const issue of structureIssues(resource)) {
    const path='entry['+index+'].resource.'+issue.path;
    if(!issues.some(i=>i.path===path&&i.message===issue.message))issues.push({...issue,path});
  }
  return { records, issues, count:records.length, transaction:prepared.transaction };
}
