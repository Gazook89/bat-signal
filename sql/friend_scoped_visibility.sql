-- Strict friend-scoped visibility for social data + hybrid location schema.
-- Run this AFTER locations_hybrid_schema.sql.
--
-- Uses this friendships table shape:
--   public.friendships(
--     id uuid,
--     requester_id uuid,
--     addressee_id uuid,
--     status text -- 'accepted' means friendship is active
--   )

begin;

-- Utility function used by RLS policies.
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = a and f.addressee_id = b)
        or
        (f.requester_id = b and f.addressee_id = a)
      )
  );
$$;

revoke all on function public.are_friends(uuid, uuid) from public;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- Keep grants explicit for Data API.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.friendships to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.bat_signals to authenticated;
grant select on table public.location_types to authenticated;
grant select, insert, update, delete on table public.locations_global to authenticated;
grant select, insert, delete on table public.locations_global_types to authenticated;
grant select, insert, update, delete on table public.user_locations to authenticated;

-- Ensure RLS is on.
alter table public.friendships enable row level security;
alter table public.profiles enable row level security;
alter table public.bat_signals enable row level security;
alter table public.location_types enable row level security;
alter table public.locations_global enable row level security;
alter table public.locations_global_types enable row level security;
alter table public.user_locations enable row level security;

-- Remove ALL existing policies on these tables to avoid hidden legacy recursion.
do $$
declare
  rec record;
begin
  for rec in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'friendships',
        'profiles',
        'bat_signals',
        'location_types',
        'locations_global',
        'locations_global_types',
        'user_locations'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', rec.policyname, rec.schemaname, rec.tablename);
  end loop;
end
$$;

-- Friendships: participants can read/update/delete their own relationship rows.
create policy "friendships_select_related"
on public.friendships
for select
to authenticated
using (
  requester_id = auth.uid()
  or addressee_id = auth.uid()
);

create policy "friendships_insert_requester"
on public.friendships
for insert
to authenticated
with check (
  requester_id = auth.uid()
  and addressee_id <> auth.uid()
  and status in ('pending', 'accepted')
);

create policy "friendships_update_participants"
on public.friendships
for update
to authenticated
using (
  requester_id = auth.uid()
  or addressee_id = auth.uid()
)
with check (
  requester_id = auth.uid()
  or addressee_id = auth.uid()
);

create policy "friendships_delete_participants"
on public.friendships
for delete
to authenticated
using (
  requester_id = auth.uid()
  or addressee_id = auth.uid()
);

-- Profiles: self + accepted friends can read. Writes are owner-only.
create policy "profiles_select_self_or_friends"
on public.profiles
for select
to authenticated
using (
  auth.uid() = id
  or public.are_friends(auth.uid(), id)
);

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

-- Bat signals: self + accepted friends can read.
-- Writes are owner-only.
create policy "bat_signals_select_self_or_friends"
on public.bat_signals
for select
to authenticated
using (
  auth.uid() = user_id
  or public.are_friends(auth.uid(), user_id)
);

create policy "bat_signals_insert_own"
on public.bat_signals
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "bat_signals_update_own"
on public.bat_signals
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "bat_signals_delete_own"
on public.bat_signals
for delete
to authenticated
using (auth.uid() = user_id);

-- Hybrid location schema policies.
-- Global locations and type metadata are readable by authenticated users.
-- Global writes are owner-scoped to creator.
create policy "location_types_select_authenticated"
on public.location_types
for select
to authenticated
using (true);

create policy "locations_global_select_authenticated"
on public.locations_global
for select
to authenticated
using (true);

create policy "locations_global_insert_authenticated"
on public.locations_global
for insert
to authenticated
with check (created_by = auth.uid());

create policy "locations_global_update_own"
on public.locations_global
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "locations_global_delete_own"
on public.locations_global
for delete
to authenticated
using (created_by = auth.uid());

create policy "locations_global_types_select_authenticated"
on public.locations_global_types
for select
to authenticated
using (true);

create policy "locations_global_types_insert_authenticated"
on public.locations_global_types
for insert
to authenticated
with check (true);

create policy "locations_global_types_delete_authenticated"
on public.locations_global_types
for delete
to authenticated
using (true);

-- User locations remain private to owner.
create policy "user_locations_select_own"
on public.user_locations
for select
to authenticated
using (user_id = auth.uid());

create policy "user_locations_insert_own"
on public.user_locations
for insert
to authenticated
with check (user_id = auth.uid());

create policy "user_locations_update_own"
on public.user_locations
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "user_locations_delete_own"
on public.user_locations
for delete
to authenticated
using (user_id = auth.uid());

commit;

-- Verification query:
-- select schemaname, tablename, policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('friendships', 'profiles', 'bat_signals', 'location_types', 'locations_global', 'locations_global_types', 'user_locations')
-- order by tablename, policyname;
