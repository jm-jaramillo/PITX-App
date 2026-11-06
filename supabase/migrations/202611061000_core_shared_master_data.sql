-- DRAFT - NOT APPLIED. Review with all three module owners before running.
--
-- Shared master-data layer ("core") for the single PITX Supabase project.
-- Purpose: operators, vehicles, destinations and gates exist once; the
-- Trip Scheduling (public), TOS (tos) and Ticketing (ticketing) modules link
-- to them instead of keeping unlinked copies.
--
-- Design rules
--   * Additive only: no column or table in public/tos/ticketing is dropped or
--     retyped, so every existing RPC and page keeps working.
--   * core is NOT exposed to the Data API. Modules read it through their own
--     RPCs (SECURITY DEFINER wrappers), as CONTRIBUTING.md requires.
--   * Views use security_invoker so the base tables' RLS still applies.
--   * New foreign keys are NOT VALID: they protect new writes now, and are
--     validated in the final step once the backfill reports show no orphans.
--
-- Owner sign-off: @jm-jaramillo (public) @Jcbllanto16 (tos) @victoriaronald (ticketing)

begin;

create schema if not exists core;
revoke all on schema core from anon, authenticated;
grant usage on schema core to service_role;

-- 1. Plate normalisation: one definition for everyone ------------------------
create or replace function core.plate_norm(p text)
returns text language sql immutable parallel safe as
$$ select nullif(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), '') $$;

-- 2. Operators = login accounts with role 'operator' + their profile ---------
create or replace view core.operators with (security_invoker = true) as
select p.id            as operator_id,
       p.username,
       p.operator_name as name,
       op.trade_name,
       op.operator_code,
       op.company_name
  from public.profiles p
  left join public.operator_profiles op on op.operator_id = p.id
 where p.role = 'operator';

-- 3. Vehicles keyed by normalised plate --------------------------------------
create or replace view core.vehicles with (security_invoker = true) as
select v.id            as vehicle_id,
       core.plate_norm(v.plate_no) as plate_key,
       v.plate_no,
       v.operator_id,
       v.status,
       v.ltfrb_status,
       v.bus_type,
       v.body_number,
       v.seating_capacity,
       v.cpc_validity,
       v.orcr_validity,
       v.sticker_no
  from public.vehicles v;

-- 4. Destinations: one row per route/destination name ------------------------
create table if not exists core.destinations (
  id         bigint generated always as identity primary key,
  name       text not null,
  name_key   text generated always as (upper(btrim(name))) stored unique,
  gate       text,                       -- terminal gate, from route_gates
  created_at timestamptz not null default now()
);
alter table core.destinations enable row level security;  -- no policies: service_role / definer only

insert into core.destinations (name, gate)
select rg.route, rg.gate from public.route_gates rg
on conflict (name_key) do nothing;

-- Destination names already used by bookings/vehicles but missing from route_gates
insert into core.destinations (name)
select distinct btrim(x.route) from (
  select route from public.bookings where route is not null
  union select route from public.vehicles  where route is not null
  union select route from tos.route_service where route is not null
) x
where btrim(x.route) <> ''
on conflict (name_key) do nothing;

-- 5. Gates: TOS owns the table, core exposes it to the other modules ---------
create or replace view core.gates with (security_invoker = true) as
select id as gate_id, name, description, direction, sort_order from tos.gates;

-- 6. Links from each module to core ------------------------------------------
-- 6a. TOS: route_service.route -> core.destinations
alter table tos.route_service add column if not exists destination_id bigint;
update tos.route_service rs set destination_id = d.id
  from core.destinations d where d.name_key = upper(btrim(rs.route)) and rs.destination_id is null;
alter table tos.route_service
  add constraint route_service_destination_fk
  foreign key (destination_id) references core.destinations(id) not valid;

-- 6b. Ticketing: company -> operator account, bus -> vehicle
alter table ticketing.companies
  add constraint companies_operator_fk
  foreign key (operator_id) references public.profiles(id) not valid;

alter table ticketing.buses add column if not exists vehicle_id uuid;
-- Match only when exactly one registered vehicle has that plate
update ticketing.buses b set vehicle_id = m.id
  from (select core.plate_norm(plate_no) k, (array_agg(id))[1] id
          from public.vehicles group by 1 having count(*) = 1) m
 where m.k = core.plate_norm(b.plate_no) and b.vehicle_id is null;
alter table ticketing.buses
  add constraint buses_vehicle_fk
  foreign key (vehicle_id) references public.vehicles(id) not valid;

-- 6c. Ticketing routes -> destinations
alter table ticketing.routes add column if not exists destination_id bigint;
update ticketing.routes r set destination_id = d.id
  from core.destinations d where d.name_key = upper(btrim(r.description)) and r.destination_id is null;
alter table ticketing.routes
  add constraint routes_destination_fk
  foreign key (destination_id) references core.destinations(id) not valid;

-- 7. Backfill report - READ THIS before running step 8 ------------------------
create or replace view core.link_report with (security_invoker = true) as
select 'ticketing.companies without operator'   as check_name, count(*) as rows_unlinked
  from ticketing.companies where operator_id is null
union all select 'ticketing.buses without vehicle',        count(*) from ticketing.buses  where vehicle_id is null
union all select 'ticketing.routes without destination',   count(*) from ticketing.routes where destination_id is null
union all select 'tos.route_service without destination',  count(*) from tos.route_service where destination_id is null
union all select 'bookings with route not in destinations',count(*)
  from public.bookings b where b.route is not null
   and not exists (select 1 from core.destinations d where d.name_key = upper(btrim(b.route)));

commit;

-- 8. RUN SEPARATELY after the report is clean (or the leftovers are accepted):
-- alter table tos.route_service    validate constraint route_service_destination_fk;
-- alter table ticketing.companies  validate constraint companies_operator_fk;
-- alter table ticketing.buses      validate constraint buses_vehicle_fk;
-- alter table ticketing.routes     validate constraint routes_destination_fk;
--
-- ROLLBACK (nothing else depends on these yet):
-- alter table ticketing.routes drop column destination_id;
-- alter table ticketing.buses  drop column vehicle_id;
-- alter table ticketing.companies drop constraint companies_operator_fk;
-- alter table tos.route_service drop column destination_id;
-- drop schema core cascade;
