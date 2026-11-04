import test from 'node:test';
import assert from 'node:assert/strict';
import { resourcesFrom, sourceUrl, readJsonResponse, MAX_BYTES } from './imports.js';
import { evaluate, patient, observation } from './engine.js';
test('Bundle accepts an Observation preceding its Patient after ordering', () => {
  const raw = JSON.stringify({resourceType:'Bundle',type:'collection',entry:[{resource:observation},{resource:patient}]});
  const events = [];
  for (const resource of resourcesFrom(raw)) {
    const event = evaluate(resource, events);
    assert.equal(event.outcome, 'accepted');
    events.push(event);
  }
  assert.equal(events.length, 2);
});
test('reject incomplete and oversized Bundles before partial import', () => {
  for (const entry of [[], [{}], Array(101).fill({resource:patient})]) {
    assert.throws(() => resourcesFrom(JSON.stringify({resourceType:'Bundle',type:'collection',entry})));
  }
  assert.throws(() => resourcesFrom(' '.repeat(MAX_BYTES + 1)));
  assert.deepEqual(resourcesFrom('{'), ['{']);
});
test('URL restrictions and response validation', async () => {
  assert.throws(() => sourceUrl('http://example.com'));
  assert.throws(() => sourceUrl('https://user:pass@example.com'));
  assert.equal(sourceUrl(' https://example.com/data.json '),'https://example.com/data.json');
  await assert.rejects(readJsonResponse(new Response('<html>oops</html>')));
  await assert.rejects(readJsonResponse(new Response('x'.repeat(MAX_BYTES+1))));
  assert.equal(await readJsonResponse(new Response(JSON.stringify(patient))), JSON.stringify(patient));
});
