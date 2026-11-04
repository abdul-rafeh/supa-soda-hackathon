begin;

create table public.ingestion_events (
  id uuid primary key,
  created_at timestamptz not null default now(),
  source_scope text not null,
  request_hash text not null,
  event jsonb not null
);
create index ingestion_events_created_at_idx on public.ingestion_events (created_at desc, id);

create table public.patients (
  source_scope text not null,
  resource_id text not null,
  resource jsonb not null check (resource->>'resourceType' = 'Patient'),
  updated_at timestamptz not null default now(),
  primary key (source_scope, resource_id)
);

create table public.observations (
  source_scope text not null,
  resource_id text not null,
  patient_id text not null,
  resource jsonb not null check (resource->>'resourceType' = 'Observation'),
  updated_at timestamptz not null default now(),
  primary key (source_scope, resource_id),
  foreign key (source_scope, patient_id) references public.patients(source_scope, resource_id)
);
create index observations_patient_idx on public.observations(source_scope, patient_id);

create table public.validation_issues (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.ingestion_events(id),
  stage text not null,
  path text not null,
  message text not null,
  severity text not null default 'error'
);
create index validation_issues_event_idx on public.validation_issues(event_id);

alter table public.ingestion_events enable row level security;
alter table public.patients enable row level security;
alter table public.observations enable row level security;
alter table public.validation_issues enable row level security;
revoke all on public.ingestion_events, public.patients, public.observations, public.validation_issues from public, anon, authenticated;
grant all on public.ingestion_events, public.patients, public.observations, public.validation_issues to service_role;
grant usage, select on sequence public.validation_issues_id_seq to service_role;

-- The Edge Function is the sole caller. Reference checking and writes are atomic.
create function public.fhirguard_store_event(p_event jsonb, p_resource jsonb, p_scope text, p_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  event_id uuid := (p_event->>'eventId')::uuid;
  saved public.ingestion_events;
  resource_id text := p_resource->>'id';
  reference text := p_resource #>> '{subject,reference}';
  patient_id text;
  issues jsonb;
  result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(event_id::text, 0));
  select * into saved from public.ingestion_events where id = event_id;
  if found then
    if saved.request_hash <> p_hash then
      raise exception 'Request id already used for a different payload' using errcode = '22023';
    end if;
    return saved.event;
  end if;

  -- Only structural issues come from the shared validator. Resolve references here.
  select coalesce(jsonb_agg(value), '[]'::jsonb) into issues
    from jsonb_array_elements(p_event->'issues') where value->>'stage' = 'structure';

  if p_event->>'structure' = 'passed' then
    if resource_id is null or resource_id = '' then
      issues := issues || jsonb_build_array(jsonb_build_object('stage','integrity','path','id','message','Local ingestion requires a resource id.'));
    end if;
    if p_resource->>'resourceType' = 'Observation' then
      patient_id := substring(reference from '^Patient/([A-Za-z0-9.-]{1,64})$');
      perform 1 from public.patients where source_scope = p_scope and patients.resource_id = patient_id for key share;
      if not found then
        issues := issues || jsonb_build_array(jsonb_build_object('stage','integrity','path','subject.reference','message',coalesce(reference,'Patient reference') || ' does not resolve to an accepted Patient in this source.'));
      end if;
    end if;
  end if;

  result := p_event || jsonb_build_object(
    'time', now(),
    'issues', issues,
    'integrity', case when p_event->>'structure' = 'failed' then 'skipped' when jsonb_array_length(issues) > 0 then 'failed' else 'passed' end,
    'outcome', case when jsonb_array_length(issues) > 0 then 'quarantined' else 'accepted' end
  );

  if result->>'outcome' = 'accepted' then
    if p_resource->>'resourceType' = 'Patient' then
      insert into public.patients values(p_scope, resource_id, p_resource, now())
        on conflict on constraint patients_pkey do update set resource = excluded.resource, updated_at = now();
    elsif p_resource->>'resourceType' = 'Observation' then
      insert into public.observations values(p_scope, resource_id, patient_id, p_resource, now())
        on conflict on constraint observations_pkey do update set resource = excluded.resource, patient_id = excluded.patient_id, updated_at = now();
    end if;
  end if;

  insert into public.ingestion_events(id,source_scope,request_hash,event) values(event_id,p_scope,p_hash,result);
  insert into public.validation_issues(event_id,stage,path,message)
    select event_id, value->>'stage', value->>'path', value->>'message' from jsonb_array_elements(issues);
  return result;
end $$;
revoke all on function public.fhirguard_store_event(jsonb,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.fhirguard_store_event(jsonb,jsonb,text,text) to service_role;

create function public.fhirguard_dashboard()
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object(
    'events', coalesce((select jsonb_agg(event order by created_at desc, id) from (
      select event, created_at, id from public.ingestion_events order by created_at desc, id limit 100
    ) recent), '[]'::jsonb),
    'totals', jsonb_build_object(
      'ingested', count(*),
      'accepted', count(*) filter (where event->>'outcome' = 'accepted'),
      'quarantined', count(*) filter (where event->>'outcome' = 'quarantined')
    ),
    'score', null
  ) from public.ingestion_events;
$$;
revoke all on function public.fhirguard_dashboard() from public, anon, authenticated;
grant execute on function public.fhirguard_dashboard() to service_role;

commit;
