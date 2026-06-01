-- Unblock access to public.bat_signals for authenticated app users.
-- Run this in the Supabase SQL editor.

-- Basic table privileges for Data API access.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.bat_signals to authenticated;

-- Enable RLS and set temporary permissive policies for rapid development.
alter table public.bat_signals enable row level security;

drop policy if exists "bat_signals_select_authenticated" on public.bat_signals;
drop policy if exists "bat_signals_insert_authenticated" on public.bat_signals;
drop policy if exists "bat_signals_update_authenticated" on public.bat_signals;
drop policy if exists "bat_signals_delete_authenticated" on public.bat_signals;

create policy "bat_signals_select_authenticated"
on public.bat_signals
for select
to authenticated
using (true);

create policy "bat_signals_insert_authenticated"
on public.bat_signals
for insert
to authenticated
with check (true);

create policy "bat_signals_update_authenticated"
on public.bat_signals
for update
to authenticated
using (true)
with check (true);

create policy "bat_signals_delete_authenticated"
on public.bat_signals
for delete
to authenticated
using (true);

-- Helpful verification query:
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename = 'bat_signals';
