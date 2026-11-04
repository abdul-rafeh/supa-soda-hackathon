-- Bundle lookups and atomic imports. Existing ingestion functions remain unchanged.
create or replace function public.fhirguard_resolve_references(p_queries jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare q jsonb; matches jsonb; results jsonb := '[]';
begin
 if jsonb_typeof(p_queries) <> 'array' or jsonb_array_length(p_queries)>200 then raise exception 'Too many reference lookups'; end if;
 for q in select value from jsonb_array_elements(p_queries) loop
  select coalesce(jsonb_agg(payload),'[]'::jsonb) into matches from (
   select distinct payload from (
    select r.payload from fhirguard.resources r
    where r.source_id='mimic-iv-fhir-demo:2.1.0' and r.resource_type=q->>'type'
     and (case when q ? 'id' then r.resource_id=q->>'id'
       else r.payload->'identifier' @> jsonb_build_array(jsonb_build_object('system',q->>'system','value',q->>'value')) end)
    union all
    select r.payload from fhirguard.trusted_resources r
    where r.workspace_id='hackathon-demo' and r.resource_type=q->>'type'
     and (case when q ? 'id' then r.resource_id=q->>'id'
       else r.payload->'identifier' @> jsonb_build_array(jsonb_build_object('system',q->>'system','value',q->>'value')) end)
   ) candidates limit 2
  ) unique_candidates;
  results := results || jsonb_build_array(jsonb_build_object('reference',q->>'reference','matches',matches));
 end loop;
 return results;
end $$;
revoke all on function public.fhirguard_resolve_references(jsonb) from public,anon,authenticated;
grant execute on function public.fhirguard_resolve_references(jsonb) to service_role;

create or replace function public.fhirguard_store_bundle(
 p_records jsonb,p_source jsonb,p_request_id uuid,p_hash text,p_create_only boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 saved public.ingestion_events; item jsonb; resource jsonb; event jsonb;
 events jsonb := '[]'; problems jsonb := '[]'; result jsonb;
 bundle_source_key text := md5(p_source::text); n integer;
begin
 if p_records is null or jsonb_typeof(p_records)<>'array' then raise exception 'Records must be an array'; end if;
 n := jsonb_array_length(p_records);
 if n<1 or n>100 or octet_length(p_records::text)>3145728 then raise exception 'Bundle exceeds import limits'; end if;
 if p_request_id is null or p_hash is null or p_source is null then raise exception 'Missing import metadata'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into saved from public.ingestion_events where id=p_request_id;
 if found then
  if saved.request_hash<>p_hash or saved.source_scope<>'bundle' then
   raise exception 'Request id already used for a different payload' using errcode='22023';
  end if;
  return saved.event;
 end if;
 perform pg_advisory_xact_lock(hashtext('fhirguard-demo-write-budget'));
 if p_create_only then
  for item in select value from jsonb_array_elements(p_records) loop
   resource:=item->'resource';
   if exists(select 1 from fhirguard.resources r where r.source_id='mimic-iv-fhir-demo:2.1.0' and r.resource_type=resource->>'resourceType' and r.resource_id=resource->>'id')
    or exists(select 1 from fhirguard.trusted_resources r where r.workspace_id='hackathon-demo' and r.resource_type=resource->>'resourceType' and r.resource_id=resource->>'id') then
    problems:=problems||jsonb_build_array(jsonb_build_object('stage','integrity','path','entry['||(item->>'index')||'].resource.id','message','Create-only transaction resource already exists: '||(resource->>'resourceType')||'/'||(resource->>'id')||'. Use a collection Bundle for an intentional resource re-import.'));
   end if;
  end loop;
  if jsonb_array_length(problems)>0 then return jsonb_build_object('ok',false,'count',n,'inserted',0,'events','[]'::jsonb,'issues',problems); end if;
 end if;
 -- This subtransaction makes forward/cyclic references available to the existing
 -- authoritative validator. Any rejected event rolls back ALL staged resources
 -- and events, including updates to existing resources.
 begin
  for item in select value from jsonb_array_elements(p_records) loop
   resource:=item->'resource';
   if jsonb_typeof(resource)<>'object' or not (resource->>'id' ~ '^[A-Za-z0-9.-]{1,64}$') then raise exception 'Invalid resource'; end if;
   insert into fhirguard.trusted_resources(workspace_id,source_key,resource_type,resource_id,payload)
   values('hackathon-demo',bundle_source_key,resource->>'resourceType',resource->>'id',resource)
   on conflict (workspace_id,source_key,resource_type,resource_id) do update set payload=excluded.payload,updated_at=now();
  end loop;
  for item in select value from jsonb_array_elements(p_records) loop
   event:=public.fhirguard_gateway_record_submission(item->>'raw',item->'resource','[]'::jsonb,p_source,'fhirguard-web');
   if event->>'outcome'<>'accepted' then
    problems:=problems||coalesce(event->'issues','[]'::jsonb);
   end if;
   events:=events||jsonb_build_array(event);
  end loop;
  if jsonb_array_length(problems)>0 then raise exception using errcode='PGB01',message='Bundle integrity check failed'; end if;
 exception when sqlstate 'PGB01' then
  return jsonb_build_object('ok',false,'count',n,'inserted',0,'events','[]'::jsonb,'issues',problems);
 end;
 result:=jsonb_build_object('ok',true,'count',n,'inserted',n,'events',events,'issues','[]'::jsonb);
 insert into public.ingestion_events(id,source_scope,request_hash,event) values(p_request_id,'bundle',p_hash,result);
 return result;
end $$;
revoke all on function public.fhirguard_store_bundle(jsonb,jsonb,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.fhirguard_store_bundle(jsonb,jsonb,uuid,text,boolean) to service_role;
