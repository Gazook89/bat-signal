-- Enforce one active signal row per user at the database layer.
--
-- Behavior:
-- - On each insert into public.bat_signals, delete any existing rows for that user.
-- - Then insert the new row.
--
-- This physically deletes old rows from the DB (not just hiding them in client).

begin;

create or replace function public.keep_only_latest_signal_per_user()
returns trigger
language plpgsql
as $$
begin
  delete from public.bat_signals
  where user_id = new.user_id;

  return new;
end;
$$;

drop trigger if exists trg_keep_only_latest_signal_per_user on public.bat_signals;

create trigger trg_keep_only_latest_signal_per_user
before insert on public.bat_signals
for each row
execute function public.keep_only_latest_signal_per_user();

commit;
