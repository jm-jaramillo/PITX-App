#!/usr/bin/env node
/**
 * Reset the vehicles table from the PITX "Vehicle Masterlist Database"
 * workbook and regenerate the route list that drives trip scheduling.
 *
 * Vehicles come from the workbook's **Database** sheet alone - it is the
 * source of truth for the fleet, and the other sheets are working notes.
 *
 * Gates are the exception. The Database sheet leaves `Gate Assignment`
 * blank for roughly half its destinations, so a gate is resolved in four
 * steps, each only filling what the one before it left empty:
 *
 *   1. the Database sheet's own `Gate Assignment`   (authoritative)
 *   2. the "Route Database" sheet, which names the gate per ROUTE
 *   3. the "Database- City Provl" sheet's CLUSTER, mapped to a gate
 *   4. whatever `public.route_gates` already holds
 *
 * Step 4 is what stops a re-import from silently dropping gates that were
 * set by hand or by an earlier migration: route_gates is only ever added
 * to, never reduced, by this script (see #129).
 *
 * Route model: `Destination` is the route. Every vehicle's `route` is set
 * to its own `Destination`, so the existing "a vehicle can only be used
 * for a booking on its own route" rule (vehicle_matches_route(), plain
 * equality since migration 0031) keeps working unchanged - and the
 * booking form's route dropdown, which is already narrowed to routes the
 * operator has a registered vehicle for, automatically narrows to the
 * destinations that operator actually serves.
 *
 * Operator resolution is by **plate number against the current database**,
 * not by name. The workbook's operator names don't match the app's
 * account names (111 distinct names vs 78 accounts, with variants like
 * "BICOL ISAROG TRANSPORT SYSTEM INC" vs "...INC."), but the plates
 * already map to accounts from the previous import, and that mapping is
 * exact. Name similarity is only a fallback for plates never seen before.
 *
 * Usage:
 *   node scripts/import-vehicle-masterlist.mjs <workbook.xlsx>            # dry run
 *   node scripts/import-vehicle-masterlist.mjs <workbook.xlsx> --apply    # write
 */
import XLSX from "xlsx";
import pg from "pg";
import { writeFileSync } from "fs";

const file = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!file) {
  console.error("Usage: node scripts/import-vehicle-masterlist.mjs <workbook.xlsx> [--apply]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}

const normPlate = (s) => (s ?? "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
const text = (v) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};
/** Excel serial date -> YYYY-MM-DD. The workbook stores every date as a
 *  number; day 0 is 1899-12-30 (Excel's 1900 leap-year bug included). */
/** "4" / 4 / "Gate 4" -> "Gate 4"; blank -> null. */
const gateNo = (v) => {
  const s = text(v);
  if (!s) return null;
  return /^gate\b/i.test(s) ? s.replace(/^gate\s*/i, "Gate ") : `Gate ${s}`;
};
const serialDate = (v) => {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
};

const wb = XLSX.readFile(file);
if (!wb.SheetNames.includes("Database")) {
  console.error(`No "Database" sheet in ${file}. Found: ${wb.SheetNames.join(", ")}`);
  process.exit(1);
}
const raw = XLSX.utils.sheet_to_json(wb.Sheets["Database"], { defval: null, raw: true });
// Optional helper sheets - only used to fill in gates the Database sheet
// leaves blank. A workbook without them still imports.
const sheet = (name) =>
  wb.SheetNames.includes(name)
    ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null, raw: true })
    : [];
const routeDbSheet = sheet("Route Database");
const cityProvlSheet = sheet("Database- City Provl");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows: profiles } = await client.query(
  "select id, username, operator_name from public.profiles where role = 'operator'"
);
const { rows: existing } = await client.query("select plate_no, operator_id from public.vehicles");
const { rows: existingGates } = await client.query("select route, gate from public.route_gates");
const plateOwner = new Map(existing.map((r) => [normPlate(r.plate_no), r.operator_id]));

/* ------------------------------------------------ operator resolution */

const SUFFIX =
  /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LINES?|LINER|TRANSPORT|TRANSIT|TOURS?|TRAVEL|SERVICES?|SYSTEMS?|BUS|THE|AND|OPC|MULTIPURPOSE|COOPERATIVE)\b/g;
const normName = (s) =>
  (s ?? "").toString().toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const coreName = (s) => normName(s).replace(SUFFIX, " ").replace(/\s+/g, " ").trim();
const tokens = (s) => new Set(coreName(s).split(" ").filter((w) => w.length > 2));
function nameScore(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit++;
  return hit / Math.max(A.size, B.size);
}

// Each workbook Operator+Trade pair is resolved once, by majority vote of
// where its plates already live. A per-row lookup would let one stray
// plate scatter an operator's fleet across accounts.
const pairKey = (r) => `${text(r["Operator Name"]) ?? ""}|||${text(r["Trade Name"]) ?? ""}`;
const pairs = new Map();
for (const r of raw) {
  const k = pairKey(r);
  if (!pairs.has(k)) {
    pairs.set(k, {
      op: text(r["Operator Name"]),
      trade: text(r["Trade Name"]),
      rows: 0,
      votes: new Map(),
    });
  }
  const p = pairs.get(k);
  p.rows++;
  const owner = plateOwner.get(normPlate(r["Plate No."]));
  if (owner) p.votes.set(owner, (p.votes.get(owner) ?? 0) + 1);
}

const unresolved = [];
for (const p of pairs.values()) {
  const top = [...p.votes.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) {
    p.operatorId = top[0];
    p.how = `plates (${top[1]}/${p.rows})`;
    continue;
  }
  let best = null;
  let bestScore = 0;
  for (const pr of profiles) {
    const s = Math.max(nameScore(p.op, pr.operator_name), nameScore(p.trade, pr.operator_name));
    if (s > bestScore) {
      bestScore = s;
      best = pr;
    }
  }
  if (best && bestScore >= 0.6) {
    p.operatorId = best.id;
    p.how = `name ~${bestScore.toFixed(2)} (${best.operator_name})`;
  } else {
    unresolved.push(p);
  }
}

/* ------------------------------------------------------- row -> vehicle */

const vehicles = new Map(); // operatorId|plate -> row (deduped)
let skippedNoOperator = 0;
let skippedNoPlate = 0;
let deduped = 0;
let eovDowngraded = 0;

for (const r of raw) {
  const plate = text(r["Plate No."]);
  if (!plate) {
    skippedNoPlate++;
    continue;
  }
  const p = pairs.get(pairKey(r));
  if (!p?.operatorId) {
    skippedNoOperator++;
    continue;
  }

  const destination = text(r["Destination"]);
  const eovAnswer = (text(r["CPC Extension of Validity?"]) ?? "").toLowerCase() === "yes";
  const eovValidity = serialDate(r["CPC EOV Validity"]);
  // vehicles_cpc_eov_validity_check requires a date whenever the flag is
  // set. Some workbook rows answer "Yes" with no date; recorded as no
  // extension rather than inventing one (counted and reported below).
  const cpcEov = eovAnswer && eovValidity !== null;
  if (eovAnswer && !eovValidity) eovDowngraded++;

  const row = {
    operator_id: p.operatorId,
    plate_no: plate,
    trade_name: text(r["Trade Name"]),
    chassis_no: text(r["Chassis No."]),
    body_number: text(r["Body No."]),
    sticker_no: text(r["Sticker No."]),
    case_number: text(r["Case No."]),
    franchise: text(r["Franchise"]),
    origin: text(r["Origin"]),
    destination,
    // The route IS the destination - see the header comment.
    route: destination,
    cpc_validity: serialDate(r["CPC Validity"]),
    orcr_validity: serialDate(r["OR/CR Validity"]),
    cpc_eov: cpcEov,
    cpc_eov_validity: cpcEov ? eovValidity : null,
    remarks: text(r["Remarks"]),
  };

  const key = `${row.operator_id}|${normPlate(plate)}`;
  const prev = vehicles.get(key);
  if (prev) {
    deduped++;
    // Same operator listed the same plate twice (usually the operator-name
    // variants in the workbook). Keep whichever row carries more data.
    const filled = (o) => Object.values(o).filter((v) => v !== null && v !== false).length;
    if (filled(row) > filled(prev)) vehicles.set(key, row);
  } else {
    vehicles.set(key, row);
  }
}

const list = [...vehicles.values()];

/* ------------------------------------------------------- routes + gates */

/* PITX runs its provincial gates by cluster, and the "Bay" sheet maps the
 * three clusters to their gates. The City Provl sheet spells a cluster out
 * more finely than the Bay sheet labels it, so the mapping is written out
 * rather than parsed: CAVITEX and AGUINALDO are Cavite, which boards at
 * the same gate as Laguna/Batangas/Mindoro. CITY is deliberately absent -
 * those are commuter units and this module schedules provincial trips. */
const CLUSTER_GATE = {
  BICOL: "Gate 4",
  VISMIN: "Gate 4",
  NORTH: "Gate 5",
  LABAZON: "Gate 2",
  MIMAROPA: "Gate 2",
  CAVITEX: "Gate 2",
  AGUINALDO: "Gate 2",
};

const gateByDest = new Map();
const gateSource = new Map();
const setGate = (d, g, src) => {
  if (!d || !g || gateByDest.has(d)) return;
  gateByDest.set(d, g);
  gateSource.set(d, src);
};

// 1. the Database sheet's own column
for (const r of raw) setGate(text(r["Destination"]), gateNo(r["Gate Assignment"]), "Database");

// 2. the Route Database sheet, keyed by route name
const routeDbGate = new Map();
for (const r of routeDbSheet) {
  const d = text(r["ROUTE"]);
  const g = gateNo(r["Gate Assignment"] ?? r["GATE ASSIGNMENT"]);
  if (d && g && !routeDbGate.has(d)) routeDbGate.set(d, g);
}

// 3. the City Provl sheet's cluster. CITY rows are skipped outright.
const clusterByDest = new Map();
for (const r of cityProvlSheet) {
  const d = text(r["DESTINATION"]);
  const c = text(r["CLUSTER"]);
  if (!d || !c) continue;
  const key = c.toUpperCase();
  if (key === "CITY" || clusterByDest.has(d)) continue;
  clusterByDest.set(d, key);
}

for (const d of new Set(raw.map((r) => text(r["Destination"])).filter(Boolean))) {
  setGate(d, routeDbGate.get(d), "Route Database");
  setGate(d, CLUSTER_GATE[clusterByDest.get(d)], `cluster ${clusterByDest.get(d)}`);
}

// 4. anything already in route_gates that the workbook could not answer,
//    including routes this workbook no longer lists - those rows are kept
//    rather than deleted, so an import never loses a gate.
for (const { route, gate } of existingGates) setGate(route, gate, "route_gates (kept)");
const routes = [...new Set(raw.map((r) => text(r["Destination"])).filter(Boolean))].sort();

// Three-letter trip-number prefix per route, uniquified with a digit when
// two destinations share their first three letters.
const codes = new Map();
const used = new Set();
for (const route of routes) {
  const letters = route.toUpperCase().replace(/[^A-Z]/g, "");
  let code = (letters.slice(0, 3) || "XXX").padEnd(3, "X");
  if (used.has(code)) {
    for (let i = 2; i <= 9; i++) {
      const alt = code.slice(0, 2) + i;
      if (!used.has(alt)) {
        code = alt;
        break;
      }
    }
  }
  used.add(code);
  codes.set(route, code);
}

/* ----------------------------------------------------------- reporting */

console.log(`Workbook rows (Database sheet): ${raw.length}`);
console.log(`Operator+Trade pairs: ${pairs.size} (unresolved: ${unresolved.length})`);
for (const u of unresolved) {
  console.log(`  UNRESOLVED  ${u.rows} row(s)  "${u.op ?? ""}" / "${u.trade ?? ""}"`);
}
console.log(`Vehicles to import: ${list.length}`);
console.log(`  skipped, no plate:          ${skippedNoPlate}`);
console.log(`  skipped, no operator match: ${skippedNoOperator}`);
console.log(`  duplicate rows collapsed:   ${deduped}`);
console.log(`  "EOV Yes" without a date:   ${eovDowngraded} (recorded as no extension)`);
console.log(`Routes (distinct destinations): ${routes.length}`);
const withGate = routes.filter((r) => gateByDest.has(r)).length;
console.log(`  with a gate: ${withGate} | without: ${routes.length - withGate}`);
const bySource = {};
for (const r of routes) {
  if (!gateByDest.has(r)) continue;
  const k = gateSource.get(r) ?? "?";
  bySource[k] = (bySource[k] ?? 0) + 1;
}
for (const [k, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1]))
  console.log(`      ${String(n).padStart(4)} from ${k}`);
const noGate = routes.filter((r) => !gateByDest.has(r));
if (noGate.length) console.log(`  no gate from any source: ${noGate.join(", ")}`);
const carried = [...gateByDest.keys()].filter((r) => !routes.includes(r)).length;
console.log(`  route_gates rows carried over for routes not in this workbook: ${carried}`);

const accountsWithVehicles = new Set(list.map((v) => v.operator_id)).size;
console.log(`Operator accounts receiving vehicles: ${accountsWithVehicles} / ${profiles.length}`);

// Emitted for the client-side route list and the trip-code migration, so
// the app and the database can't drift from the workbook independently.
writeFileSync(
  "_routes.generated.json",
  JSON.stringify(
    { routes, gates: Object.fromEntries(gateByDest), codes: Object.fromEntries(codes) },
    null,
    2
  )
);
console.log("Wrote _routes.generated.json");

/* -------------------------------------------------------------- write */

if (!APPLY) {
  console.log("\nDry run - nothing written. Re-run with --apply to reset the vehicles table.");
  await client.end();
  process.exit(0);
}

try {
  await client.query("begin");
  const del = await client.query("delete from public.vehicles");
  console.log(`Deleted ${del.rowCount} existing vehicle rows.`);

  const cols = [
    "operator_id", "plate_no", "trade_name", "chassis_no", "body_number", "sticker_no",
    "case_number", "franchise", "origin", "destination", "route", "cpc_validity",
    "orcr_validity", "cpc_eov", "cpc_eov_validity", "remarks",
  ];
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < list.length; i += CHUNK) {
    const slice = list.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    slice.forEach((v, n) => {
      const base = n * cols.length;
      values.push(
        `(${cols.map((_, k) => `$${base + k + 1}`).join(",")}, 'approved', 'masterlist_import')`
      );
      params.push(...cols.map((c) => v[c]));
    });
    const { rowCount } = await client.query(
      `insert into public.vehicles (${cols.join(",")}, status, source) values ${values.join(",")}`,
      params
    );
    inserted += rowCount;
  }
  console.log(`Inserted ${inserted} vehicles.`);

  await client.query("delete from public.route_trip_codes");
  for (const [route, code] of codes) {
    await client.query("insert into public.route_trip_codes (route, code) values ($1,$2)", [
      route,
      code,
    ]);
  }
  console.log(`Rewrote route_trip_codes: ${codes.size} routes.`);

  // Same source as ROUTE_GATES in app.js; the database needs it too, to
  // enforce gate-wide booking transfers (migration 0050). gateByDest already
  // contains every row that was in route_gates before (resolver step 4), so
  // this rewrite can only add routes, never drop one.
  await client.query("delete from public.route_gates");
  for (const [route, gate] of gateByDest) {
    await client.query("insert into public.route_gates (route, gate) values ($1,$2)", [route, gate]);
  }
  console.log(`Rewrote route_gates: ${gateByDest.size} routes.`);

  await client.query("commit");
  console.log("Done.");
} catch (err) {
  await client.query("rollback");
  console.error("Rolled back:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
