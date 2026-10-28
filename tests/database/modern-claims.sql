-- Match current managed Supabase helpers after GoTrue's historical migrations.
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid $$;
