"""Read-only production checks: never submit fixtures to the shared workspace."""
import json, urllib.request, urllib.error
from pathlib import Path

env = dict(line.split('=', 1) for line in Path('.env.local').read_text().splitlines())
base, key = env['VITE_GATEWAY_URL'], env['VITE_SUPABASE_PUBLISHABLE_KEY']
def call(path, api_key=key, body=None):
    request = urllib.request.Request(base+path, headers={'apikey':api_key,'Content-Type':'application/json'}, data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)
status, dashboard = call('/dashboard')
assert status == 200 and isinstance(dashboard['events'], list), dashboard
assert call('/dashboard', api_key='invalid')[0] == 401
assert call('/ingest', body={})[0] == 404
status, quality = call('/quality')
assert status == 200 and quality['status'] == 'connected', quality
assert len(quality['reports']) == 3
print(json.dumps({'datasetRecords':dashboard['dataset']['resources'],'totals':dashboard['totals'],'sodabase':[{k:r.get(k) for k in ['table','status','asOf']} for r in quality['reports']]}))
print('PASS: live reads, authentication, removed demo endpoint; no records inserted')
