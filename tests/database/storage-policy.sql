-- Run only inside the disposable local transaction with a temporary Storage metadata
-- table. This verifies SQL/RLS/accounting, NOT physical object-provider behavior.
insert into auth.users(id,email,email_confirmed_at) values
 ('b3e1ac21-91cb-4450-8225-733381cabf10','storage-owner@example.invalid',now()),
 ('b3e1ac21-91cb-4450-8225-733381cabf11','storage-other@example.invalid',now());
grant select,insert,delete on storage.objects to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b3e1ac21-91cb-4450-8225-733381cabf10","role":"authenticated","is_anonymous":false}',true);
insert into public.projects(title) values ('Cloud policy test');
do $$
declare pid uuid; a jsonb; cfg jsonb; denied boolean;
begin
 select id into pid from public.projects where title='Cloud policy test';
 cfg:=public.project_media_action('usage');
 if cfg->>'plan'<>'free' or (cfg->>'limitBytes')::bigint<>500000000 or (cfg->>'retentionDays')::int<>3 then raise exception 'Wrong Free allowance'; end if;
 a:=public.project_media_action('reserve',jsonb_build_object('projectId',pid,'sha256',repeat('a',64),'name','source.mp4','sizeBytes',4,'mimeType','video/mp4'));
 if (public.project_media_action('usage')->>'usedBytes')::bigint<>4 then raise exception 'Reservation not counted'; end if;
 denied:=false;begin
 insert into storage.objects(name,bucket_id,metadata) values(a->>'object_path','econtent-project-media','{"size":5}');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Underdeclared upload accepted'; end if;
 insert into storage.objects(name,bucket_id,metadata) values(a->>'object_path','econtent-project-media','{"size":4}');
 perform public.project_media_action('finalize',jsonb_build_object('projectId',pid,'assetId',a->>'id'));
 if (select count(*) from storage.objects)<>1 then raise exception 'Owner read failed'; end if;
 denied:=false;begin
 insert into public.storage_plans(owner_id,plan) values(auth.uid(),'premium');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Self promotion allowed'; end if;
 denied:=false;begin
 delete from public.projects where id=pid;
 exception when raise_exception then if sqlerrm like 'Remove project cloud files%' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'Direct project delete bypassed file cleanup'; end if;
 denied:=false;begin
 perform public.project_media_action('release',jsonb_build_object('projectId',pid,'assetId',a->>'id'));
 exception when raise_exception then if sqlerrm like 'Files must be removed%' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'Storage released before deletion'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"b3e1ac21-91cb-4450-8225-733381cabf11","role":"authenticated","is_anonymous":false}',true);
do $$ begin
 if exists(select 1 from public.project_media) or exists(select 1 from storage.objects) then raise exception 'Cross-owner media leak';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"b3e1ac21-91cb-4450-8225-733381cabf10","role":"authenticated","is_anonymous":false}',true);
do $$ declare a public.project_media;begin
 select * into a from public.project_media limit 1;
 perform public.project_media_action('deleting',jsonb_build_object('projectId',a.project_id,'assetId',a.id));
 delete from storage.objects where name=a.object_path;
 perform public.project_media_action('release',jsonb_build_object('projectId',a.project_id,'assetId',a.id));
 if (public.project_media_action('usage')->>'usedBytes')::bigint<>0 then raise exception 'Deletion did not release exact bytes';end if;
 if not exists(select 1 from public.projects where id=a.project_id) then raise exception 'File deletion removed editing settings';end if;
end $$;
reset role;
insert into public.storage_plans(owner_id,plan) values('b3e1ac21-91cb-4450-8225-733381cabf10','premium');
set local role authenticated;
do $$ declare cfg jsonb;begin
 cfg:=public.project_media_action('usage');
 if (cfg->>'limitBytes')::bigint<>5000000000 or (cfg->>'retentionDays')::int<>30 then raise exception 'Premium entitlement not enforced';end if;
end $$;
