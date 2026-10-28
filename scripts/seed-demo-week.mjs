#!/usr/bin/env node
/**
 * Seeds one week of realistic trip bookings across a spread of bus
 * operators, for demonstrating the app - NOT part of the app itself.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/seed-demo-week.mjs [YYYY-MM-DD]
 *
 * The optional date is the Monday the week starts on (defaults to the next
 * Monday). Safe to re-run: a booking is skipped if that operator already has
 * one at the same route/date/slot.
 *
 * It deliberately leaves the data in a mixed state so every screen has
 * something to show - see the SCENARIOS note below.
 *
 * Goes through the same two steps real data does (insert as pending, then a
 * staff decision), so the database triggers that assign trip numbers, trade
 * names, and notifications all fire. Bays are picked from the route's own
 * gate first, never double-booking a bay at the same date+slot.
 */
import { readFileSync } from "fs";
import path from "path";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}

/* ------------------------------------------------------------- the week */

function nextMonday() {
  const d = new Date();
  const add = ((8 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + add);
  return d;
}
const startArg = process.argv[2];
const start = startArg ? new Date(`${startArg}T12:00:00`) : nextMonday();
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const days = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(start);
  d.setDate(d.getDate() + i);
  return iso(d);
}); // index 0 = the Monday the week starts on

const slotOf = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 4 + m / 15;
};

/* --------------------------------------------------------------- trips
   days: indexes into the week, 0 = Mon .. 6 = Sun
   state: omitted = approved. "pending" = left in the staff queue.
   Special one-offs are listed in OVERRIDES below.                     */
const ALL = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [0, 1, 2, 3, 4];
const TRIPS = [
  // operator username, route, time, days
  ["jamliner.ops", "BATANGAS CITY", "05:30", ALL],
  ["jamliner.ops", "LUCENA CITY", "14:00", WEEKDAYS],
  ["genesis.ops", "CLARK INTERNATIONAL AIRPORT", "04:00", ALL],
  ["genesis.ops", "MARIVELES, BATAAN", "11:00", WEEKDAYS],
  ["bicolisarog.ops", "TABACO CITY", "18:00", ALL],
  ["bicolisarog.ops", "MAASIN CITY", "20:00", [1, 3, 5]],
  ["ceresgoldstar.ops", "ILO-ILO CITY", "16:30", ALL],
  ["ceresgoldstar.ops", "BATANGAS CITY (PIER)", "09:00", [0, 2, 4]],
  ["dltb.ops", "IRIGA CITY", "07:00", ALL],
  ["dltb.ops", "DAET", "16:00", [0, 2, 4]],
  ["alps.ops", "SAN JUAN, BATANGAS", "06:30", [0, 2, 4]],
  ["alps.ops", "LEGAZPI CITY", "15:00", [1, 3, 5]],
  ["elaviltours.ops", "CALBAYOG CITY", "12:00", ALL],
  ["elaviltours.ops", "MATNOG", "19:00", WEEKDAYS],
  ["batmanstarexpress.ops", "NASUGBU", "08:30", ALL],
  ["batmanstarexpress.ops", "CALATAGAN", "13:30", [4, 5, 6]],
  ["cagsawa.ops", "TABACO CITY", "21:00", ALL],
  ["davaometroshuttle.ops", "DAVAO CITY", "10:30", ALL],
  ["jamlinerlli.ops", "STA. CRUZ, LAGUNA", "06:00", [0, 1, 2, 3, 4, 5]],
  // second batch: more operators, more routes, more of the terminal in use
  ["abliner.ops", "CALAUAG", "05:00", WEEKDAYS],
  ["abliner.ops", "GUINAYANGAN", "13:00", [1, 3, 5]],
  ["arandialine.ops", "LEGAZPI CITY", "17:00", ALL],
  ["arandialine.ops", "PIO DURAN", "22:00", [0, 2, 4, 6]],
  ["baliwagtransit.ops", "SAN JOSE CITY, NUEVA ECIJA", "06:15", ALL],
  ["barneyautoline.ops", "SAN ANDRES", "09:30", WEEKDAYS],
  ["bicolmagayon.ops", "MASBATE CITY", "19:30", [0, 1, 3, 4, 6]],
  ["cultransport.ops", "LILOAN", "14:30", ALL],
  ["cultransport.ops", "MAASIN CITY", "20:30", [1, 3, 5, 6]],
  ["daetexpress.ops", "DAET", "15:30", ALL],
  ["dmmctravel.ops", "IRIGA CITY", "08:00", WEEKDAYS],
  ["easterngoldtrans.ops", "ORMOC CITY", "18:30", [0, 2, 4, 6]],
  ["firstnorthluzon.ops", "MARIVELES, BATAAN", "07:30", ALL],
  ["gvflorida.ops", "TUGUEGARAO CITY", "21:30", ALL],
  ["jacliner.ops", "STA. CRUZ", "10:00", WEEKDAYS],
  ["jvhtransport.ops", "GUBAT", "12:30", ALL],
  ["jvhtransport.ops", "MATNOG", "23:00", [4, 5, 6]],
  ["goldtransbts.ops", "BULAN", "11:30", [0, 1, 2, 3, 4, 5]],
  // third batch: several operators leaving at the SAME time, to many more
  // destinations - so a time slot (and the week matrix) shows more than one trip
  ["alps.ops", "SORSOGON CITY", "06:00", ALL],
  ["jvhtransport.ops", "TABACO CITY", "06:00", WEEKDAYS],
  ["antoninaline.ops", "TIWI", "06:00", [0, 2, 4, 6]],
  ["bicolisarog.ops", "LEGAZPI CITY", "06:00", [1, 3, 5]],
  ["dltb.ops", "NAGA, CAMARINES NORTE", "07:00", WEEKDAYS],
  ["elaviltours.ops", "LEGAZPI CITY", "07:00", [0, 2, 4, 6]],
  ["abliner.ops", "CALAUAG", "07:00", [1, 3, 5]],
  ["jamliner.ops", "BIÑAN, LAGUNA", "08:30", WEEKDAYS],
  ["batmanstarexpress.ops", "BALAYAN", "08:30", [1, 3, 5, 6]],
  ["barneyautoline.ops", "GUINAYANGAN", "08:30", ALL],
  ["jamliner.ops", "COTTA( LUCENA QUEZON)", "10:30", ALL],
  ["bicolmagayon.ops", "SABANG", "10:30", [0, 2, 4]],
  ["elaviltours.ops", "BULAN", "12:00", [1, 3, 5]],
  ["goldtransbts.ops", "BALATAN", "12:00", WEEKDAYS],
  ["jamlinerlli.ops", "LUCENA CITY", "12:00", [4, 5, 6]],
  ["ceresgoldstar.ops", "SAN JOSE, OCC. MINDORO", "14:00", ALL],
  ["jamliner.ops", "PACITA COMPLEX", "14:00", [0, 2, 4, 6]],
  ["alps.ops", "GUBAT", "14:00", [1, 3, 5]],
  ["ceresgoldstar.ops", "CEBU CITY", "16:00", ALL],
  ["elaviltours.ops", "MAASIN CITY", "16:00", [0, 2, 4, 6]],
  ["jvhtransport.ops", "PILAR, SORSOGON", "16:00", [1, 3, 5]],
  ["bicolisarog.ops", "TACLOBAN CITY", "18:00", WEEKDAYS],
  ["bobisliner.ops", "TABACO CITY", "18:00", ALL],
  ["cagsawa.ops", "TABACO CITY", "18:00", [0, 2, 4, 6]],
  ["easterngoldtrans.ops", "RAWIS, LAOANG", "18:00", [1, 3, 5]],
  ["ceresgoldstar.ops", "DAVAO CITY", "20:00", [0, 1, 2, 3, 4]],
  ["bicolisarog.ops", "MASBATE CITY", "20:00", ALL],
  ["cultransport.ops", "PALOMPON, LEYTE", "20:00", [2, 4, 6]],
  ["elaviltours.ops", "CALBAYOG CITY", "20:00", [0, 3, 5]],
  ["ceresgoldstar.ops", "GENERAL SANTOS CITY", "21:00", [1, 3, 5, 6]],
  ["bicolisarog.ops", "CATANDUANES", "21:00", WEEKDAYS],
  ["dltb.ops", "TABACO CITY", "21:00", [0, 2, 4, 6]],
];

/* SCENARIOS - what the finished week demonstrates:
 *  - Mon-Wed approved trips have a plate assigned; Thu-Sun don't, so the
 *    "plate needed" banners and the board's "No plate" marker both show.
 *  - jamlinerlli.ops' whole week is left PENDING: live approvals demo.
 *  - davaometroshuttle.ops Fri-Sun is also left pending.
 *  - One rejected request (with a reason), one approved trip with a
 *    cancellation request awaiting staff, one trip cancelled after approval
 *    (shows struck-through on the board and in Utilization). */
const PENDING_ALL = new Set(["jamlinerlli.ops"]);
const PENDING_DAYS = {
  "davaometroshuttle.ops": [4, 5, 6],
  "gvflorida.ops": [5, 6],
  "jvhtransport.ops": [4, 5, 6],
};
const PLATE_UP_TO_DAY_INDEX = 2; // Mon..Wed get plates
const OVERRIDES = [
  { who: "elaviltours.ops", route: "MATNOG", day: 4, status: "rejected",
    reason: "Gate 4 is at capacity at this time - please request 18:00 or 20:00 instead." },
  { who: "genesis.ops", route: "MARIVELES, BATAAN", day: 2, cancelRequest: "Bus under unscheduled maintenance." },
  { who: "dltb.ops", route: "DAET", day: 4, status: "cancelled" },
];

/* ------------------------------------------------------------ database */

const src = readFileSync(path.resolve(import.meta.dirname, "../docs/modules/trip-scheduling/assets/app.js"), "utf8");
const gateBlock = src.match(/export const ROUTE_GATES = \{([\s\S]*?)\n\};/)[1];
const ROUTE_GATES = Object.fromEntries(
  [...gateBlock.matchAll(/"((?:[^"\\]|\\.)*)":\s*"(Gate \d)"/g)].map((m) => [m[1], m[2]])
);

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = async (sql, p) => (await client.query(sql, p)).rows;

const staff = (await q(`select id from profiles where role='staff' order by username limit 1`))[0];
const bays = await q(`select id, name, gate from bays where is_active order by name`);
const taken = new Map(); // "date|slot" -> Set(bay ids)
for (const r of await q(
  `select booking_date::text d, slot, assigned_bay_id from bookings
   where status='approved' and assigned_bay_id is not null and booking_date = any($1)`, [days]
)) {
  const k = `${r.d}|${r.slot}`;
  if (!taken.has(k)) taken.set(k, new Set());
  taken.get(k).add(Number(r.assigned_bay_id));
}

// Picks the least-used free bay for the route's gate (ties by name), so trips
// spread across the gate's bays instead of piling onto the first one; falls
// back to the least-used free bay anywhere when the gate is full at that time.
const usage = new Map();
const leastUsed = (list) =>
  list.sort((a, b) => (usage.get(Number(a.id)) ?? 0) - (usage.get(Number(b.id)) ?? 0))[0];

function pickBay(route, date, slot) {
  const used = taken.get(`${date}|${slot}`) ?? new Set();
  const free = bays.filter((b) => !used.has(Number(b.id)));
  const gate = ROUTE_GATES[route];
  const bay = leastUsed(free.filter((b) => b.gate === gate)) ?? leastUsed(free);
  if (!bay) return null;
  usage.set(Number(bay.id), (usage.get(Number(bay.id)) ?? 0) + 1);
  if (!taken.has(`${date}|${slot}`)) taken.set(`${date}|${slot}`, new Set());
  taken.get(`${date}|${slot}`).add(Number(bay.id));
  return bay;
}

const plateCursor = new Map();
async function platesFor(profileId, route) {
  return (await q(
    `select plate_no from vehicles where operator_id=$1 and route=$2 and status='approved'
     and (ltfrb_status is null or ltfrb_status in ('active','ltfrb_verified'))
     and (cpc_validity is null or cpc_validity >= current_date)
     and (not coalesce(cpc_eov,false) or cpc_eov_validity is null or cpc_eov_validity >= current_date)
     order by plate_no`, [profileId, route]
  )).map((r) => r.plate_no);
}

const tally = { created: 0, skipped: 0, approved: 0, pending: 0, rejected: 0, cancelled: 0, plated: 0 };
const unknown = [];

try {
  for (const [username, route, time, tripDays] of TRIPS) {
    const prof = (await q(`select id, operator_name from profiles where username=$1`, [username]))[0];
    if (!prof) { unknown.push(username); continue; }
    const plates = await platesFor(prof.id, route);
    if (plates.length === 0) { unknown.push(`${username} has no eligible vehicle on ${route}`); continue; }
    const slot = slotOf(time);

    for (const di of tripDays) {
      const date = days[di];
      const dupe = await q(
        `select 1 from bookings where operator_id=$1 and route=$2 and booking_date=$3 and slot=$4
         and status in ('pending','approved','rejected','cancelled')`, [prof.id, route, date, slot]
      );
      if (dupe.length) { tally.skipped++; continue; }

      const ov = OVERRIDES.find((o) => o.who === username && o.route === route && o.day === di);
      const wantPending =
        PENDING_ALL.has(username) || (PENDING_DAYS[username] ?? []).includes(di);

      const ins = (await q(
        `insert into bookings (operator_id, operator_name, route, booking_date, slot, status)
         values ($1,$2,$3,$4,$5,'pending') returning id`,
        [prof.id, prof.operator_name, route, date, slot]
      ))[0];
      tally.created++;

      if (ov?.status === "rejected") {
        await q(
          `update bookings set status='rejected', rejection_reason=$2, decided_by=$3, decided_at=now() where id=$1`,
          [ins.id, ov.reason, staff.id]
        );
        tally.rejected++;
        continue;
      }
      if (wantPending) { tally.pending++; continue; }

      const bay = pickBay(route, date, slot);
      if (!bay) { tally.pending++; continue; } // no bay free - leave for staff
      let plate = null;
      if (di <= PLATE_UP_TO_DAY_INDEX) {
        const key = `${username}|${route}`;
        const i = plateCursor.get(key) ?? 0;
        plate = plates[i % plates.length];
        plateCursor.set(key, i + 1);
        tally.plated++;
      }
      await q(
        `update bookings set status='approved', assigned_bay_id=$2, plate_no=$3, decided_by=$4, decided_at=now() where id=$1`,
        [ins.id, bay.id, plate, staff.id]
      );
      tally.approved++;

      if (ov?.cancelRequest) {
        await q(
          `update bookings set cancellation_requested_at=now(), cancellation_reason=$2 where id=$1`,
          [ins.id, ov.cancelRequest]
        );
      }
      if (ov?.status === "cancelled") {
        await q(
          `update bookings set status='cancelled', previously_approved=true, decided_by=$2, decided_at=now() where id=$1`,
          [ins.id, staff.id]
        );
        tally.cancelled++;
        tally.approved--;
      }
    }
  }
  await respreadBays();
} finally {
  await client.end();
}

// Re-deals the bays for EVERY approved trip in the week (this script owns the
// week, so that includes earlier runs' rows) using the same least-used rule,
// so an older run's piled-up bays get spread too. Done in one transaction;
// bays are cleared first so the unique approved bay+slot index never trips
// mid-shuffle.
async function respreadBays() {
  const rows = await q(
    `select id, route, booking_date::text d, slot from bookings
     where status='approved' and booking_date = any($1) order by booking_date, slot, id`, [days]
  );
  taken.clear();
  usage.clear();
  const plan = rows.map((r) => [r.id, pickBay(r.route, r.d, r.slot)?.id ?? null]);
  await client.query("begin");
  await client.query(
    `update bookings set assigned_bay_id = null where status='approved' and booking_date = any($1)`, [days]
  );
  for (const [id, bayId] of plan) {
    await client.query("update bookings set assigned_bay_id=$2 where id=$1", [id, bayId]);
  }
  await client.query("commit");
  tally.respread = plan.length;
}

console.log(`Week of ${days[0]} to ${days[6]}`);
console.log(tally);
if (unknown.length) console.log("Skipped entries:", unknown);
