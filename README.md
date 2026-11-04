# FHIRGuard
React, Vite and Tailwind frontend with a Supabase Edge Function for a shared synthetic-data hackathon workspace.

## Run locally
Copy .env.example to .env.local and supply the project's publishable key. Run npm ci and npm run dev. Run npm test and npm run build to verify changes.

The deployed project is Rafehs Org / supa-soda-hackathon (dbloynewlgozjpqgkyft).
The gateway base URL is https://dbloynewlgozjpqgkyft.supabase.co/functions/v1/fhirguard.
The frontend reads VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY and VITE_GATEWAY_URL at build time. Keep server credentials on the server.

## Try the full flow
Import the Patient example, then Observation, then Broken reference. The first two are accepted and the third is quarantined with the exact missing reference. Reload the dashboard to verify persistence. Run demo batch inserts these same three synthetic fixtures.

JSON upload and URL import both load an editable preview. Validate & import submits each resource to the gateway. Single resources and collection/searchset Bundles are supported, with a limit of 1 MiB and 100 resources. Patients are submitted first. URL previews currently accept direct HTTPS JSON from hapi.fhir.org (R4 Patient/Observation endpoints) and raw.githubusercontent.com, with redirects disabled. Only the current search-result page is loaded.

Manual and uploaded records share the uploads source scope. URL records use their HTTPS origin as source scope. Observations resolve Patient/id references within that scope. Imported Bundle fullUrl/urn references, profiles, terminology binding and full FHIRPath validation remain outside this MVP's bounded checks.

## Gateway routes
Requests carry the project's publishable key in the apikey header. This identifies the shared demo application. It is not individual-user authentication. Use synthetic data in this workspace.

- GET /dashboard returns the latest 100 events, totals across all events, and score: null until Sodabase integration is provided.
- POST /validate receives raw (original JSON text), optional source ({kind: manual|file|url, name: string}), and optional requestId (UUID). It returns the persisted event, including failures. Malformed JSON is retained in quarantine.
- POST /fetch-url receives {url} and returns {raw} for preview without inserting anything. Fetches use an 8-second timeout and a 1 MiB response limit.
- POST /ingest inserts the three synthetic demo fixtures and returns {events}.

An event includes eventId, time, raw, type, resourceId, source, structure (passed|failed), integrity (passed|failed|skipped), outcome (accepted|quarantined), and issues ([{stage,path,message}]).
Counts measure submission events. Accepted resources are upserted by source scope and resource ID. Reusing a requestId with the same content returns the original event. Reusing it with different content returns HTTP 409.

Imports are sequential and may partially complete. The frontend stops on transport failure and refreshes history. Check history before manually retrying. Each record's reference check, accepted resource write, event and issues commit in one database transaction. The Observation foreign key also enforces patient-reference integrity.

## Backend implementation
supabase/functions/fhirguard/index.ts is the deployed Edge Function. Shared rules live in supabase/functions/_shared, with root re-exports used by the frontend. The function verifies the apikey against the environment's project publishable keys. verify_jwt is false because these keys are not JWTs; authentication occurs inside the handler. Server database requests use Supabase's provisioned secret key or legacy service-role fallback.

The production frontend is https://supa-soda-hackathon.vercel.app. Vercel is linked to this GitHub repository.

CORS allows the Vercel production and main-branch aliases, the private Site and localhost ports 5173/5174. Other frontend origins must be added deliberately. URL fetching forwards no caller credentials and uses a fixed trusted-host allowlist.

supabase/schema.sql defines the initial public ingestion_events, patients, observations, validation_issues tables and the two gateway RPCs. It has already been applied to this project. RLS is enabled and browser roles have no direct table or RPC privileges. Only the gateway's service role can use them. The [RLS-with-no-policies informational advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) is intentional for these service-only tables.

The project also contains an independently populated fhirguard schema (sources, resources, import_runs, validation_runs, resource_validation). The interactive gateway currently uses the public tables above. Its dashboard totals cover gateway events, and do not include that existing dataset. Coordinate the data-model integration with the backend owner before combining the two flows.

## Verification and deployment
npm test covers the shared validation and import handling. python3 scripts/verify-gateway.py checks the live API using .env.local and creates synthetic verification events. It verifies persistence, quarantine, replay/conflict behavior, API-key authentication, URL restrictions and HAPI previews.

Deploy the three function source files together, preserving the fhirguard and _shared paths, with name fhirguard and verify_jwt=false. Rebuild the frontend after environment changes. The SQL is an initial setup script; it intentionally fails if those tables already exist.

The original browser-session demo remains available by clearing both VITE_SUPABASE_URL and VITE_GATEWAY_URL before building.
