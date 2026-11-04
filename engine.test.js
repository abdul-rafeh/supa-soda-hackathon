import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate} from './engine.js';
import {patient,observation,broken} from './tests/unit-fixtures.js';
test('judge sequence resolves only accepted Patients',()=>{
 const events=[];
 for(const [r,status] of [[observation,'quarantined'],[patient,'accepted'],[observation,'accepted'],[broken,'quarantined']]){
 const e=evaluate(JSON.stringify(r),events);assert.equal(e.structure,'passed');assert.equal(e.outcome,status);events.unshift(e)}
 assert.equal(events[0].issues[0].path,'subject.reference');
});
test('syntax and malformed resources skip integrity checks',()=>{
 for(const raw of ['{','null','[]','{"resourceType":"Observation"}','{"resourceType":"Patient","active":"yes"}']){
 const e=evaluate(raw,[]);assert.equal(e.structure,'failed');assert.equal(e.integrity,'skipped');assert.equal(e.raw,raw)}
});

// Regression from the backend owner's fixture pack.
test('Observation cannot carry competing value[x] fields',()=>{
 const event=evaluate(JSON.stringify({resourceType:'Observation',id:'choice-test',status:'final',code:{text:'test'},valueQuantity:{value:1},valueString:'one'}),[]);
 assert.equal(event.structure,'failed');
 assert.ok(event.issues.some(i=>i.path==='value[x]'));
});
