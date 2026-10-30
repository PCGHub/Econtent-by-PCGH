-- Additive metadata only. No source media, Auth or owner policies are changed.
alter table public.projects add column studio_tracks jsonb;
alter table public.projects add constraint studio_tracks_metadata_shape check (
 studio_tracks is null or (
 composition is not null and jsonb_typeof(studio_tracks)='object'
 and octet_length(studio_tracks::text)<=24576
 and studio_tracks ?& array['settings','sources']
 and studio_tracks - array['settings','sources']='{}'::jsonb
 and jsonb_typeof(studio_tracks->'settings')='object'
 and studio_tracks->'settings' ?& array['version','text','audio','zoom','muteMain','muteSecondary']
 and (studio_tracks->'settings') - array['version','text','audio','zoom','muteMain','muteSecondary']='{}'::jsonb
 and studio_tracks->'settings'->'version'='1'::jsonb
 and jsonb_typeof(studio_tracks->'settings'->'text')='array' and jsonb_array_length(studio_tracks->'settings'->'text')<=8
 and jsonb_typeof(studio_tracks->'settings'->'audio')='array' and jsonb_array_length(studio_tracks->'settings'->'audio')<=4
 and jsonb_typeof(studio_tracks->'settings'->'zoom')='number' and (studio_tracks->'settings'->>'zoom')::numeric between 1 and 8
 and jsonb_typeof(studio_tracks->'settings'->'muteMain')='boolean' and jsonb_typeof(studio_tracks->'settings'->'muteSecondary')='boolean'
 and jsonb_typeof(studio_tracks->'sources')='array' and jsonb_array_length(studio_tracks->'sources')<=4
 ));
grant insert (studio_tracks),update (studio_tracks) on public.projects to authenticated;
comment on column public.projects.studio_tracks is 'Phase 2 timed text/audio settings and local audio fingerprints only; never uploaded media.';
