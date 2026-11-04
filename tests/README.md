# Expanded FHIRGuard tests

## Main real-data file

real-fhir-bundle.json is a FHIR R4 collection Bundle containing 29 unchanged resources selected from MIMIC-IV Clinical Database Demo on FHIR v2.1.0: 3 Patients, 6 Observations, 3 Conditions, 7 Encounters, 3 Procedures, 6 Locations, and 1 Organization. Its resource dependencies are included and ordered before their dependents. All 79 resource references resolve inside this file (see expected-results.json for the verified count).

This is real de-identified historical clinical data, not invented patient histories. Names are pseudonyms and dates are de-identified. The collection wrapper is newly assembled; its contents preserve the published resource values. The file is below the frontend limits of 100 resources and 1 MiB.

Use the main file to test a gateway that supports all seven included resource types. A frontend or backend limited to Patient and Observation can reject the other types as unsupported; that is an application-scope limitation, not proof that the file is invalid FHIR. For that narrower workflow, use tests/01 and tests/02 after the supporting data is present.

## Test files

expected-results.json records Yes/No expectations and separates FHIR structure from local integrity. tests/03, 04, 05, 06, 08 and 10 are deliberately modified or malformed fixtures. tests/09 is a synthetic boundary fixture. tests/01 and 02 are unchanged real records. tests/07 repeats a real Patient to test storage deduplication.

A broken reference can be structurally valid FHIR while failing the local database integrity check. Duplicate submissions test upserts/auditing. Optional demographic fields should not be treated as mandatory by a base-R4 validator. Full MIMIC-profile, terminology-membership and clinical-correctness validation are outside the local checks.

Test in a shared demo/test workspace with a recorded starting count. Confirm persistence after reload and keep rejected payloads out of trusted storage. Resubmitting a published identity must not modify the original imported source dataset.

## Sodabase

monitoring/sodabase-tests.json includes the Sodabase discovery check, positive rules, a deliberate failing rule over unchanged data, and a trust/freshness check. These tests are prepared but NOT RUN while Sodabase table discovery is unresolved. They are not JSON resources to upload into the FHIR validator. See monitoring/README.md.

## Source and attribution

Source: https://physionet.org/content/mimic-iv-fhir-demo/2.1.0/
Bennett, A., Ulrich, H., Wiedekopf, J., Szul, P., Grimes, J., & Johnson, A. (2025). MIMIC-IV Clinical Database Demo on FHIR (version 2.1.0). PhysioNet. https://doi.org/10.13026/vphg-y548
License: Open Data Commons Open Database License v1.0. See LICENSE.txt.
