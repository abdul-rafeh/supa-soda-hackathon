begin;
-- Canonical history/trusted storage lives in the shared fhirguard schema.
-- public.ingestion_events remains the request receipt ledger for idempotency.
insert into fhirguard.trusted_resources(workspace_id,source_key,resource_type,resource_id,payload,updated_at)
select 'hackathon-demo',md5(source_scope),'Patient',resource_id,resource,updated_at from public.patients
on conflict do nothing;
insert into fhirguard.trusted_resources(workspace_id,source_key,resource_type,resource_id,payload,updated_at)
select 'hackathon-demo',md5(source_scope),'Observation',resource_id,resource,updated_at from public.observations
on conflict do nothing;
insert into fhirguard.ingestion_events(event_id,created_at,resource_type,resource_id,raw,structure,integrity,outcome,issues,source,client_tag)
select (event->>'eventId')::uuid,created_at,event->>'type',event->>'resourceId',event->>'raw',event->>'structure',event->>'integrity',event->>'outcome',event->'issues',event->'source','fhirguard-web'
from public.ingestion_events on conflict do nothing;
create or replace function public.fhirguard_store_event(p_event jsonb,p_resource jsonb,p_scope text,p_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 request_id uuid := (p_event->>'eventId')::uuid;
 saved public.ingestion_events;
 structure_issues jsonb;
 result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 select * into saved from public.ingestion_events where id=request_id;
 if found then
  if saved.request_hash <> p_hash then
   raise exception 'Request id already used for a different payload' using errcode='22023';
  end if;
  return saved.event;
 end if;
 select coalesce(jsonb_agg(value),'[]'::jsonb) into structure_issues
 from jsonb_array_elements(p_event->'issues') where value->>'stage'='structure';
 result := public.fhirguard_gateway_record_submission(
  p_event->>'raw',p_resource,structure_issues,p_event->'source','fhirguard-web');
 insert into public.ingestion_events(id,source_scope,request_hash,event)
 values(request_id,p_scope,p_hash,result);
 return result;
end $$;
revoke all on function public.fhirguard_store_event(jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.fhirguard_store_event(jsonb,jsonb,text,text) to service_role;

create or replace function public.fhirguard_dashboard()
returns jsonb language sql security invoker set search_path = '' as $$
  select d || jsonb_build_object('totals',(d->'totals') || jsonb_build_object('ingested',d#>'{totals,submissions}'))
  from (select public.fhirguard_gateway_dashboard() d) shared;
$$;
revoke all on function public.fhirguard_dashboard() from public,anon,authenticated;
grant execute on function public.fhirguard_dashboard() to service_role;
commit;
