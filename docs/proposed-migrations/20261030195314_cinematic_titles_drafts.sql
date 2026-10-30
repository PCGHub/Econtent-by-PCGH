-- PROPOSED: apply only after owner approval, to Econtent development only.
-- Metadata only; no media, policy, identity or authentication changes.
alter table public.projects add column titles_draft jsonb;
alter table public.projects add constraint titles_draft_metadata_shape check (
 titles_draft is null or coalesce((
  source_metadata is null and composition is null and studio_tracks is null
  and jsonb_typeof(titles_draft) = 'object'
  and octet_length(titles_draft::text) <= 32768
  and titles_draft ?& array['version','document','sources']
  and titles_draft - array['version','document','sources'] = '{}'::jsonb
  and titles_draft->'version' = '1'::jsonb
  and jsonb_typeof(titles_draft->'document') = 'object'
  and titles_draft->'document'->'version' = '1'::jsonb
  and jsonb_typeof(titles_draft->'document'->'scenes') = 'array'
  and jsonb_array_length(titles_draft->'document'->'scenes') between 1 and 12
  and jsonb_typeof(titles_draft->'sources') = 'array'
  and jsonb_array_length(titles_draft->'sources') <= 12
 ), false));
grant insert (titles_draft), update (titles_draft) on public.projects to authenticated;
comment on column public.projects.titles_draft is 'Cinematic titles document and local background fingerprints only; original media stays on device. Existing owner RLS applies.';
