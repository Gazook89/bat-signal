-- Allow display-name lookups for feed joins while keeping profile writes owner-scoped.
-- Run this in the Supabase SQL editor.

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

-- Temporary development policy: any signed-in user can read profile rows.
-- This is what allows feed joins to show display_name for friends.
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

-- Keep write/delete scoped to the row owner.
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "profiles_delete_own"
on public.profiles
for delete
to authenticated
using (auth.uid() = id);

-- Verification:
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename = 'profiles';
