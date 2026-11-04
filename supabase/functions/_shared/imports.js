export const MAX_BYTES = 1024 * 1024;
export const MAX_RESOURCES = 100;

export function checkSize(raw) {
  if (new TextEncoder().encode(raw).length > MAX_BYTES) {
    throw new Error('Use a JSON document smaller than 1 MiB.');
  }
  return raw;
}

export function resourcesFrom(raw) {
  checkSize(raw);
  let document;
  try {
    document = JSON.parse(raw);
  } catch {
    // Preserve malformed payloads for the validator and audit trail.
    return [raw];
  }
  if (document?.resourceType !== 'Bundle') return [raw];
  if (!['collection', 'searchset'].includes(document.type)) {
    throw new Error('Use a collection or searchset Bundle for this import.');
  }
  if (!Array.isArray(document.entry) || !document.entry.length) {
    throw new Error('The Bundle has no resources to import.');
  }
  if (document.entry.length > MAX_RESOURCES) {
    throw new Error('Import up to 100 resources at a time.');
  }
  if (document.entry.some(entry => !entry?.resource || typeof entry.resource !== 'object' || Array.isArray(entry.resource))) {
    throw new Error('Every Bundle entry must contain a resource object.');
  }
  return document.entry.map(entry => entry.resource)
    .sort((left, right) => Number(right.resourceType === 'Patient') - Number(left.resourceType === 'Patient'))
    .map(resource => JSON.stringify(resource, null, 2));
}

export function sourceUrl(value) {
  let url;
  try { url = new URL(value.trim()); }
  catch { throw new Error('Enter a full HTTPS URL that returns FHIR JSON.'); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Use an HTTPS URL without embedded credentials.');
  }
  return url.href;
}

export async function readJsonResponse(response) {
  if (!response.ok) throw new Error('Source returned HTTP ' + response.status + '.');
  if (!response.body) throw new Error('The source returned an empty response.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let raw = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('Use a JSON document smaller than 1 MiB.');
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  try { JSON.parse(raw); }
  catch { throw new Error('The link must return JSON. Use a direct FHIR API or JSON file URL.'); }
  return raw;
}
