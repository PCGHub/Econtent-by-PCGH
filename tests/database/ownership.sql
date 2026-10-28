-- Transactional isolation test: no users, projects, or passwords persist.
begin;
insert into auth.users(id,email) values ('b3e1ac21-91cb-4450-8225-733381cabf00','rls-owner@example.invalid'),('b3e1ac21-91cb-4450-8225-733381cabf01','rls-other@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b3e1ac21-91cb-4450-8225-733381cabf00","role":"authenticated","is_anonymous":false}',true);
insert into public.projects(title) values ('RLS transactional test');
update public.projects set title='RLS updated test' where title='RLS transactional test';
do $$ begin
 if (select revision from public.projects where title='RLS updated test') is distinct from 2 then raise exception 'Owner read/update failed'; end if;
 begin
  update public.projects set owner_id='b3e1ac21-91cb-4450-8225-733381cabf01';
  raise exception 'Ownership mutation was allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
select set_config('request.jwt.claims','{"sub":"b3e1ac21-91cb-4450-8225-733381cabf01","role":"authenticated","is_anonymous":false}',true);
do $$ begin
 if exists(select 1 from public.projects where title='RLS updated test') then raise exception 'Cross-user read leak'; end if;
end $$;
update public.projects set title='Cross-user update' where title='RLS updated test';
delete from public.projects where title='RLS updated test';
select set_config('request.jwt.claims','{"sub":"b3e1ac21-91cb-4450-8225-733381cabf00","role":"authenticated","is_anonymous":false}',true);
do $$ begin
 if not exists(select 1 from public.projects where title='RLS updated test' and revision=2) then raise exception 'Cross-user write/delete succeeded'; end if;
end $$;
set local role anon;
do $$ begin
 begin
  perform 1 from public.projects;
  raise exception 'Guest database access was allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
