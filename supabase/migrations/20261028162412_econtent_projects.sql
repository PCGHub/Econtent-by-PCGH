-- Econtent development schema. Metadata and edit decisions only; never original videos.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Untitled project' check (char_length(btrim(title)) between 1 and 120),
  edit_mode text not null default 'manual-trim' check (edit_mode in ('full-split','section-split','manual-trim','compress-only')),
  cut_start double precision not null default 0 check (cut_start between 0 and 31536000),
  cut_end double precision not null default 0 check (cut_end between 0 and 31536000 and cut_end >= cut_start),
  clip_duration double precision not null default 30 check (clip_duration > 0 and clip_duration <= 31536000),
  keep_remainder boolean not null default true,
  compression text not null default 'off' check (compression in ('off','high','balanced','small')),
  cut_strategy text not null default 'fast' check (cut_strategy in ('fast','precision')),
  source_metadata jsonb,
  status text not null default 'draft' check (status in ('draft','processing','completed','cancelled','failed')),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compression_uses_precision check (compression = 'off' or cut_strategy = 'precision'),
  constraint source_metadata_shape check (source_metadata is null or (
    jsonb_typeof(source_metadata) = 'object'
    and octet_length(source_metadata::text) <= 4096
    and source_metadata ?& array['name','sizeBytes','durationSeconds','width','height','mimeType','sha256']
    and source_metadata - array['name','sizeBytes','durationSeconds','width','height','mimeType','sha256'] = '{}'::jsonb
    and jsonb_typeof(source_metadata->'name') = 'string' and char_length(source_metadata->>'name') between 1 and 255
    and jsonb_typeof(source_metadata->'mimeType') = 'string' and char_length(source_metadata->>'mimeType') <= 100
    and jsonb_typeof(source_metadata->'sha256') = 'string' and source_metadata->>'sha256' ~ '^[a-f0-9]{64}$'
    and jsonb_typeof(source_metadata->'sizeBytes') = 'number' and (source_metadata->>'sizeBytes')::numeric between 1 and 268435456
    and trunc((source_metadata->>'sizeBytes')::numeric) = (source_metadata->>'sizeBytes')::numeric
    and jsonb_typeof(source_metadata->'durationSeconds') = 'number' and (source_metadata->>'durationSeconds')::numeric > 0 and (source_metadata->>'durationSeconds')::numeric <= 31536000
    and jsonb_typeof(source_metadata->'width') = 'number' and (source_metadata->>'width')::numeric between 1 and 65535
    and trunc((source_metadata->>'width')::numeric) = (source_metadata->>'width')::numeric
    and jsonb_typeof(source_metadata->'height') = 'number' and (source_metadata->>'height')::numeric between 1 and 65535
    and trunc((source_metadata->>'height')::numeric) = (source_metadata->>'height')::numeric
  )),
  constraint source_range_bounds check (source_metadata is null or (
    cut_end <= (source_metadata->>'durationSeconds')::numeric + 0.05
    and (edit_mode not in ('manual-trim','section-split') or cut_end > cut_start)
  ))
);
create index projects_owner_updated_idx on public.projects(owner_id, updated_at desc, id);
create index projects_owner_title_idx on public.projects(owner_id, lower(title), id);

alter table public.projects enable row level security;
alter table public.projects force row level security;

create policy projects_select_own on public.projects for select to authenticated
  using ((select auth.uid()) = owner_id and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false));
create policy projects_insert_own on public.projects for insert to authenticated
  with check ((select auth.uid()) = owner_id and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false));
create policy projects_update_own on public.projects for update to authenticated
  using ((select auth.uid()) = owner_id and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false))
  with check ((select auth.uid()) = owner_id and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false));
create policy projects_delete_own on public.projects for delete to authenticated
  using ((select auth.uid()) = owner_id and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false));

revoke all on table public.projects from public, anon, authenticated;
grant select, delete on table public.projects to authenticated;
grant insert (title,edit_mode,cut_start,cut_end,clip_duration,keep_remainder,compression,cut_strategy,source_metadata,status) on public.projects to authenticated;
grant update (title,edit_mode,cut_start,cut_end,clip_duration,keep_remainder,compression,cut_strategy,source_metadata,status) on public.projects to authenticated;

create function public.touch_econtent_project() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id or new.created_at is distinct from old.created_at then
    raise exception 'Project identity and ownership are immutable' using errcode = '42501';
  end if;
  new.updated_at = clock_timestamp();
  new.revision = old.revision + 1;
  return new;
end;
$$;
revoke all on function public.touch_econtent_project() from public, anon, authenticated;
create trigger projects_touch before update on public.projects for each row execute function public.touch_econtent_project();
comment on table public.projects is 'Econtent private project metadata. Source media and exports remain local and are not uploaded.';
