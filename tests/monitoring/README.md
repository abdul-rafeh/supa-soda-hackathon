# Sodabase is a separate test layer

Uploading a FHIR file does not itself execute Sodabase. FHIRGuard checks the resource, Supabase stores it, and Sodabase checks the stored table.

sodabase-tests.json defines five native Sodabase MCP checks. They have NOT RUN. Table discovery is currently blocked in the active workspace. The first task is to get fhirguard.resources listed for the correct project, then execute the non-persistent positive and negative control rules.

SODA-04 intentionally states an incorrect rule over existing real data, so no bad records need to be inserted. Expected detection: 12,595 non-Patient rows violate the Patient-only rule. Do not persist it or describe it as a real dataset defect.

Keep the original imported dataset unchanged. This pack does not change permissions, connect accounts, enable monitors, or send alerts. A long-term monitor or persisted rule is separate from these read-only diagnostic checks.

Do not claim Sodabase integration passed, or show a fabricated Sodabase score, until the actual results have been observed.

Official tools: https://sodabase.io/docs/mcp-tools
