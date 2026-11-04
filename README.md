# FHIRGuard frontend
React, Vite and Tailwind. Install with npm ci and launch with npm run dev. Run npm test and npm run build before deploying.

## Rehearse the demo
Select and validate Patient, then Observation, then Broken reference. Open Dashboard, filter Quarantined and expand the event. The demo uses session memory, so reloading starts a clean run. The Run demo batch button submits all three examples. Counters measure submission events, including repeated attempts. Demo checks cover selected fields only.

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
