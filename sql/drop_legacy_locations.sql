begin;

-- Repoint bat_signals.location_id to the new global locations table.
-- NOT VALID avoids failing on any existing fake-data rows that still point at old IDs.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bat_signals'
      and column_name = 'location_id'
  ) then
    alter table public.bat_signals
      drop constraint if exists bat_signals_location_id_fkey;

    alter table public.bat_signals
      add constraint bat_signals_location_id_fkey
      foreign key (location_id)
      references public.locations_global(id)
      on delete cascade
      not valid;
  end if;
end $$;

-- Remove the old compatibility table and any leftover policies on it.
do $$
declare
  rec record;
begin
  for rec in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'locations'
  loop
    execute format('drop policy if exists %I on %I.%I', rec.policyname, rec.schemaname, rec.tablename);
  end loop;
end $$;

drop table if exists public.locations cascade;

commit;