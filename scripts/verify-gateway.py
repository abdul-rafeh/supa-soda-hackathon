import json, uuid, urllib.request, urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

env = dict(line.split('=', 1) for line in Path('.env.local').read_text().splitlines())
base = env['VITE_GATEWAY_URL']
key = env['VITE_SUPABASE_PUBLISHABLE_KEY']

def call(path, body=None, api_key=key):
    headers = {'apikey': api_key, 'Content-Type':'application/json'}
    request = urllib.request.Request(base+path, headers=headers, data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)

status, result = call('/dashboard')
print('dashboard', status)
assert status == 200, result
assert call('/dashboard', api_key='invalid')[0] == 401
patient = {'resourceType':'Patient','id':'gateway-test-patient','active':True}
observation = {'resourceType':'Observation','id':'gateway-test-observation','status':'final','code':{'text':'Temperature'},'subject':{'reference':'Patient/gateway-test-patient'}}
broken = {**observation,'id':'gateway-test-missing','subject':{'reference':'Patient/missing-gateway-test'}}
bodies = [{'raw':json.dumps(r),'source':{'kind':'manual','name':'Gateway verification'},'requestId':str(uuid.uuid4())} for r in [patient,observation,broken]]
first_event_id = None
for body, expected in zip(bodies, ['accepted','accepted','quarantined']):
    status, event = call('/validate', body)
    print('validate', status, event.get('outcome'), event.get('issues'))
    assert status == 200 and event['outcome'] == expected, event
    if first_event_id is None: first_event_id = event['eventId']
# A repeated request must resolve to the original persisted event.
with ThreadPoolExecutor(max_workers=3) as executor:
    repeats = list(executor.map(lambda _:call('/validate', bodies[0]), range(3)))
assert all(status == 200 and event['eventId'] == first_event_id for status,event in repeats), repeats
conflict={**bodies[0],'raw':json.dumps({**patient,'active':False})}
assert call('/validate',conflict)[0] == 409
status,event=call('/validate',{'raw':'{broken','source':{'kind':'manual','name':'Gateway verification'}})
assert status == 200 and event['structure'] == 'failed' and event['integrity']=='skipped', event
assert call('/fetch-url',{'url':'https://127.0.0.1/admin'})[0] == 400
status,preview=call('/fetch-url',{'url':'https://hapi.fhir.org/baseR4/Patient?_count=1&_format=json'})
print('url preview',status)
assert status == 200 and json.loads(preview['raw'])['resourceType']=='Bundle', preview
status,dashboard=call('/dashboard')
assert status == 200 and dashboard['totals']['ingested'] >= 4, dashboard
assert dashboard['score'] is None
print('PASS: storage, quarantine, replay, conflict, API-key auth, URL restriction, HAPI preview, dashboard')
