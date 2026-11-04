// Runs the Ticketing migrations on PGlite (Postgres in WASM) with small Supabase
// stand-ins, then checks the passenger booking rules.
// Usage: node test.mjs <migrations folder>
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "fs";
import path from "path";

const dir = process.argv[2];
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

// Supabase stand-ins: roles, auth.users, auth.uid() from the request JWT.
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);

for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  try { await db.exec(readFileSync(path.join(dir, f), "utf8")); ok(`apply ${f}`, true); }
  catch (e) { ok(`apply ${f}`, false, e.message); process.exit(1); }
}

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
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
const uid = async (email) => (await one(`insert into auth.users (email) values ($1) returning id`, [email])).id;
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

r = await as("authenticated", admin, `select public.ticketing_clear_demo() j`);
ok("admin can clear demo data even with online bookings on demo trips", !r.error, r.error);
const left = await one(`select (select count(*) from ticketing.trips)::int tr, (select count(*) from ticketing.tickets)::int t`);
ok("nothing demo left", left.tr === 0 && left.t === 0, JSON.stringify(left));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
