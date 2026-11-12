-- TOS: adding and renaming bays moves here from Trip Scheduling's Bays page.
--
-- With 202611111000 (bays are switched on and off in TOS only) TOS already owned
-- the bay list; Add bay and Rename were the last two things left on Trip
-- Scheduling's Bays page. Trip Scheduling's page is now a pointer to TOS, so
-- these two functions are the staff-only way to add a bay or rename one. They
-- write public.bays (Trip Scheduling's table), so the change is also logged as
-- Trip Scheduling entry 128 for review.
--
--   tos_add_bay(name)            new bays start in service, with no gate
--   tos_rename_bay(bay, name)    name must be non-empty and not used by another bay
--
-- Gates are still set outside the app (bays.gate), and TOS Devices & rules
-- keeps the in/out of service switch and floors.

create or replace function public.tos_add_bay(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  n text := nullif(btrim(coalesce(p_name, '')), '');
  b public.bays;
begin
  if not public.is_staff() then raise exception 'Only terminal staff can add a bay'; end if;
  if n is null then raise exception 'Bay name is required'; end if;
  if exists (select 1 from public.bays where lower(name) = lower(n)) then
    raise exception 'A bay named "%" already exists', n;
  end if;
  insert into public.bays (name) values (n) returning * into b;
  return jsonb_build_object('id', b.id, 'name', b.name);
end $$;
revoke all on function public.tos_add_bay(text) from public, anon;
grant execute on function public.tos_add_bay(text) to authenticated;

create or replace function public.tos_rename_bay(p_bay bigint, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, tos
as $$
declare
  n text := nullif(btrim(coalesce(p_name, '')), '');
  b public.bays;
begin
  if not public.is_staff() then raise exception 'Only terminal staff can rename a bay'; end if;
  if n is null then raise exception 'Bay name is required'; end if;
  select * into b from public.bays where id = p_bay;
  if not found then raise exception 'Unknown bay'; end if;
  if exists (select 1 from public.bays where lower(name) = lower(n) and id <> p_bay) then
    raise exception 'A bay named "%" already exists', n;
  end if;
  update public.bays set name = n where id = p_bay returning * into b;
  return jsonb_build_object('id', b.id, 'name', b.name);
end $$;
revoke all on function public.tos_rename_bay(bigint, text) from public, anon;
grant execute on function public.tos_rename_bay(bigint, text) to authenticated;

notify pgrst, 'reload schema';
