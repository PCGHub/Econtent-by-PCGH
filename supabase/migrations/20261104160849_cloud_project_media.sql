alter table public.projects add column multitrack_draft jsonb check(multitrack_draft is null or (jsonb_typeof(multitrack_draft)='object' and octet_length(multitrack_draft::text)<=32768));
grant insert(multitrack_draft), update(multitrack_draft) on public.projects to authenticated;
-- Additive development-only storage. No billing or production changes.
create schema if not exists econtent_private;
revoke all on schema econtent_private from public, anon;
grant usage on schema econtent_private to authenticated, service_role;
create table public.storage_plans (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 plan text not null default 'free' check(plan in ('free','premium')),
 valid_until timestamptz
);
alter table public.storage_plans enable row level security;
create policy storage_plans_read on public.storage_plans for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.storage_plans from public, anon, authenticated;
grant select on public.storage_plans to authenticated;
create table public.project_media (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id),
 owner_id uuid not null references auth.users(id),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 name text not null check(length(name) between 1 and 255),
 mime_type text not null check(length(mime_type) between 1 and 100),
 size_bytes bigint not null check(size_bytes between 1 and 50000000),
 object_path text not null unique,
 state text not null default 'pending' check(state in ('pending','ready','deleting')),
 expires_at timestamptz not null,
 upload_until timestamptz not null default now()+interval '1 hour',
 created_at timestamptz not null default now(),
 unique(project_id,sha256)
);
create index project_media_owner_idx on public.project_media(owner_id);
create index project_media_expiry_idx on public.project_media(expires_at);
alter table public.project_media enable row level security;
create policy project_media_read on public.project_media for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.project_media from public, anon, authenticated;
grant select on public.project_media to authenticated;
-- No user-controlled plan claims; only administrators/service roles can grant Premium.
create function econtent_private.storage_plan() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('plan',case when premium then 'premium' else 'free' end,
 'limitBytes',case when premium then 5000000000::bigint else 500000000 end,
 'retentionDays',case when premium then 30 else 3 end,
 'maxFileBytes',50000000,'usedBytes',(select coalesce(sum(size_bytes),0) from public.project_media where owner_id=auth.uid()))
 from (select exists(select 1 from public.storage_plans where owner_id=auth.uid() and plan='premium' and (valid_until is null or valid_until>now())) premium) s;
$$;
revoke all on function econtent_private.storage_plan() from public, anon;
grant execute on function econtent_private.storage_plan() to authenticated;
create function econtent_private.media_action(action text, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); pid uuid; p public.projects; a public.project_media; cfg jsonb; expiry timestamptz;
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'Verified sign-in required' using errcode='42501'; end if;
 -- Global lock protects the development bucket cap as well as per-user concurrent reservations.
 perform pg_advisory_xact_lock(118039457,1);
 cfg:=econtent_private.storage_plan();
 if action='usage' then return cfg; end if;
 pid:=(payload->>'projectId')::uuid;
 select * into p from public.projects where id=pid and owner_id=uid for update;
 if not found then raise exception 'Project not found' using errcode='42501'; end if;
 if action='list' then return jsonb_build_object('usage',cfg,'assets',coalesce((select jsonb_agg(to_jsonb(m)) from public.project_media m where project_id=pid),'[]'::jsonb)); end if;
 if action='reserve' then
  expiry:=p.created_at+make_interval(days=>(cfg->>'retentionDays')::integer);
  if expiry<=now() then raise exception 'This project storage window has expired. Your edits remain saved. Create a new project to store media again.'; end if;
  if payload->>'sha256' !~ '^[a-f0-9]{64}$' or length(payload->>'name') not between 1 and 255 or length(payload->>'mimeType') not between 1 and 100 or (payload->>'sizeBytes')::bigint not between 1 and 50000000 then raise exception 'Invalid media or file exceeds the 50 MB development upload limit'; end if;
  select * into a from public.project_media where project_id=pid and sha256=payload->>'sha256' for update;
  if found then
   if a.state='deleting' then raise exception 'File deletion is in progress. Retry after it finishes.'; end if;
   if a.size_bytes<>(payload->>'sizeBytes')::bigint then raise exception 'File identity differs'; end if;
   if a.state='pending' then update public.project_media set upload_until=now()+interval '1 hour' where id=a.id returning * into a; end if;
   return to_jsonb(a);
  end if;
  if (cfg->>'usedBytes')::bigint+(payload->>'sizeBytes')::bigint>(cfg->>'limitBytes')::bigint then raise exception 'Storage full. Delete cloud files or upgrade your plan before uploading.'; end if;
  -- Free development project has 1 GB total storage. Keep headroom; never enable billing.
  if (select coalesce(sum(size_bytes),0) from public.project_media)+(payload->>'sizeBytes')::bigint>900000000 then raise exception 'Preview storage is full. Remove test files before uploading more.'; end if;
  insert into public.project_media(project_id,owner_id,sha256,name,mime_type,size_bytes,object_path,expires_at)
  values(pid,uid,payload->>'sha256',payload->>'name',payload->>'mimeType',(payload->>'sizeBytes')::bigint,uid::text||'/'||pid::text||'/'||gen_random_uuid()::text,expiry) returning * into a;
  return to_jsonb(a);
 end if;
 select * into a from public.project_media where project_id=pid and id=(payload->>'assetId')::uuid for update;
 if not found then raise exception 'Media not found' using errcode='42501'; end if;
 if action='finalize' then
  if a.state<>'pending' or a.expires_at<=now() then raise exception 'Upload no longer active'; end if;
  if not exists(select 1 from storage.objects where bucket_id='econtent-project-media' and name=a.object_path and (metadata->>'size')::bigint=a.size_bytes) then raise exception 'Upload has not completed or its size differs'; end if;
  update public.project_media set state='ready' where id=a.id returning * into a;
 elsif action='deleting' then
  update public.project_media set state='deleting' where id=a.id returning * into a;
 elsif action='release' then
  if a.state<>'deleting' or exists(select 1 from storage.objects where bucket_id='econtent-project-media' and name=a.object_path) then raise exception 'Files must be removed before storage is released'; end if;
  delete from public.project_media where id=a.id;
 else raise exception 'Unknown media operation';
 end if;
 return to_jsonb(a);
end $$;
revoke all on function econtent_private.media_action(text,jsonb) from public, anon;
grant execute on function econtent_private.media_action(text,jsonb) to authenticated;
create function public.project_media_action(action text,payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$ select econtent_private.media_action(action,payload); $$;
revoke all on function public.project_media_action(text,jsonb) from public, anon;
grant execute on function public.project_media_action(text,jsonb) to authenticated;
-- Storage API RLS checks the actual uploaded byte count; clients cannot underdeclare size.
create function econtent_private.media_access(path text,bytes bigint,writing boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare a public.project_media;
begin
 if writing then
  select * into a from public.project_media where object_path=path and owner_id=auth.uid() for share;
 else
  select * into a from public.project_media where object_path=path and owner_id=auth.uid();
 end if;
 if not found or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then return false; end if;
 if writing then return a.state='pending' and a.upload_until>now() and a.expires_at>now() and a.size_bytes=bytes; end if;
 return a.state='deleting' or (a.state='ready' and a.expires_at>now());
end $$;
revoke all on function econtent_private.media_access(text,bigint,boolean) from public, anon;
grant execute on function econtent_private.media_access(text,bigint,boolean) to authenticated;
create policy econtent_media_select on storage.objects for select to authenticated using(bucket_id='econtent-project-media' and econtent_private.media_access(name,0,false));
create policy econtent_media_insert on storage.objects for insert to authenticated with check(bucket_id='econtent-project-media' and econtent_private.media_access(name,(metadata->>'size')::bigint,true));
create policy econtent_media_delete on storage.objects for delete to authenticated using(bucket_id='econtent-project-media' and exists(select 1 from public.project_media m where m.object_path=storage.objects.name and m.owner_id=(select auth.uid()) and m.state='deleting'));
-- Guard direct Data API deletion too; never orphan billable objects via cascading SQL.
create function econtent_private.guard_media_project_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.project_media where project_id=old.id) then raise exception 'Remove project cloud files before deleting its settings'; end if;
 return old;
end $$;
revoke all on function econtent_private.guard_media_project_delete() from public, anon, authenticated;
create trigger projects_guard_media_delete before delete on public.projects for each row execute function econtent_private.guard_media_project_delete();
-- Upgrades extend only unexpired files. Downgrades preserve the already promised deadline.
create function econtent_private.extend_media_plan() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.plan='premium' and (new.valid_until is null or new.valid_until>now()) then
 update public.project_media m set expires_at=greatest(m.expires_at,p.created_at+interval '30 days') from public.projects p where p.id=m.project_id and m.owner_id=new.owner_id and m.expires_at>now();
 end if;
 return new;
end $$;
revoke all on function econtent_private.extend_media_plan() from public, anon, authenticated;
create trigger storage_plan_upgrade after insert or update on public.storage_plans for each row execute function econtent_private.extend_media_plan();
grant all on public.project_media, public.storage_plans to service_role;

-- Retire the older unmetered Library upload route while keeping existing downloads.
create policy econtent_legacy_library_no_new_uploads on storage.objects as restrictive for insert to authenticated with check(bucket_id <> 'econtent-library');
