begin;

grant usage on schema public to authenticated;

-- Ensure blocked is accepted as a valid friendship status.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'friendships'
  ) then
    alter table public.friendships
      drop constraint if exists friendships_status_check;

    alter table public.friendships
      add constraint friendships_status_check
      check (status in ('pending', 'accepted', 'blocked'));
  end if;
end $$;

-- Exact-match lookup used by the Friends page search form.
create or replace function public.find_profiles_exact(term text)
returns table (
  id uuid,
  email text,
  display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.email, p.display_name
  from public.profiles p
  where p.email = lower(trim(term))
     or p.display_name = trim(term)
  order by p.display_name nulls last, p.email
  limit 20;
$$;

revoke all on function public.find_profiles_exact(text) from public;
grant execute on function public.find_profiles_exact(text) to authenticated;

-- Basic profile projection used to render names for friendship rows,
-- including pending requests before users are accepted friends.
create or replace function public.get_profiles_basic(profile_ids uuid[])
returns table (
  id uuid,
  email text,
  display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.email, p.display_name
  from public.profiles p
  where p.id = any(profile_ids);
$$;

revoke all on function public.get_profiles_basic(uuid[]) from public;
grant execute on function public.get_profiles_basic(uuid[]) to authenticated;

-- Allow explicit block rows in friendships.
drop policy if exists "friendships_insert_requester" on public.friendships;

create policy "friendships_insert_requester"
on public.friendships
for insert
to authenticated
with check (
  requester_id = auth.uid()
  and addressee_id <> auth.uid()
  and status in ('pending', 'accepted', 'blocked')
);

-- Prevent new pending/accepted requests when the target has blocked the requester.
create or replace function public.prevent_friend_request_when_blocked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.requester_id = new.addressee_id then
    raise exception 'Cannot create a friendship with yourself.';
  end if;

  if new.status in ('pending', 'accepted') and exists (
    select 1
    from public.friendships f
    where f.requester_id = new.addressee_id
      and f.addressee_id = new.requester_id
      and f.status = 'blocked'
      and (tg_op = 'INSERT' or f.id <> new.id)
  ) then
    raise exception 'This user has blocked you.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_friend_request_when_blocked on public.friendships;

create trigger trg_prevent_friend_request_when_blocked
before insert or update of requester_id, addressee_id, status
on public.friendships
for each row
execute function public.prevent_friend_request_when_blocked();

commit;