#!/usr/bin/env node
/**
 * Demo for the automatic, balanced bay assignment (migration 202610291200).
 * NOT part of the app.
 *
 *   DATABASE_URL=postgresql://... node scripts/trip-scheduling/seed-balanced-bay-demo.mjs [YYYY-MM-DD]
 *
 * The optional date is the Monday of the demo week (default 2026-11-02).
 * Re-runnable: a trip is skipped if the operator already has it.
 *
 * Unlike seed-demo-week.mjs this NEVER chooses a bay: bookings are inserted
 * exactly as an operator's request would be (no bay), and the database trigger
 * assigns one. About 85% are then approved keeping that bay; the rest stay
 * pending so Approvals shows the preselected "(auto)" bay.
 *
 * The load is deliberately bay-hungry: several operators leave at the same time
 * for the same gate, which under the old "lowest free bay" rule would have
 * produced Bay 18, 19, 20... every single day.
 */
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) { console.error("Set DATABASE_URL first."); process.exit(1); }

const start = new Date(`${process.argv[2] ?? "2026-11-02"}T12:00:00`);
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return iso(d); });
const slotOf = (t) => { const [h, m] = t.split(":").map(Number); return h * 4 + m / 15; };
const ALL = [0, 1, 2, 3, 4, 5, 6], WEEKDAYS = [0, 1, 2, 3, 4];

// operator, route, time, days  (all known-eligible pairs from the demo week)
const TRIPS = [
  // Gate 4 (Bicol/Quezon): same-time clusters
  ["alps.ops", "SORSOGON CITY", "06:00", ALL],
  ["jvhtransport.ops", "TABACO CITY", "06:00", WEEKDAYS],
  ["antoninaline.ops", "TIWI", "06:00", [0, 2, 4, 6]],
  ["bicolisarog.ops", "LEGAZPI CITY", "06:00", [1, 3, 5]],
  ["dltb.ops", "IRIGA CITY", "07:00", ALL],
  ["elaviltours.ops", "LEGAZPI CITY", "07:00", [0, 2, 4, 6]],
  ["dmmctravel.ops", "IRIGA CITY", "08:00", WEEKDAYS],
  ["arandialine.ops", "LEGAZPI CITY", "17:00", ALL],
  ["bicolisarog.ops", "TABACO CITY", "18:00", ALL],
  ["bobisliner.ops", "TABACO CITY", "18:00", ALL],
  ["cagsawa.ops", "TABACO CITY", "18:00", [0, 2, 4, 6]],
  ["bicolisarog.ops", "TACLOBAN CITY", "18:00", WEEKDAYS],
  ["bicolisarog.ops", "MASBATE CITY", "20:00", ALL],
  ["elaviltours.ops", "CALBAYOG CITY", "20:00", [0, 3, 5]],
  ["bicolisarog.ops", "CATANDUANES", "21:00", WEEKDAYS],
  ["dltb.ops", "TABACO CITY", "21:00", [0, 2, 4, 6]],
  ["cagsawa.ops", "TABACO CITY", "21:30", ALL],
  // Gate 5 (Clark / Bataan / Nueva Ecija) and others
  ["genesis.ops", "CLARK INTERNATIONAL AIRPORT", "04:00", ALL],
  ["genesis.ops", "MARIVELES, BATAAN", "07:30", WEEKDAYS],
  ["firstnorthluzon.ops", "MARIVELES, BATAAN", "07:30", ALL],
  ["baliwagtransit.ops", "SAN JOSE CITY, NUEVA ECIJA", "06:15", ALL],
  ["jamliner.ops", "BATANGAS CITY", "05:30", ALL],
  ["jamliner.ops", "LUCENA CITY", "14:00", WEEKDAYS],
  ["ceresgoldstar.ops", "ILO-ILO CITY", "16:30", ALL],
  ["ceresgoldstar.ops", "CEBU CITY", "16:00", ALL],
  ["elaviltours.ops", "MAASIN CITY", "16:00", [0, 2, 4, 6]],
];
const PENDING_EVERY = 7; // every 7th new trip stays pending (~15%)

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = async (s, p) => (await client.query(s, p)).rows;
const staff = (await q(`select id from profiles where role='staff' order by username limit 1`))[0];
const tally = { created: 0, skipped: 0, approved: 0, pending: 0, noBay: 0 };
const unknown = [];
let n = 0;

try {
  const order = [];
  for (const [u, route, time, tripDays] of TRIPS)
    for (const di of tripDays) order.push({ u, route, slot: slotOf(time), date: days[di] });
  order.sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot);

  const profiles = new Map();
  for (const t of order) {
    if (!profiles.has(t.u))
      profiles.set(t.u, (await q(`select id, operator_name from profiles where username=$1`, [t.u]))[0] ?? null);
    const prof = profiles.get(t.u);
    if (!prof) { if (!unknown.includes(t.u)) unknown.push(t.u); continue; }
    const dupe = await q(
      `select 1 from bookings where operator_id=$1 and route=$2 and booking_date=$3 and slot=$4
       and status in ('pending','approved')`, [prof.id, t.route, t.date, t.slot]);
    if (dupe.length) { tally.skipped++; continue; }

    // no bay supplied: the trigger picks it
    const ins = (await q(
      `insert into bookings (operator_id, operator_name, route, booking_date, slot, status)
       values ($1,$2,$3,$4,$5,'pending') returning id, assigned_bay_id`,
      [prof.id, prof.operator_name, t.route, t.date, t.slot]))[0];
    tally.created++; n++;
    if (ins.assigned_bay_id == null) tally.noBay++;
    if (n % PENDING_EVERY === 0 || ins.assigned_bay_id == null) { tally.pending++; continue; }
    await q(`update bookings set status='approved', decided_by=$2, decided_at=now() where id=$1`, [ins.id, staff.id]);
    tally.approved++;
  }
} finally { await client.end(); }

console.log(`Demo week ${days[0]} to ${days[6]}`);
console.log(tally);
if (unknown.length) console.log("Unknown operators:", unknown);
