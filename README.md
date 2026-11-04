# FHIRGuard
React, Vite and Tailwind frontend with a Supabase Edge Function for a shared hackathon workspace backed by live Supabase and Sodabase services.

## Run locally
Copy .env.example to .env.local and supply the project's publishable key. Run npm ci and npm run dev. Run npm test and npm run build to verify changes.

The deployed project is Rafehs Org / supa-soda-hackathon (dbloynewlgozjpqgkyft).
The gateway base URL is https://dbloynewlgozjpqgkyft.supabase.co/functions/v1/fhirguard.
The frontend reads VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY and VITE_GATEWAY_URL at build time. Keep server credentials on the server.

## Try the full flow
Upload your FHIR JSON or load a supported link, review the preview, then validate and import. The editor starts empty. All history and dataset counts come from Supabase; trust verdicts come from Sodabase.

JSON upload and URL import both load an editable preview. Validate & import submits each resource to the gateway. Single resources and collection/searchset Bundles are supported, with a limit of 1 MiB and 100 resources. Patients are submitted first. URL previews currently accept direct HTTPS JSON from hapi.fhir.org (R4 Patient/Observation endpoints) and raw.githubusercontent.com, with redirects disabled. Only the current search-result page is loaded.

The shared backend resolves relative Type/id references against the seeded clinical dataset and accepted resources in the hackathon workspace. Accepted submissions are keyed by source metadata, resource type and resource ID. Imported Bundle fullUrl/urn references, profiles, terminology binding and full FHIRPath validation remain outside this MVP's bounded checks.

## Gateway routes
Requests carry the project's publishable key in the apikey header. This identifies the shared application. It is not individual-user authentication. This shared hackathon workspace has no individual user access controls.

- GET /dashboard returns shared ingestion history, event totals, and clinical dataset counts. Numeric score remains null because Sodabase’s documented trust API returns verdicts, not a numerical score.
- GET /quality reads Sodabase data_trust reports for resources, resource_validation and trusted_resources using a server-only SODABASE_TOKEN. Reports include the provider verdict, last scan time and findings; unknown is retained when a table has not been scanned. Results are cached for 60 seconds per function instance. Missing/invalid credentials are reported explicitly and never block ingestion.
- POST /validate receives raw (original JSON text), optional source ({kind: manual|file|url, name: string}), and optional requestId (UUID). It returns the persisted event, including failures. Malformed JSON is retained in quarantine.
- POST /fetch-url receives {url} and returns {raw} for preview without inserting anything. Fetches use an 8-second timeout and a 1 MiB response limit.

An event includes eventId, time, raw, type, resourceId, source, structure (passed|failed), integrity (passed|failed|skipped), outcome (accepted|quarantined), and issues ([{stage,path,message}]).
Counts measure submission events. Accepted resources are upserted in fhirguard.trusted_resources by workspace, source metadata, resource type and ID. Reusing a requestId with the same content returns the original event. Reusing it with different content returns HTTP 409.

Imports are sequential and may partially complete. The frontend stops on transport failure and refreshes history. Check history before manually retrying. Each record's reference check, accepted resource write, event and issues commit in one database transaction. The shared SQL submission function checks references and patient/encounter consistency.

## Backend implementation
supabase/functions/fhirguard/index.ts is the deployed Edge Function. Shared rules live in supabase/functions/_shared, with root re-exports used by the frontend. The function verifies the apikey against the environment's project publishable keys. verify_jwt is false because these keys are not JWTs; authentication occurs inside the handler. Server database requests use Supabase's provisioned secret key or legacy service-role fallback.

The production frontend is https://supa-soda-hackathon.vercel.app. Vercel is linked to this GitHub repository.

CORS allows the Vercel production and main-branch aliases, the private Site and localhost ports 5173/5174. Other frontend origins must be added deliberately. URL fetching forwards no caller credentials and uses a fixed trusted-host allowlist.

supabase/schema.sql defines the initial public ingestion_events, patients, observations, validation_issues tables and the two gateway RPCs. It has already been applied to this project. RLS is enabled and browser roles have no direct table or RPC privileges. Only the gateway's service role can use them. The [RLS-with-no-policies informational advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) is intentional for these service-only tables.

The integration now delegates to the backend owner's public.fhirguard_gateway_record_submission and public.fhirguard_gateway_dashboard functions. Apply supabase/integrate-shared-schema.sql after that shared backend exists. It copies previous interactive history and accepted resources without overwriting existing shared rows, then replaces our compatibility RPCs. New records go into fhirguard.ingestion_events and fhirguard.trusted_resources. public.ingestion_events remains only as the idempotency receipt ledger; old public patient/observation tables are preserved as historical data. The seed dataset remains in fhirguard.resources with its own provenance and validation history.

Set SODABASE_TOKEN in Supabase Edge Function secrets, never in VITE_* variables or the repository. Token documentation: https://sodabase.io/docs/ask-your-agent. Only fixed read-only data_trust calls are exposed by the gateway; no arbitrary MCP tools or scan mutations are public. Enable monitoring for fhirguard.trusted_resources in Sodabase's Tables tab to include new submissions. A new table can remain unknown until a data-quality scan covers it; freshness/volume monitors are distinct from scan verdicts.

## Verification and deployment
npm test covers the shared validation and import handling. python3 scripts/verify-gateway.py performs read-only checks against the live API using .env.local. Synthetic fixtures exist only in automated unit tests and are never bundled or inserted into production.

Deploy all four function source files together (including _shared/sodabase.js), preserving the fhirguard and _shared paths, with name fhirguard and verify_jwt=false. Rebuild the frontend after environment changes. The SQL is an initial setup script; it intentionally fails if those tables already exist.

There is no offline or synthetic-data fallback. Missing live configuration disables imports and reports a connection error. The /ingest demo endpoint has been removed. The published MIMIC-IV Clinical Database Demo on FHIR is real de-identified source data; its official title is preserved.
