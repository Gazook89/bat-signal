-- Unblock access to public.locations for authenticated app users.
-- Run this in the Supabase SQL editor.

-- Basic table privileges for Data API access.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.locations to authenticated;

-- Enable RLS and set temporary permissive policies for rapid development.
alter table public.locations enable row level security;

drop policy if exists "locations_select_authenticated" on public.locations;
drop policy if exists "locations_insert_authenticated" on public.locations;
drop policy if exists "locations_update_authenticated" on public.locations;
drop policy if exists "locations_delete_authenticated" on public.locations;

create policy "locations_select_authenticated"
on public.locations
for select
to authenticated
using (true);

create policy "locations_insert_authenticated"
on public.locations
for insert
to authenticated
with check (true);

create policy "locations_update_authenticated"
on public.locations
for update
to authenticated
using (true)
with check (true);

create policy "locations_delete_authenticated"
on public.locations
for delete
to authenticated
using (true);

-- Helpful verification query:
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename = 'locations';
