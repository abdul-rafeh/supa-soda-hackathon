# FHIRGuard frontend
React, Vite and Tailwind. Install with npm ci and launch with npm run dev. Run npm test and npm run build before deploying.

## Rehearse the demo
Select Patient and click Validate & import, then repeat for Observation and Broken reference. Open Dashboard, filter Quarantined and expand the event. The demo uses session memory, so reloading starts a clean run. The Run demo batch button submits all three examples. Counters measure submission events, including repeated attempts. Demo checks cover selected fields only.

## Connect the backend
Set VITE_GATEWAY_URL to the Edge Function base URL in .env.local and rebuild. Set VITE_SUPABASE_PUBLISHABLE_KEY if the endpoint accepts a browser publishable key in the apikey header. Keep service-role keys on the server. The backend must allow the frontend origin via CORS, including OPTIONS, Content-Type and apikey. Use synthetic records for the demo. If your function requires user JWTs, provide the auth flow for integration.

The proposed API returns JSON:
- POST /validate receives {"raw":"<FHIR JSON string>"} and returns the persisted event. Return HTTP 200 for completed checks including quarantine. Preserve the raw string so malformed submissions can be audited.
- GET /dashboard returns {"events":[...],"score":null} with all demo events newest first. Supply the actual numeric Sodabase schema score when available.
- POST /ingest receives {} and returns {} after a batch is committed. The frontend then refreshes the dashboard.

Example event:
```json
{"eventId":"evt-003","time":"2026-11-04T18:00:00Z","type":"Observation","resourceId":"obs-002","raw":"{\"resourceType\":\"Observation\"}","structure":"passed","integrity":"failed","outcome":"quarantined","issues":[{"stage":"integrity","path":"subject.reference","message":"Patient/missing-404 does not resolve to an accepted local Patient."}]}
```
The raw field should contain the full original payload. Valid structure values are passed or failed. Integrity may also be skipped. Outcome is accepted or quarantined. Successful checks use an empty issues array. For the demo, scope all three routes to the same test workspace. Share one accepted and one quarantined response, dashboard JSON, and the function URL to verify the integration.

## URL import and file upload
The Validator offers JSON upload and From link. Both load an editable preview before Validate & import is pressed. Selecting a file or loading a URL creates no ingestion events. Editing the preview marks its source as manual.

Inputs may be a single resource or a collection/searchset Bundle. Limits are 1 MiB and 100 resources. Only the current search-result page is loaded. Patients are submitted before other resources so local Patient/id references can resolve. Bundle fullUrl/urn reference resolution and transaction semantics are outside the demo's current scope. Each resource has its own outcome. Invalid JSON can be submitted and quarantined. Invalid Bundle envelopes are rejected before submission.

The frontend sends one POST /validate per resource, adding source metadata:
- File upload uses {"kind":"file","name":"records.json"}.
- URL import uses {"kind":"url","name":"https://example.org/resources.json"}.
- Pasted or edited JSON uses {"kind":"manual","name":"Edited JSON"}.

Persist and return the optional source field on each event so history retains provenance. Existing events without source remain supported. Counters measure events, including retries. Import is sequential and may partially succeed. On transport failure the UI stops and shows how many responses were confirmed. Check history before retrying. The backend must deduplicate/upsert trusted resources using source and resource identity, while retaining submission events.

### Additional endpoint for the backend
POST /fetch-url receives {"url":"https://..."} and returns {"raw":"<original JSON text>"} for preview only. It must not persist records. Restrict sources to an approved HTTPS host allowlist, reject credentials and redirects, block private/loopback/link-local addresses including resolved addresses, limit the response to 1 MiB and use a timeout shorter than the frontend's 15 seconds. Do not forward browser or service credentials to the source. Return a non-2xx status on fetch failure. The existing validation endpoint remains the only insertion path.

In local demo mode the browser fetches the URL directly with credentials omitted and a 15-second timeout. The source must enable CORS and return JSON without redirects. In gateway mode /fetch-url handles the fetch. A generic webpage URL will fail JSON parsing. Live gateway support remains dependent on these backend endpoints.

## Connected Supabase project
The published frontend is configured for Rafehs Org / supa-soda-hackathon, project ref dbloynewlgozjpqgkyft. The project currently has no public tables or deployed Edge Functions (checked November 4, 2026).

For a local checkout, copy .env.example to .env.local and fill in the existing Supabase publishable key from the project's API settings. Vite includes these public values at build time. Run npm run dev, or npm run build for deployment. The local .env.local is ignored by Git.

When VITE_SUPABASE_URL is configured, the frontend checks GET /auth/v1/settings using the publishable key. A successful check confirms browser access to the project's API; it does not validate the application schema, ingestion routes or row policies. With VITE_GATEWAY_URL empty, the interface shows Backend in progress, permits input previews, and disables import and ingestion actions. Metrics remain unavailable. Failed checks display an error with a Recheck connection action. There is no automatic switch to demo records after a connection failure.

When the backend is ready, set VITE_GATEWAY_URL to the deployed gateway base URL, then rebuild. The frontend checks /dashboard before enabling import. The backend should implement the routes documented above and enforce its chosen authorization and RLS rules. User JWT authentication will need to be integrated if your gateway requires signed-in users. Removing both URL variables enables the original session demo for rehearsals.
