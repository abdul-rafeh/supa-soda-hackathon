import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSize, sourceUrl, readJsonResponse, MAX_BYTES } from './imports.js';
test('rejects oversized UTF-8 documents', () => {
  assert.throws(() => checkSize(' '.repeat(MAX_BYTES + 1)));
  assert.throws(() => checkSize('é'.repeat(MAX_BYTES)));
  assert.equal(checkSize('{}'), '{}');
});
test('URL restrictions and response validation', async () => {
  assert.throws(() => sourceUrl('http://example.com'));
  assert.throws(() => sourceUrl('https://user:pass@example.com'));
  assert.equal(sourceUrl(' https://example.com/data.json '),'https://example.com/data.json');
  await assert.rejects(readJsonResponse(new Response('<html>oops</html>')));
  await assert.rejects(readJsonResponse(new Response('x'.repeat(MAX_BYTES+1))));
  assert.equal(await readJsonResponse(new Response('{"resourceType":"Patient"}')), '{"resourceType":"Patient"}');
});
