-- CTS schema for when the prototype moves off localStorage. Not applied yet.
-- Production must run on PH-hosted infrastructure (TOR data residency rule).
-- Row-level security policies still need to be written per role before real use.

create type record_status as enum ('Active', 'Inactive');
create type trip_status as enum ('Scheduled', 'Boarding', 'Departed', 'Cancelled');
create type fare_type as enum ('Adult', 'Student', 'Senior', 'PWD');
create type payment_method as enum ('Cash', 'Card', 'E-Wallet');
create type ticket_status as enum ('Reserved', 'Boarded', 'Voided');
create type ticket_source as enum ('Counter', 'Online');

create table provinces (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  status record_status not null default 'Active'
);

create table towns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  province_id uuid not null references provinces (id),
  status record_status not null default 'Active'
);

create table companies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  registration_no text,
  ptu_no text,
  tin text,
  ticket_code text not null unique,
  advance_days int not null default 0,
  address text,
  contact_person text,
  mobile_no text,
  status record_status not null default 'Active'
);

create table counters (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  ticket_code text not null,
  kiosk boolean not null default false,
  town_id uuid not null references towns (id),
  status record_status not null default 'Active'
);

create table bus_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id),
  code text not null,
  description text not null,
  layout_id text not null,
  blocked_seats int[] not null default '{}',
  status record_status not null default 'Active',
  unique (company_id, code)
);

create table buses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id),
  plate_no text not null unique,
  description text,
  bus_type_id uuid not null references bus_types (id),
  aircon boolean not null default true,
  charter text not null default 'Not Chartered'
    check (charter in ('Not Chartered', 'Monthly Chartered', 'Special Chartered')),
  status record_status not null default 'Active'
);

create table routes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id),
  operator_route_id text not null,
  code text not null,
  description text not null,
  province_id uuid not null references provinces (id),
  mileage numeric not null default 0,
  price numeric(10, 2) not null check (price >= 0),
  student_fare numeric(10, 2),
  senior_fare numeric(10, 2),
  pwd_fare numeric(10, 2),
  message text,
  status record_status not null default 'Active',
  unique (company_id, operator_route_id)
);

create table trips (
  id uuid primary key default gen_random_uuid(),
  trip_no text not null unique,
  trip_date date not null,
  trip_time time not null,
  route_id uuid not null references routes (id),
  bus_id uuid not null references buses (id),
  bay text,
  status trip_status not null default 'Scheduled',
  stop_selling boolean not null default false
);

create unique index trips_no_bus_clash on trips (bus_id, trip_date, trip_time)
  where status <> 'Cancelled';

create table tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique,
  trip_id uuid not null references trips (id),
  source ticket_source not null default 'Counter',
  booking_ref text,
  counter_id uuid references counters (id),
  sold_by text,
  seat_no int not null check (seat_no > 0),
  passenger_name text not null,
  fare_type fare_type not null default 'Adult',
  fare numeric(10, 2) not null check (fare >= 0),
  id_no text,
  payment_method payment_method not null,
  tendered numeric(10, 2),
  payment_ref text,
  issued_at timestamptz not null default now(),
  status ticket_status not null default 'Reserved',
  void_reason text
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  by_user text not null,
  action text not null,
  ticket_id uuid references tickets (id),
  trip_id uuid references trips (id),
  detail text
);

-- The database is what stops two counters selling the same seat at the same time.
create unique index tickets_one_per_seat on tickets (trip_id, seat_no)
  where status <> 'Voided';
