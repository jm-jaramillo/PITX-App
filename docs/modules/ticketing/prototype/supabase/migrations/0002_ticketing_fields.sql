-- Ticketing fields from the CTS and OBTS specs. Not applied yet. Keep with 0001_cts.sql
-- until the backend and hosting decision is made.

alter table companies
  add column description text,
  add column logo text,
  add column serial_no text,
  add column min_no text;

alter table counters
  add column allow_internet boolean not null default false,
  add column counter_display boolean not null default true,
  add column kiosk_display boolean not null default false,
  add column remark text;

alter table bus_types add column remark text;

alter table routes
  add column denomination text,
  add column authorized_agent text,
  add column seat_confirm boolean not null default true;

alter table trips add column remark text;

alter table tickets
  add column group_id uuid,
  add column contact_no text,
  add column email text,
  add column voided_by text,
  add column refund_amount numeric(10, 2) check (refund_amount >= 0),
  add column refund_method payment_method,
  add column refund_ref text;

create table counter_fares (
  route_id uuid not null references routes (id),
  counter_id uuid not null references counters (id),
  selling boolean not null default true,
  adult numeric(10, 2),
  student numeric(10, 2),
  senior numeric(10, 2),
  pwd numeric(10, 2),
  primary key (route_id, counter_id)
);
