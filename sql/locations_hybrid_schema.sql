begin;

-- Shared location type catalog.
create table if not exists public.location_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  created_at timestamptz not null default now()
);

-- Shared global locations available to all authenticated users.
create table if not exists public.locations_global (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  website text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Global location -> type mapping (many to many).
create table if not exists public.locations_global_types (
  location_id uuid not null references public.locations_global(id) on delete cascade,
  type_id uuid not null references public.location_types(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (location_id, type_id)
);

-- User-specific saved locations.
create table if not exists public.user_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  global_location_id uuid references public.locations_global(id) on delete set null,
  custom_name text,
  custom_address text,
  custom_website text,
  is_starred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_locations_has_source check (
    global_location_id is not null or custom_name is not null
  )
);

-- Optional bat_signals linking to user_locations for richer signal context.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'bat_signals'
  ) then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'bat_signals'
        and column_name = 'user_location_id'
    ) then
      alter table public.bat_signals
        add column user_location_id uuid;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'bat_signals_user_location_id_fkey'
    ) then
      alter table public.bat_signals
        add constraint bat_signals_user_location_id_fkey
        foreign key (user_location_id)
        references public.user_locations(id)
        on delete cascade;
    end if;
  end if;
end $$;

-- Helpful indexes.
create index if not exists idx_locations_global_name on public.locations_global(name);
create index if not exists idx_locations_global_created_by on public.locations_global(created_by);
create index if not exists idx_locations_global_types_type_id on public.locations_global_types(type_id);
create index if not exists idx_user_locations_user_id on public.user_locations(user_id);
create index if not exists idx_user_locations_global_location_id on public.user_locations(global_location_id);

grant usage on schema public to authenticated;
grant select on public.location_types to authenticated;
grant select on public.locations_global to authenticated;
grant select on public.locations_global_types to authenticated;
grant select, insert, update, delete on public.user_locations to authenticated;

-- Optional: allow authenticated users to contribute global entries.
grant insert, update, delete on public.locations_global to authenticated;
grant insert, delete on public.locations_global_types to authenticated;

alter table public.location_types enable row level security;
alter table public.locations_global enable row level security;
alter table public.locations_global_types enable row level security;
alter table public.user_locations enable row level security;

-- Idempotent policy reset for this migration's tables.
do $$
declare
  rec record;
begin
  for rec in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('location_types', 'locations_global', 'locations_global_types', 'user_locations')
  loop
    execute format('drop policy if exists %I on %I.%I', rec.policyname, rec.schemaname, rec.tablename);
  end loop;
end $$;

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
