# FHIR R4 schema subset

`fhir-r4.schema.json` is derived from HL7 FHIR R4 4.0.1's official JSON Schema:
https://hl7.org/fhir/R4/fhir.schema.json.zip (2019-11-01).

FHIR specification © HL7. Used under CC0; see https://hl7.org/fhir/R4/license.html.
FHIR® is a registered trademark of HL7.

This subset keeps 16 supported resource definitions and their 137 transitive
resource/datatype definitions. Descriptions, titles, comments, the draft-06
`$schema` declaration and legacy `id` are omitted. The root and ResourceList use
an AJV discriminator on `resourceType` instead of the source OpenAPI mapping.
Validation constraints within retained definitions are unchanged.

This validates JSON structure, required fields, primitives and enumerations;
it is not a complete FHIRPath invariant, terminology or US Core profile validator.
