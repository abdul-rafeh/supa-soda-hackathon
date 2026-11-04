import Ajv from 'ajv';
import schema from './vendor/fhir-r4.schema.json' with { type: 'json' };
export const SUPPORTED_TYPES = schema.oneOf.map(item => item.$ref.split('/').at(-1));
// Compile once per isolate; the vendored schema contains only supported resources.
const validate = new Ajv({ strict: false, inlineRefs: false, discriminator: true, validateSchema: false }).compile(schema);
export function structureIssues(resource) {
  const issues = [];
  const issue = (path, message) => issues.push({ stage: 'structure', path, message });
  if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
    issue('$', 'Expected a FHIR resource object.');
    return issues;
  }
  if (!SUPPORTED_TYPES.includes(resource.resourceType)) {
    issue('resourceType', 'Unsupported resource type. Supported: ' + SUPPORTED_TYPES.join(', ') + '.');
    return issues;
  }
  if (!validate(resource)) {
    for (const error of validate.errors || []) {
      const field = error.params.missingProperty || error.params.additionalProperty;
      issue((error.instancePath || '$') + (field ? '/' + field : ''), 'FHIR R4 JSON schema: ' + error.message + '.');
    }
  }
  // JSON Schema does not encode every FHIR invariant. Retain explicit local checks.
  if (resource.resourceType === 'Observation') {
    if (Object.keys(resource).filter(k => /^value[A-Z]/.test(k)).length > 1) issue('value[x]', 'Observation may supply only one value[x] field.');
    if (!resource.code?.text && !resource.code?.coding?.length) issue('code', 'Supply an observation code with text or coding.');
  }
  return issues;
}
