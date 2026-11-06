// Runs the Ticketing and core migrations on PGlite (Postgres in WASM) with
// small stand-ins for Supabase and for the Trip Scheduling / TOS tables core
// reads, then checks the core links, demo mode and passenger booking rules.
// Usage: node test.mjs <repo folder>
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "fs";
import path from "path";

const repo = process.argv[2];
const migrations = path.join(repo, "supabase", "migrations");
const dbdir = path.join(repo, "docs", "modules", "ticketing", "database");
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
async function apply(file) {
  try { await db.exec(readFileSync(file, "utf8")); ok(`apply ${path.basename(file)}`, true); }
  catch (e) { ok(`apply ${path.basename(file)}`, false, e.message); process.exit(1); }
}

// Supabase stand-ins: roles, auth.users, auth.uid() from the request JWT.
// Trip Scheduling / TOS stand-ins: only the columns core and 0051 use.
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;

  create table public.profiles (id uuid primary key references auth.users(id), username text, operator_name text, role text not null);
  create table public.operator_profiles (operator_id uuid primary key references public.profiles(id), trade_name text, operator_code text, company_name text);
  create table public.vehicles (id uuid primary key default gen_random_uuid(), plate_no text, operator_id uuid references public.profiles(id),
    status text default 'approved', ltfrb_status text, bus_type text, body_number text, seating_capacity int,
    cpc_validity date, orcr_validity date, sticker_no text, route text, trade_name text);
  create table public.bookings (id uuid primary key default gen_random_uuid(), route text, plate_no text, operator_id uuid,
    operator_name text, trade_name text, trip_number text, status text, booking_date date, slot smallint,
    assigned_bay_id bigint);
  create table public.bays (id bigint primary key, name text, gate text);
  create function public.is_staff() returns boolean language sql stable security definer as
    $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'staff') $$;
  create table public.route_gates (route text primary key, gate text);
  create table public.seat_layouts (capacity int primary key, config text);
  create table public.notifications (id bigint generated always as identity, recipient_role text, type text, title text,
    body text, link text, related_table text, related_id uuid);
  create table public.seat_reservations (id uuid primary key default gen_random_uuid(), request_ref text not null,
    booking_id uuid not null references public.bookings(id), seat_no int not null, passenger_name text not null,
    contact_no text not null, status text not null default 'requested');
  create unique index seat_reservations_live_seat on public.seat_reservations (booking_id, seat_no) where status in ('requested', 'blocked');
  create function public.is_ticketing() returns boolean language sql stable security definer as
    $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'ticketing') $$;
  create function public.slot_start_at(d date, s smallint) returns timestamptz language sql immutable as
    $$ select (d + make_interval(mins => s * 15)) at time zone 'Asia/Manila' $$;
  create function public.get_trip_seats(p_booking_id uuid) returns table (seat_no integer, state text)
    language sql stable security definer set search_path = public as
    $$ select r.seat_no, case r.status when 'requested' then 'held' else 'blocked' end
         from public.seat_reservations r where r.booking_id = p_booking_id and r.status in ('requested', 'blocked') $$;
  create schema tos;
  create table tos.route_service (id bigint generated always as identity primary key, route text);
  create table tos.gates (id bigint generated always as identity primary key, name text, description text, direction text, sort_order int);
`);

const tickets = (f) => path.join(migrations, f);
await apply(tickets("202611041000_ticketing_init.sql"));
await apply(tickets("202611041002_ticketing_passengers.sql"));

// Real data before core runs, so core's automatic plate/name match has work to do.
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const uid = async (email) => (await one(`insert into auth.users (email) values ($1) returning id`, [email])).id;
const op1 = await uid("op1@example.com"), op2 = await uid("op2@example.com"), tadmin = await uid("ta@example.com");
await db.query(`insert into public.profiles values ($1, 'rlt', 'Real Lines Transit', 'operator'), ($2, 'oth', 'Other Bus Co', 'operator'),
                ($3, 'ta', null, 'ticketing')`, [op1, op2, tadmin]);
await db.query(`insert into public.operator_profiles values ($1, 'RLT', 'OP-001', 'Real Lines Transit Inc.')`, [op1]);
const veh = async (plate, op, cap) => (await one(`insert into public.vehicles (plate_no, operator_id, seating_capacity) values ($1, $2, $3) returning id`, [plate, op, cap])).id;
const vABC = await veh("ABC 1234", op1, 49), vXYZ = await veh("XYZ 999", op1, 45), vOTH = await veh("OTH 1", op2, 49);
await veh("DUP 1", op1, 49); await veh("DUP-1", op2, 49);
await db.exec(`
  insert into public.route_gates values ('Batangas', 'G1');
  insert into public.seat_layouts values (49, '2-2'), (45, '2-2');
  insert into ticketing.companies (code, name, ticket_code) values ('RLT', 'Real Lines Transit', 'RL');
  insert into ticketing.bus_types (company_code, code, description, layout_id) values ('RLT', 'B49', '49 seater', '49');
  insert into ticketing.buses (plate_no, company_code, bus_type_code) values
    ('ABC-1234', 'RLT', 'B49'), ('XYZ999', 'RLT', 'B49'), ('DUP1', 'RLT', 'B49'), ('NOPE 1', 'RLT', 'B49');
  insert into ticketing.routes (code, company_code, description, adult) values
    ('RLT-BAT', 'RLT', 'batangas ', 300), ('RLT-NAG', 'RLT', 'Naga', 900);
`);

await apply(tickets("202611061000_core_shared_master_data.sql"));
await apply(tickets("202611061100_ticketing_core_links.sql"));
await apply(path.join(dbdir, "demo_data.sql"));
await apply(path.join(dbdir, "for-trip-scheduling.sql"));

// Run as a client: role + signed-in user (null = not signed in).
async function as(role, uid, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${role};`);
  try { return { rows: (await db.query(sql, params)).rows }; }
  catch (e) { return { error: e.message }; }
  finally { await db.exec("reset role"); }
}
const val = (r) => r.rows && Object.values(r.rows[0])[0];

// Demo data
const counts = await one(`select (select count(*) from ticketing.tickets)::int t, (select count(*) from ticketing.trips)::int tr`);
ok("demo data: 231 tickets on 16 trips", counts.t === 231 && counts.tr === 16, JSON.stringify(counts));

// Users
const admin = await uid("admin@example.com"), p1 = await uid("p1@example.com"), p2 = await uid("p2@example.com");
await db.query(`insert into ticketing.members (user_id, full_name, role) values ($1, 'Admin', 'admin')`, [admin]);

// Public trip list and seats
let r = await as("anon", null, `select public.ticketing_online_trips() j`);
const trips = val(r) ?? [];
ok("anon can list today's bookable trips", !r.error && trips.length > 0, r.error ?? `${trips.length} trips`);
ok("only Scheduled trips with a bus are listed",
   trips.every((t) => t.trip_no !== "DEMO-T0003" && t.trip_no !== "DEMO-T0001" && t.trip_no !== "DEMO-T0006"));
ok("stop-selling trip not listed", !trips.some((t) => t.trip_no === "DEMO-T0007"));
const trip = trips.find((t) => t.trip_no === "DEMO-T0002") ?? trips[0];
ok("seats_left = capacity - sold", trip && trip.seats_left === trip.capacity - 18 + 1, trip && `${trip.trip_no} ${trip.capacity} cap, ${trip.seats_left} left`);

r = await as("anon", null, `select public.ticketing_trip_seats($1) j`, [trip.trip_id]);
ok("anon can see taken seats", !r.error && val(r).unavailable.length > 0, r.error ?? `${val(r).unavailable.length} taken`);
ok("seat data has no passenger names", !r.error && !JSON.stringify(val(r)).includes("Sample"));
r = await as("anon", null, `select count(*) from ticketing.tickets`);
ok("anon cannot read tickets table", !!r.error, r.error);
r = await as("authenticated", p1, `select count(*)::int n from ticketing.tickets`);
ok("passenger cannot read tickets table", !!r.error || r.rows[0].n === 0, r.error ?? `${r.rows?.[0]?.n} rows`);
r = await as("anon", null, `select public.ticketing_book($1, '[{"seat_no":30,"passenger_name":"X Y"}]')`, [trip.trip_id]);
ok("anon cannot book", !!r.error, r.error);

// Booking
const taken = async () => val(await as("anon", null, `select public.ticketing_trip_seats($1) j`, [trip.trip_id])).unavailable;
const taken0 = await taken();
const [s1, s2, s3] = Array.from({ length: trip.capacity }, (_, i) => i + 1).filter((s) => !taken0.includes(s));
const book = (u, seats, id = trip.trip_id) => as("authenticated", u, `select public.ticketing_book($1, $2::jsonb) j`, [id, JSON.stringify(seats)]);

r = await book(p1, [{ seat_no: s1, passenger_name: "Pia One" }]);
ok("unregistered passenger is asked for details", /passenger details/.test(r.error ?? ""), r.error);

r = await as("authenticated", p1, `select public.ticketing_register_passenger('Pia One', '0917 000 0001') j`);
ok("passenger can register", !r.error, r.error);
r = await as("authenticated", p2, `select public.ticketing_register_passenger('Paolo Two', '0917 000 0002') j`);

r = await book(p1, [{ seat_no: s1, passenger_name: "Pia One" }, { seat_no: s2, passenger_name: "Kid One", fare_type: "Student" }]);
ok("discount fare without ID is refused", /needs an ID/.test(r.error ?? ""), r.error);

r = await book(p1, [{ seat_no: s1, passenger_name: "Pia One" }, { seat_no: s2, passenger_name: "Kid One", fare_type: "Student", id_no: "S-123" }]);
const b1 = val(r);
ok("passenger books 2 seats", !r.error && b1.tickets.length === 2, r.error ?? `${b1.booking_ref}, total ${b1.total}`);
ok("student fare is 20% off", b1 && b1.tickets[1].fare === Math.round(trip.adult * 0.8 * 100) / 100, b1 && JSON.stringify(b1.tickets.map((t) => t.fare)));
const st = await one(`select status, hold_until > now() h, payment_method from ticketing.tickets where group_id = $1 limit 1`, [b1?.group_id]);
ok("booked tickets are Reserved holds, unpaid", st?.status === "Reserved" && st.h && st.payment_method === null, JSON.stringify(st));
ok("booked seats show as taken", (await taken()).includes(s1));

r = await book(p2, [{ seat_no: s1, passenger_name: "Paolo Two" }]);
ok("second passenger can't take a held seat", /already taken/.test(r.error ?? ""), r.error);
r = await book(p2, [{ seat_no: s3, passenger_name: "A" }, { seat_no: s3, passenger_name: "B" }]);
ok("same seat twice refused", /picked twice/.test(r.error ?? ""), r.error);
r = await book(p2, [{ seat_no: trip.capacity + 1, passenger_name: "Paolo Two" }]);
ok("seat beyond the bus refused", /not on this bus/.test(r.error ?? ""), r.error);
r = await book(p2, Array.from({ length: 6 }, (_, i) => ({ seat_no: 40 + i, passenger_name: "Paolo Two" })));
ok("more than 5 seats refused", /up to 5/.test(r.error ?? ""), r.error);
const departed = (await one(`select id from ticketing.trips where trip_no = 'DEMO-T0001'`)).id;
r = await book(p2, [{ seat_no: 50, passenger_name: "Paolo Two" }], departed);
ok("departed trip refused", /not open/.test(r.error ?? ""), r.error);

// Own bookings only
r = await as("authenticated", p1, `select public.ticketing_my_bookings() j`);
ok("passenger sees own 2 bookings", !r.error && val(r).bookings.length === 2, r.error);
ok("own bookings leave out ID numbers", !r.error && !JSON.stringify(val(r)).includes("S-123"));
r = await as("authenticated", p2, `select public.ticketing_my_bookings() j`);
ok("other passenger sees none of them", !r.error && val(r).bookings.length === 0, r.error);
r = await as("authenticated", p2, `select public.ticketing_cancel_booking($1) j`, [b1.group_id]);
ok("other passenger can't cancel them", /Nothing to cancel/.test(r.error ?? ""), r.error);

// Expired hold frees the seat
await db.query(`update ticketing.tickets set hold_until = now() - interval '1 minute' where group_id = $1`, [b1.group_id]);
r = await book(p2, [{ seat_no: s1, passenger_name: "Paolo Two" }]);
const b2 = val(r);
ok("expired hold frees the seat for the next passenger", !r.error, r.error);
const ex = await one(`select string_agg(distinct status || '/' || coalesce(void_reason, ''), ',') s from ticketing.tickets where group_id = $1`, [b1.group_id]);
ok("expired holds are voided", ex.s === "Voided/Hold expired", ex.s);

r = await as("authenticated", p2, `select public.ticketing_cancel_booking($1) j`, [b2?.group_id]);
ok("passenger cancels own hold", !r.error && val(r) === 1, r.error);
ok("cancelled seat is free again", !(await taken()).includes(s1));

// Staff
r = await as("authenticated", p1, `select public.ticketing_snapshot() j`);
ok("passenger can't open the staff snapshot", /not a Ticketing member/.test(r.error ?? ""), r.error);
r = await as("authenticated", admin, `select public.ticketing_snapshot() j`);
ok("admin snapshot includes online bookings", !r.error && val(r).tickets.some((t) => t.source === "Online" && t.booked_by), r.error);
r = await as("authenticated", admin, `select count(*)::int n from ticketing.tickets`);
ok("admin can read tickets table", !r.error && r.rows[0].n > 231, r.error);

// ---- Core links: review, hand fix, validate
const review = async () => val(await as("authenticated", admin, `select public.ticketing_link_review() j`));
let rv = await review();
const has = (rows, code, re) => rows.some((x) => x.code === code && re.test(x.problem));
ok("core matched buses by normalised plate", (await one(`select vehicle_id from ticketing.buses where plate_no = 'ABC-1234'`)).vehicle_id === vABC);
ok("core matched route by name", (await one(`select destination_id from ticketing.routes where code = 'RLT-BAT'`)).destination_id !== null);
ok("review: company without operator", has(rv, "RLT", /No operator/));
ok("review: bus with no matching plate", has(rv, "NOPE 1", /no registered vehicle/));
ok("review: bus whose plate matches several vehicles", has(rv, "DUP1", /several/));
ok("review: route without destination", has(rv, "RLT-NAG", /No destination/));
ok("review leaves out demo rows", !rv.some((x) => /^DEMO/.test(x.code) || ["DLTB", "KRS", "LOR", "OGW", "SCE"].includes(x.code)), `${rv.length} rows`);
r = await as("authenticated", p1, `select public.ticketing_link_review() j`);
ok("passenger can't open the link review", !!r.error);

let e = await db.query(`update ticketing.buses set vehicle_id = $1 where plate_no = 'NOPE 1'`, [vOTH]).catch((x) => x);
ok("bus can't link before its company has an operator", /Link company/.test(e.message ?? ""), e.message);
await db.query(`update ticketing.companies set operator_id = $1 where code = 'RLT'`, [op1]);
e = await db.query(`update ticketing.buses set vehicle_id = $1 where plate_no = 'NOPE 1'`, [vOTH]).catch((x) => x);
ok("bus can't link to another operator's vehicle", /not registered to the operator/.test(e.message ?? ""), e.message);
const demoBus = (await one(`select plate_no from ticketing.buses where is_demo limit 1`)).plate_no;
e = await db.query(`update ticketing.buses set vehicle_id = $1 where plate_no = $2`, [vABC, demoBus]).catch((x) => x);
ok("demo bus can't link to a real vehicle", /buses_demo_unlinked|not registered|Link company/.test(e.message ?? ""), e.message);
rv = await review();
ok("review: registered capacity differs from the seat layout", has(rv, "XYZ999", /capacity 45/));

// Hand fixes from link_fix.sql: unlinked rows stay null, so the keys validate.
await db.exec(`delete from ticketing.buses where plate_no in ('DUP1', 'NOPE 1');
               update ticketing.routes set destination_id = (select id from core.destinations where name_key = 'BATANGAS') where code = 'RLT-NAG';`);
for (const [t, c] of [["companies", "companies_operator_fk"], ["buses", "buses_vehicle_fk"], ["routes", "routes_destination_fk"], ["trips", "trips_booking_fk"]]) {
  e = await db.exec(`alter table ticketing.${t} validate constraint ${c}`).catch((x) => x);
  ok(`validate ${c}`, !(e instanceof Error), e.message);
}

// ---- Plates and operators come from core
await db.query(`update public.vehicles set plate_no = 'ABC 1234 X' where id = $1`, [vABC]);
let snap = val(await as("authenticated", admin, `select public.ticketing_snapshot() j`));
const bus = snap.buses.find((b) => b.bus_code === "ABC-1234");
ok("snapshot shows core's plate, not Ticketing's copy", bus?.plate_no === "ABC 1234 X", bus?.plate_no);
ok("snapshot shows registered capacity", bus?.seating_capacity === 49);
ok("snapshot shows the operator name from core", snap.companies.find((c) => c.code === "RLT")?.operator_name === "Real Lines Transit");
ok("profiles.role = 'ticketing' is a Ticketing Admin", val(await as("authenticated", tadmin, `select public.ticketing_snapshot() j`))?.me?.role === "admin");

// ---- Trip Scheduling booking links and seat sync
const bk = (await one(`insert into public.bookings (route, plate_no, operator_id, operator_name, trip_number, status, booking_date, slot)
  select 'Batangas', 'abc1234x', $1, 'Real Lines Transit', 'T-1', 'approved', d::date,
         (extract(hour from d) * 4 + 12)::smallint from (select now() at time zone 'Asia/Manila' d) x returning id`, [op1])).id;
const realTrip = async (no, booking, plate) => (await one(`insert into ticketing.trips (trip_no, booking_id, trip_date, trip_time, route_code, plate_no)
  select $1, $2, d::date, (d + interval '3 hours')::time, 'RLT-BAT', $3 from (select date_trunc('minute', now() at time zone 'Asia/Manila') d) x
  returning id`, [no, booking, plate])).id;
const t1 = await realTrip("REAL-1", bk, "ABC-1234"), t2 = await realTrip("REAL-2", null, "XYZ999");
await db.query(`insert into public.seat_reservations (request_ref, booking_id, seat_no, passenger_name, contact_no) values ('S-1', $1, 5, 'Req One', '0917 000 0009')`, [bk]);
r = await as("anon", null, `select public.ticketing_online_trips() j`);
const live = val(r) ?? [];
ok("linked real trip is bookable online", live.some((t) => t.trip_no === "REAL-1"), r.error);
ok("trip on a bus whose capacity doesn't match its layout is not", !live.some((t) => t.trip_no === "REAL-2"));
r = await as("anon", null, `select public.ticketing_trip_seats($1) j`, [t1]);
ok("Trip Scheduling seat request shows as taken in Ticketing", val(r)?.unavailable.includes(5), r.error);
r = await book(p1, [{ seat_no: 5, passenger_name: "Pia One" }], t1);
ok("passenger can't book a seat requested through Trip Scheduling", /already taken/.test(r.error ?? ""), r.error);
r = await book(p1, [{ seat_no: 7, passenger_name: "Pia One" }], t1);
ok("passenger books a real trip", !r.error, r.error);
r = await as("anon", null, `select public.ticketing_taken_seats($1) j`, [bk]);
ok("Trip Scheduling sees Ticketing's seat as taken", val(r)?.includes(7) && !val(r)?.includes(5), JSON.stringify(val(r)));
ok("booking resolves to Ticketing's linked vehicle", (await one(`select public.ticketing_booking_vehicle($1) v`, [bk])).v === vABC);
r = await as("anon", null, `select * from public.get_trip_seats($1)`, [bk]);
ok("seat picker greys out Ticketing's seat (proposal)", r.rows?.some((x) => x.seat_no === 7 && x.state === "sold"), r.error);
r = await as("anon", null, `select public.request_seats($1, '{7}', 'Req Two', '0917 000 0010') j`, [bk]);
ok("request_seats refuses a seat Ticketing sold (proposal)", /already sold/.test(r.error ?? ""), r.error);
r = await as("anon", null, `select public.request_seats($1, '{9}', 'Req Two', '0917 000 0010') j`, [bk]);
ok("request_seats finds the bus by link, not plate text (proposal)", !r.error, r.error);

// ---- Demo mode off: demo rows stay out of pages, bookings and reports
await db.exec(`update ticketing.settings set demo_mode = false`);
r = await as("anon", null, `select public.ticketing_online_trips() j`);
ok("demo mode off: no demo trips online", !(val(r) ?? []).some((t) => /^DEMO/.test(t.trip_no)) && (val(r) ?? []).some((t) => t.trip_no === "REAL-1"));
r = await book(p2, [{ seat_no: 50, passenger_name: "Paolo Two" }], trip.trip_id);
ok("demo mode off: demo trip can't be booked", /not open/.test(r.error ?? ""), r.error);
snap = val(await as("authenticated", admin, `select public.ticketing_snapshot() j`));
ok("demo mode off: snapshot has no demo rows",
   !snap.tickets.some((t) => t.is_demo) && !snap.trips.some((t) => t.is_demo) && !snap.companies.some((c) => c.is_demo) && snap.tickets.length > 0,
   `${snap.tickets.length} tickets, ${snap.trips.length} trips`);
await db.exec(`update ticketing.settings set demo_mode = true`);

r = await as("authenticated", admin, `select public.ticketing_clear_demo() j`);
ok("admin can clear demo data even with online bookings on demo trips", !r.error, r.error);
const left = await one(`select (select count(*) from ticketing.trips)::int tr, (select count(*) from ticketing.tickets)::int t`);
ok("nothing demo left, real rows kept", left.tr === 2 && left.t === 1, JSON.stringify(left));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
