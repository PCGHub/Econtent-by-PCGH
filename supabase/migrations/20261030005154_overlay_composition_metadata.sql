-- Additive metadata extension. Existing rows, ownership policies and auth remain intact.
alter table public.projects add column composition jsonb;
alter table public.projects add constraint composition_metadata_shape check (
 composition is null or (
 jsonb_typeof(composition) = 'object'
 and octet_length(composition::text) <= 8192
 and composition ?& array['settings','layer']
 and composition - array['settings','layer'] = '{}'::jsonb
 and jsonb_typeof(composition->'settings') = 'object'
 and composition->'settings' ?& array['version','layout','ratio','resolution','fps','trimStart','trimEnd','overlayStart','overlayEnd','secondaryStart','split','x','y','width','height','opacity','mainFit','overlayFit','mainCropX','mainCropY','cropX','cropY','audio','mainVolume','secondaryVolume']
 and (composition->'settings') - array['version','layout','ratio','resolution','fps','trimStart','trimEnd','overlayStart','overlayEnd','secondaryStart','split','x','y','width','height','opacity','mainFit','overlayFit','mainCropX','mainCropY','cropX','cropY','audio','mainVolume','secondaryVolume'] = '{}'::jsonb
 and jsonb_typeof(composition->'layer') = 'object'
 and composition->'layer' ?& array['kind','name','sizeBytes','durationSeconds','width','height','mimeType','sha256']
 and (composition->'layer') - array['kind','name','sizeBytes','durationSeconds','width','height','mimeType','sha256'] = '{}'::jsonb
 and composition->'settings'->>'version' in ('1')
 and composition->'settings'->>'layout' in ('stack','pip','full')
 and composition->'settings'->>'ratio' in ('9:16','16:9','1:1','4:5')
 and composition->'settings'->>'resolution' in ('360','720')
 and composition->'settings'->>'fps' in ('24','30')
 and composition->'settings'->>'mainFit' in ('cover','contain')
 and composition->'settings'->>'overlayFit' in ('cover','contain')
 and composition->'settings'->>'audio' in ('main','secondary','mix','none')
 and jsonb_typeof(composition->'settings'->'trimStart')='number'
 and (composition->'settings'->>'trimStart')::numeric between 0 and 31536000
 and jsonb_typeof(composition->'settings'->'trimEnd')='number'
 and (composition->'settings'->>'trimEnd')::numeric between 0 and 31536000
 and jsonb_typeof(composition->'settings'->'overlayStart')='number'
 and (composition->'settings'->>'overlayStart')::numeric between 0 and 31536000
 and jsonb_typeof(composition->'settings'->'overlayEnd')='number'
 and (composition->'settings'->>'overlayEnd')::numeric between 0 and 31536000
 and jsonb_typeof(composition->'settings'->'secondaryStart')='number'
 and (composition->'settings'->>'secondaryStart')::numeric between 0 and 31536000
 and jsonb_typeof(composition->'settings'->'split')='number'
 and (composition->'settings'->>'split')::numeric between 0 and 1
 and jsonb_typeof(composition->'settings'->'x')='number'
 and (composition->'settings'->>'x')::numeric between 0 and 1
 and jsonb_typeof(composition->'settings'->'y')='number'
 and (composition->'settings'->>'y')::numeric between 0 and 1
 and jsonb_typeof(composition->'settings'->'width')='number'
 and (composition->'settings'->>'width')::numeric between 0 and 1
 and jsonb_typeof(composition->'settings'->'height')='number'
 and (composition->'settings'->>'height')::numeric between 0 and 1
 and jsonb_typeof(composition->'settings'->'opacity')='number'
 and (composition->'settings'->>'opacity')::numeric between 0 and 1
 and jsonb_typeof(composition->'settings'->'mainCropX')='number'
 and (composition->'settings'->>'mainCropX')::numeric between 0 and 1
 and jsonb_typeof(composition->'settings'->'mainCropY')='number'
 and (composition->'settings'->>'mainCropY')::numeric between 0 and 1
 and jsonb_typeof(composition->'settings'->'cropX')='number'
 and (composition->'settings'->>'cropX')::numeric between 0 and 1
 and jsonb_typeof(composition->'settings'->'cropY')='number'
 and (composition->'settings'->>'cropY')::numeric between 0 and 1
 and jsonb_typeof(composition->'settings'->'mainVolume')='number'
 and (composition->'settings'->>'mainVolume')::numeric between 0 and 1
 and jsonb_typeof(composition->'settings'->'secondaryVolume')='number'
 and (composition->'settings'->>'secondaryVolume')::numeric between 0 and 1
 and composition->'layer'->>'kind' in ('video','image')
 and jsonb_typeof(composition->'layer'->'name')='string' and length(composition->'layer'->>'name') between 1 and 255
 and jsonb_typeof(composition->'layer'->'mimeType')='string' and length(composition->'layer'->>'mimeType') between 1 and 100
 and jsonb_typeof(composition->'layer'->'sha256')='string' and composition->'layer'->>'sha256' ~ '^[a-f0-9]{64}$'
 and jsonb_typeof(composition->'layer'->'sizeBytes')='number'
 and (composition->'layer'->>'sizeBytes')::numeric between 1 and 268435456
 and jsonb_typeof(composition->'layer'->'width')='number'
 and (composition->'layer'->>'width')::numeric between 1 and 65535
 and jsonb_typeof(composition->'layer'->'height')='number'
 and (composition->'layer'->>'height')::numeric between 1 and 65535
 and jsonb_typeof(composition->'layer'->'durationSeconds')='number'
 and (composition->'layer'->>'durationSeconds')::numeric between 0 and 31536000
 and source_metadata is not null
 and edit_mode='manual-trim' and cut_strategy='precision' and compression='off'
 and cut_start=(composition->'settings'->>'trimStart')::numeric and cut_end=(composition->'settings'->>'trimEnd')::numeric
 and (composition->'settings'->>'trimEnd')::numeric > (composition->'settings'->>'trimStart')::numeric
 and (composition->'settings'->>'overlayEnd')::numeric > (composition->'settings'->>'overlayStart')::numeric
 and (composition->'settings'->>'overlayEnd')::numeric <= cut_end-cut_start+0.001
 ));
grant insert (composition), update (composition) on public.projects to authenticated;
comment on column public.projects.composition is 'Overlay metadata and secondary-file fingerprint only. Source media and exports remain local.';
