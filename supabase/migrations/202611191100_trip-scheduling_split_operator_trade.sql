-- Trip Scheduling: staff can split a trade out of an operator account into a
-- separate account (the reverse of staff_merge_operators, 202611191000).
--
-- A "trade" is vehicles.trade_name (0036): one account can run several trades.
-- staff_split_operator_trade(source, target, trade_names) moves every vehicle
-- of the source whose trade_name is in the list to the target operator
-- account, and moves that vehicle's bookings with it (matched by plate; the
-- booking's operator_name snapshot follows the target). Trade names are
-- matched case-insensitively. The target must be an existing operator account
-- (the Accounts page creates a fresh one first via create-account).
--
-- Not moved: notifications and the company profile - the new account fills in
-- its own profile. One transaction; any failure rolls back.

create or replace function public.staff_split_operator_trade(
  p_source uuid,
  p_target uuid,
  p_trade_names text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src      public.profiles%rowtype;
  v_tgt      public.profiles%rowtype;
  v_trades   text[];
  v_name     text;
  v_dups     text;
  n_vehicles int;
  n_bookings int;
begin
  if not public.is_staff() then
    raise exception 'Only staff can split operator accounts.';
  end if;

  select * into v_src from public.profiles where id = p_source and role = 'operator' for update;
  select * into v_tgt from public.profiles where id = p_target and role = 'operator' for update;
  if v_src.id is null or v_tgt.id is null then
    raise exception 'Both accounts must be bus-operator accounts.';
  end if;
  if v_src.id = v_tgt.id then
    raise exception 'Pick two different accounts.';
  end if;

  select array_agg(distinct lower(btrim(t))) into v_trades
  from unnest(coalesce(p_trade_names, '{}')) t
  where nullif(btrim(t), '') is not null;
  if v_trades is null then
    raise exception 'Pick at least one trade to split off.';
  end if;

  v_name := coalesce(v_tgt.operator_name, v_tgt.username);

  -- the target may already own a vehicle with one of these plates
  select string_agg(sv.plate_no, ', ' order by sv.plate_no) into v_dups
  from public.vehicles sv
  join public.vehicles tv
    on tv.operator_id = p_target
   and regexp_replace(upper(tv.plate_no), '[^A-Z0-9]', '', 'g')
     = regexp_replace(upper(sv.plate_no), '[^A-Z0-9]', '', 'g')
  where sv.operator_id = p_source
    and lower(btrim(coalesce(sv.trade_name, ''))) = any (v_trades);
  if v_dups is not null then
    raise exception
      'The receiving account already has a vehicle with the same plate (%).', v_dups;
  end if;

  -- bookings first, while the vehicles are still identifiable as the source's
  update public.bookings b
     set operator_id   = p_target,
         operator_name = v_name
   where b.operator_id = p_source
     and exists (
       select 1 from public.vehicles v
       where v.operator_id = p_source
         and lower(btrim(coalesce(v.trade_name, ''))) = any (v_trades)
         and regexp_replace(upper(v.plate_no), '[^A-Z0-9]', '', 'g')
           = regexp_replace(upper(b.plate_no), '[^A-Z0-9]', '', 'g')
     );
  get diagnostics n_bookings = row_count;

  update public.vehicles
     set operator_id = p_target
   where operator_id = p_source
     and lower(btrim(coalesce(trade_name, ''))) = any (v_trades);
  get diagnostics n_vehicles = row_count;

  if n_vehicles = 0 then
    raise exception 'No vehicles under that trade name were found on this account.';
  end if;

  insert into public.notifications (recipient_role, recipient_id, type, title, body, link)
  values
    ('operator', p_source, 'operator_trade_split',
     'A trade was split from your account',
     n_vehicles || ' vehicle(s) and their trips were moved to ' || v_name || ' by PITX staff.',
     'operator-overview.html'),
    ('operator', p_target, 'operator_trade_split',
     'Vehicles were assigned to this account',
     n_vehicles || ' vehicle(s) and their trips were moved here from '
       || coalesce(v_src.operator_name, v_src.username) || ' by PITX staff.',
     'operator-overview.html');

  return jsonb_build_object(
    'source', coalesce(v_src.operator_name, v_src.username),
    'target', v_name,
    'vehicles', n_vehicles,
    'bookings', n_bookings
  );
end;
$$;

revoke all on function public.staff_split_operator_trade(uuid, uuid, text[]) from public, anon;
grant execute on function public.staff_split_operator_trade(uuid, uuid, text[]) to authenticated;

notify pgrst, 'reload schema';
