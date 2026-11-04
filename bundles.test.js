import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBundle, resolveBundle } from './supabase/functions/_shared/bundles.js';
import { structureIssues } from './supabase/functions/_shared/structure.js';
const patient = {resourceType:'Patient',id:'local-patient'};
const observation = {resourceType:'Observation',id:'local-observation',status:'final',code:{text:'Test'},subject:{reference:'urn:uuid:patient'}};
const bundle = resources => JSON.stringify({resourceType:'Bundle',type:'transaction',entry:resources.map(resource=>({fullUrl:resource.id==='local-patient'?'urn:uuid:patient':'urn:uuid:'+resource.id,resource,request:{method:'POST',url:resource.resourceType}}))});
test('transaction import resolves forward fullUrl references and preserves original raw',()=>{
 const prepared=prepareBundle(bundle([observation,patient]));
 const report=resolveBundle(prepared,[]);
 assert.equal(report.issues.length,0);
 assert.equal(report.records[0].resource.subject.reference,'Patient/local-patient');
 assert.equal(JSON.parse(report.records[0].raw).subject.reference,'urn:uuid:patient');
});
test('preflight supports cyclic local references without sequential imports',()=>{
 const first={...patient,link:[{other:{reference:'Patient/second'},type:'seealso'}]};
 const second={resourceType:'Patient',id:'second',link:[{other:{reference:'Patient/local-patient'},type:'seealso'}]};
 assert.deepEqual(resolveBundle(prepareBundle(bundle([first,second])),[]).issues,[]);
});
test('missing dependencies are deduplicated and identifier matches must be unique',()=>{
 const reference='Practitioner?identifier=https://example.test/npi|123';
 const resource={...observation,performer:[{reference},{reference}]};
 const prepared=prepareBundle(bundle([resource,patient]));
 const missing=resolveBundle(prepared,[]);
 assert.equal(missing.issues.length,1);
 assert.equal(missing.issues[0].reference,reference);
 const provider={resourceType:'Practitioner',id:'provider',identifier:[{system:'https://example.test/npi',value:'123'}]};
 assert.equal(resolveBundle(prepareBundle(bundle([resource,patient])),[{reference,matches:[provider]}]).issues.length,0);
 assert.equal(resolveBundle(prepareBundle(bundle([resource,patient])),[{reference,matches:[provider,{...provider,id:'other'}]}]).issues.length,1);
 assert.equal(resolveBundle(prepareBundle(bundle([resource,patient,provider])),[]).issues.length,0);
});
test('encounter comparisons occur after every entry has its URNs normalized',()=>{
 const obs={...observation,encounter:{reference:'urn:uuid:visit'}};
 const encounter={resourceType:'Encounter',id:'visit',status:'finished',class:{code:'AMB'},subject:{reference:'urn:uuid:patient'}};
 assert.deepEqual(resolveBundle(prepareBundle(bundle([obs,encounter,patient])),[]).issues,[]);
 encounter.subject.reference='Patient/other';
 const report=resolveBundle(prepareBundle(bundle([obs,encounter,patient,{resourceType:'Patient',id:'other'}])),[]);
 assert.ok(report.issues.some(i=>i.message.includes('same subject')));
});
test('rejects unsafe transaction semantics and duplicate identities before writes',()=>{
 const base=JSON.parse(bundle([patient]));
 for(const request of [{method:'DELETE',url:'Patient/local-patient'},{method:'PUT',url:'Patient/local-patient'},{method:'POST',url:'Observation'},{method:'POST',url:'Patient',ifNoneExist:'identifier=123'}]){
  const document=structuredClone(base);document.entry[0].request=request;
  assert.ok(prepareBundle(JSON.stringify(document)).issues.some(i=>i.path.endsWith('.request')));
 }
 assert.ok(prepareBundle(bundle([patient,patient])).issues.some(i=>i.message.includes('Duplicate')));
});
test('FHIR schema checks extended resource types and nested malformed values',()=>{
 assert.equal(structureIssues({resourceType:'Immunization',id:'vac',status:'completed',vaccineCode:{text:'Test'},patient:{reference:'Patient/local-patient'},occurrenceDateTime:'2020-01-01'}).length,0);
 assert.ok(structureIssues({resourceType:'Immunization',id:'vac',status:'nonsense'}).length);
 assert.ok(structureIssues({...patient,name:[{family:42}]}).length);
 assert.ok(structureIssues({...patient,unexpectedField:true}).length);
});
