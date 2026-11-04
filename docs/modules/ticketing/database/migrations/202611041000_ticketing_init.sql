-- Ticketing and Booking: tables for counter selling, passes, refunds, reprints,
-- Close Sales and Daily Sales Collection (docs/modules/ticketing/PLAN.md).
--
-- Runs on Ticketing's own Supabase project, NOT the PITX Trip Scheduling
-- project. Nothing here reads or changes Trip Scheduling's tables, and the
-- team's supabase/migrations/ runner never sees these files.
--
-- Tables live in the ticketing schema. The schema is not exposed through the
-- REST API: pages read it only through the public.ticketing_* functions
-- below, each of which checks ticketing.is_member().
--
-- Accounts: ticketing.members gives a user of this project one of the four
-- Ticketing roles. Add the first admin by hand in the SQL Editor after they
-- sign up:
--   insert into ticketing.members (user_id, full_name, role)
--   select id, 'Name', 'admin' from auth.users where email = '...';
--
-- companies, buses and trips mirror the prototype so the demo data has
-- something to sell against. Once Trip Scheduling exposes a trip feed
-- (issue #3), real trips are copied in from it and trips.booking_id holds the
-- Trip Scheduling booking id. It cannot be a foreign key: it is another database.
--
-- Every demo row has is_demo = true and is removed by ticketing_clear_demo().

create schema if not exists ticketing;

/* ---------------------------------------------------------- System Parameters */

create table if not exists ticketing.settings (
  id                         int primary key default 1 check (id = 1),
  default_counter            text,
  counter_cutoff_min         int  not null default 0    check (counter_cutoff_min between 0 and 1440),
  kiosk_cutoff_min           int  not null default 15   check (kiosk_cutoff_min between 0 and 1440),
  checkin_before_min         int  not null default 1440 check (checkin_before_min between 0 and 10080),
  checkin_after_min          int  not null default 60   check (checkin_after_min between 0 and 1440),
  insurance_price            numeric(10, 2) not null default 0 check (insurance_price >= 0),
  seat_transfer_same_route   boolean not null default true,
  refund_cutoff_hours        int  not null default 4    check (refund_cutoff_hours between 0 and 168),
  refund_percent             int  not null default 100  check (refund_percent between 0 and 100),
  refund_approval            text not null default 'None'     check (refund_approval  in ('None', 'Admin', 'Password')),
  refund_reasons             text[] not null default array['Passenger changed plans', 'Trip cancelled', 'Wrong ticket issued', 'Other'],
  reprint_allowed            boolean not null default true,
  reprint_charge             numeric(10, 2) not null default 5 check (reprint_charge >= 0),
  reprint_approval           text not null default 'Password' check (reprint_approval in ('None', 'Admin', 'Password')),
  reprint_reasons            text[] not null default array['Lost ticket', 'Damaged ticket', 'Wrong passenger details', 'Printer error', 'Other'],
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid references auth.users(id) on delete set null
);
insert into ticketing.settings (id, default_counter) values (1, 'C01') on conflict do nothing;

/* ---------------------------------------------------------------- Masterfiles */

create table if not exists ticketing.provinces (
  code         text primary key,
  description  text not null,
  active       boolean not null default true,
  is_demo      boolean not null default false
);

create table if not exists ticketing.towns (
  code           text primary key,
  description    text not null,
  province_code  text not null references ticketing.provinces(code),
  active         boolean not null default true,
  is_demo        boolean not null default false
);

-- A bus company Ticketing sells for. operator_id is the operator's id in
-- Trip Scheduling, filled in once the trip feed exists.
create table if not exists ticketing.companies (
  code             text primary key,
  name             text not null,
  operator_id      uuid,
  description      text,
  logo             text,
  registration_no  text,
  ptu_no           text,
  tin              text,
  serial_no        text,
  min_no           text,
  ticket_code      text not null unique,
  advance_days     int  not null default 7 check (advance_days between 0 and 365),
  address          text,
  contact_person   text,
  mobile_no        text,
  active           boolean not null default true,
  is_demo          boolean not null default false
);

create table if not exists ticketing.counters (
  code             text primary key,
  description      text not null,
  ticket_code      text not null,
  kiosk            boolean not null default false,
  town_code        text references ticketing.towns(code),
  allow_internet   boolean not null default false,
  counter_display  boolean not null default true,
  kiosk_display    boolean not null default false,
  remark           text,
  active           boolean not null default true,
  is_demo          boolean not null default false
);

-- layout_id is one of the 8 seat layouts in the Seat Configuration sheet.
create table if not exists ticketing.bus_types (
  company_code   text not null references ticketing.companies(code),
  code           text not null,
  description    text not null,
  layout_id      text not null,
  blocked_seats  int[] not null default '{}',
  remark         text,
  active         boolean not null default true,
  is_demo        boolean not null default false,
  primary key (company_code, code)
);

create table if not exists ticketing.buses (
  plate_no       text primary key,
  company_code   text not null references ticketing.companies(code),
  bus_type_code  text not null,
  description    text,
  aircon         boolean not null default true,
  charter        text not null default 'Not Chartered'
                   check (charter in ('Not Chartered', 'Monthly Chartered', 'Special Chartered')),
  active         boolean not null default true,
  is_demo        boolean not null default false,
  foreign key (company_code, bus_type_code) references ticketing.bus_types(company_code, code)
);

-- Blank student/senior/pwd fares fall back to 20% off the adult fare.
create table if not exists ticketing.routes (
  code              text primary key,
  company_code      text not null references ticketing.companies(code),
  description       text not null,
  denomination      text,
  province_code     text references ticketing.provinces(code),
  town_code         text references ticketing.towns(code),
  mileage           numeric not null default 0,
  adult             numeric(10, 2) not null check (adult >= 0),
  student           numeric(10, 2) check (student >= 0),
  senior            numeric(10, 2) check (senior >= 0),
  pwd               numeric(10, 2) check (pwd >= 0),
  message           text,
  authorized_agent  text,
  seat_confirm      boolean not null default true,
  active            boolean not null default true,
  is_demo           boolean not null default false
);

-- Per-counter selling switch and fare overrides. Blank fares use the route's.
create table if not exists ticketing.counter_fares (
  route_code    text not null references ticketing.routes(code) on delete cascade,
  counter_code  text not null references ticketing.counters(code) on delete cascade,
  selling       boolean not null default true,
  adult         numeric(10, 2),
  student       numeric(10, 2),
  senior        numeric(10, 2),
  pwd           numeric(10, 2),
  primary key (route_code, counter_code)
);

/* --------------------------------------------------------------------- Trips */

create table if not exists ticketing.trips (
  id             uuid primary key default gen_random_uuid(),
  trip_no        text not null unique,
  booking_id     uuid,
  trip_date      date not null,
  trip_time      time not null,
  route_code     text not null references ticketing.routes(code),
  plate_no       text references ticketing.buses(plate_no),
  bay            text,
  status         text not null default 'Scheduled'
                   check (status in ('Scheduled', 'Boarding', 'Departed', 'Cancelled')),
  stop_selling   boolean not null default false,
  remark         text,
  cancel_remark  text,
  is_demo        boolean not null default false
);
create index if not exists trips_date_idx on ticketing.trips (trip_date, trip_time);

create table if not exists ticketing.seat_marks (
  id        uuid primary key default gen_random_uuid(),
  trip_id   uuid not null references ticketing.trips(id) on delete cascade,
  seat_no   int  not null check (seat_no > 0),
  kind      text not null check (kind in ('Permanent Block', 'Temporary Block', 'Temporary Release')),
  until     timestamptz,
  is_demo   boolean not null default false
);
create index if not exists seat_marks_trip_idx on ticketing.seat_marks (trip_id);

/* ------------------------------------------------------------------- Tickets */

-- Contact number, email and discount ID stay off passes, manifests and
-- exports (Data Privacy Act).
create table if not exists ticketing.tickets (
  id               uuid primary key default gen_random_uuid(),
  ticket_no        text not null unique,
  group_id         uuid,
  source           text not null default 'Counter' check (source in ('Counter', 'Online')),
  booking_ref      text,
  trip_id          uuid not null references ticketing.trips(id),
  counter_code     text references ticketing.counters(code),
  sold_by          text,
  sold_by_id       uuid references auth.users(id) on delete set null,
  seat_no          int  not null check (seat_no > 0),
  passenger_name   text not null,
  contact_no       text,
  email            text,
  fare_type        text not null default 'Adult' check (fare_type in ('Adult', 'Student', 'Senior', 'PWD')),
  fare             numeric(10, 2) not null check (fare >= 0),
  insurance        numeric(10, 2) not null default 0 check (insurance >= 0),
  id_no            text,
  payment_method   text not null check (payment_method in ('Cash', 'Card', 'E-Wallet')),
  tendered         numeric(10, 2),
  payment_ref      text,
  issued_at        timestamptz not null default now(),
  status           text not null default 'Issued' check (status in ('Booked', 'Issued', 'Boarded', 'Voided')),
  printed          boolean not null default false,
  void_reason      text,
  voided_by        text,
  refund_category  text,
  refund_amount    numeric(10, 2) check (refund_amount >= 0),
  refund_method    text check (refund_method in ('Cash', 'Card', 'E-Wallet')),
  refund_ref       text,
  is_demo          boolean not null default false
);
-- The database is what stops two counters selling the same seat at the same time.
create unique index if not exists tickets_one_per_seat
  on ticketing.tickets (trip_id, seat_no) where status <> 'Voided';
create index if not exists tickets_group_idx on ticketing.tickets (group_id);
create index if not exists tickets_issued_idx on ticketing.tickets (issued_at);

create table if not exists ticketing.reprints (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references ticketing.tickets(id) on delete cascade,
  at            timestamptz not null default now(),
  by_name       text not null,
  counter_code  text references ticketing.counters(code),
  category      text not null,
  remark        text,
  charge        numeric(10, 2) not null default 0 check (charge >= 0),
  is_demo       boolean not null default false
);
create index if not exists reprints_ticket_idx on ticketing.reprints (ticket_id);

-- Refund and reprint approvals.
create table if not exists ticketing.requests (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('Refund', 'Reprint')),
  ticket_id       uuid not null references ticketing.tickets(id) on delete cascade,
  category        text not null,
  remark          text,
  requested_by    text not null,
  counter_code    text references ticketing.counters(code),
  requested_at    timestamptz not null default now(),
  status          text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  decided_by      text,
  decided_at      timestamptz,
  refund_method   text check (refund_method in ('Cash', 'Card', 'E-Wallet')),
  refund_ref      text,
  is_demo         boolean not null default false
);
create index if not exists requests_ticket_idx on ticketing.requests (ticket_id);

/* ------------------------------------------------- Close Sales and Collection */

-- One-use code the Ticketing Admin gives a Teller to close a shift.
create table if not exists ticketing.close_codes (
  code       text primary key,
  issued_at  timestamptz not null default now(),
  issued_by  text not null,
  used       boolean not null default false,
  is_demo    boolean not null default false
);

-- Teller's blind count, then Account's blind count. Totals are shown only
-- once both counts are in.
create table if not exists ticketing.closings (
  id              uuid primary key default gen_random_uuid(),
  sales_date      date not null,
  teller          text not null,
  counter_code    text not null references ticketing.counters(code),
  closed_at       timestamptz not null default now(),
  teller_count    numeric(12, 2) not null check (teller_count >= 0),
  account_count   numeric(12, 2) check (account_count >= 0),
  account_by      text,
  system_cash     numeric(12, 2),
  reconciled_at   timestamptz,
  is_demo         boolean not null default false
);
create index if not exists closings_date_idx on ticketing.closings (sales_date);

create table if not exists ticketing.audit_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  by_name    text not null,
  by_id      uuid references auth.users(id) on delete set null,
  action     text not null,
  ticket_id  uuid references ticketing.tickets(id) on delete cascade,
  trip_id    uuid references ticketing.trips(id) on delete cascade,
  detail     text,
  is_demo    boolean not null default false
);
create index if not exists audit_log_at_idx on ticketing.audit_log (at desc);

/* ------------------------------------------------------------------ Members */

-- teller: sells for one company at one counter. pub_admin: one company's
-- trips, units, manifests. account: Daily Sales Collection. admin: approvals,
-- close codes, fares, settings, reports.
create table if not exists ticketing.members (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  role          text not null check (role in ('teller', 'pub_admin', 'account', 'admin')),
  company_code  text references ticketing.companies(code),
  counter_code  text references ticketing.counters(code),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  check (role not in ('teller', 'pub_admin') or company_code is not null)
);

create or replace function ticketing.my_role()
returns text
language sql
stable
security definer
set search_path = ticketing
as $$
  select role from ticketing.members where user_id = auth.uid() and active;
$$;

create or replace function ticketing.is_member()
returns boolean
language sql
stable
security definer
set search_path = ticketing
as $$
  select ticketing.my_role() is not null;
$$;

/* ------------------------------------------------------------------- Access */

do $$
declare t text;
begin
  foreach t in array array['settings', 'provinces', 'towns', 'companies', 'counters', 'bus_types',
                           'buses', 'routes', 'counter_fares', 'trips', 'seat_marks', 'tickets',
                           'reprints', 'requests', 'close_codes', 'closings', 'audit_log', 'members'] loop
    execute format('alter table ticketing.%I enable row level security', t);
    execute format('drop policy if exists "members can read" on ticketing.%I', t);
    execute format('create policy "members can read" on ticketing.%I for select to authenticated '
                   'using ((select ticketing.is_member()))', t);
  end loop;
end $$;

revoke all on schema ticketing from public, anon;
grant usage on schema ticketing to authenticated;
grant select on all tables in schema ticketing to authenticated;
revoke all on function ticketing.my_role() from public, anon;
revoke all on function ticketing.is_member() from public, anon;
grant execute on function ticketing.my_role() to authenticated;
grant execute on function ticketing.is_member() to authenticated;

/* ---------------------------------------------------------------- Functions */

-- Everything the Ticketing pages show, in one call: masterfiles, settings,
-- and the trips, tickets and approvals from p_from to p_to (Manila dates).
create or replace function public.ticketing_snapshot(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, ticketing
as $$
declare
  d0 date := coalesce(p_from, (now() at time zone 'Asia/Manila')::date);
  d1 date := coalesce(p_to, d0 + 7);
begin
  if not ticketing.is_member() then
    raise exception 'This account is not a Ticketing member' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'now',        now(),
    'from',       d0,
    'to',         d1,
    'me',         (select to_jsonb(m) from ticketing.members m where m.user_id = auth.uid()),
    'settings',   (select to_jsonb(s) from ticketing.settings s where id = 1),
    'provinces',  (select coalesce(jsonb_agg(to_jsonb(x) order by x.code), '[]') from ticketing.provinces x),
    'towns',      (select coalesce(jsonb_agg(to_jsonb(x) order by x.code), '[]') from ticketing.towns x),
    'companies',  (select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]') from ticketing.companies x),
    'counters',   (select coalesce(jsonb_agg(to_jsonb(x) order by x.code), '[]') from ticketing.counters x),
    'bus_types',  (select coalesce(jsonb_agg(to_jsonb(x) order by x.company_code, x.code), '[]') from ticketing.bus_types x),
    'buses',      (select coalesce(jsonb_agg(to_jsonb(x) order by x.plate_no), '[]') from ticketing.buses x),
    'routes',     (select coalesce(jsonb_agg(to_jsonb(x) order by x.code), '[]') from ticketing.routes x),
    'counter_fares', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from ticketing.counter_fares x),
    'trips',      (select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object(
                     'seat_marks', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from ticketing.seat_marks m where m.trip_id = t.id))
                     order by t.trip_date, t.trip_time), '[]')
                     from ticketing.trips t where t.trip_date between d0 and d1),
    'tickets',    (select coalesce(jsonb_agg(to_jsonb(k) order by k.issued_at), '[]')
                     from ticketing.tickets k join ticketing.trips t on t.id = k.trip_id
                    where t.trip_date between d0 and d1),
    'requests',   (select coalesce(jsonb_agg(to_jsonb(r) order by r.requested_at desc), '[]')
                     from ticketing.requests r where r.status = 'Pending' or r.requested_at >= d0::timestamp at time zone 'Asia/Manila'),
    'closings',   (select coalesce(jsonb_agg(to_jsonb(c) order by c.closed_at desc), '[]')
                     from ticketing.closings c where c.sales_date between d0 and d1)
  );
end $$;

-- Removes every demo row. Real data (is_demo = false) is never touched.
create or replace function public.ticketing_clear_demo()
returns int
language plpgsql
security definer
set search_path = public, ticketing
as $$
declare n int;
begin
  if ticketing.my_role() is distinct from 'admin' then
    raise exception 'Only the Ticketing Admin can clear demo data' using errcode = '42501';
  end if;
  delete from ticketing.audit_log  where is_demo;
  delete from ticketing.requests   where is_demo;
  delete from ticketing.reprints   where is_demo;
  delete from ticketing.tickets    where is_demo;
  get diagnostics n = row_count;
  delete from ticketing.closings   where is_demo;
  delete from ticketing.close_codes where is_demo;
  delete from ticketing.seat_marks where is_demo;
  delete from ticketing.trips      where is_demo;
  delete from ticketing.counter_fares f using ticketing.routes r where r.code = f.route_code and r.is_demo;
  delete from ticketing.routes     where is_demo;
  delete from ticketing.buses      where is_demo;
  delete from ticketing.bus_types  where is_demo;
  delete from ticketing.counters   where is_demo;
  delete from ticketing.companies  where is_demo;
  delete from ticketing.towns      where is_demo;
  delete from ticketing.provinces  where is_demo;
  return n;
end $$;

revoke all on function public.ticketing_snapshot(date, date) from public, anon;
revoke all on function public.ticketing_clear_demo() from public, anon;
grant execute on function public.ticketing_snapshot(date, date) to authenticated;
grant execute on function public.ticketing_clear_demo() to authenticated;
