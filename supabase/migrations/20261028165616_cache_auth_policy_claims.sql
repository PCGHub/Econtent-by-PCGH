-- Evaluate JWT helpers once per statement rather than per project row.
alter policy projects_select_own on public.projects using ((select auth.uid()) = owner_id and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
alter policy projects_insert_own on public.projects with check ((select auth.uid()) = owner_id and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
alter policy projects_update_own on public.projects using ((select auth.uid()) = owner_id and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)) with check ((select auth.uid()) = owner_id and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
alter policy projects_delete_own on public.projects using ((select auth.uid()) = owner_id and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
