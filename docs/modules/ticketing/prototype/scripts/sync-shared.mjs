// Copies the PITX App look into the demo, so Ticketing matches Trip Scheduling and TOS:
//   docs/shared/styles.css      -> src/app/pitx-shared.css
//   ICONS in docs/shared/platform.js -> src/lib/pitx-icons.json
// Runs before dev and build. The copies are committed so the demo also builds
// outside the repo; when docs/shared isn't next to it, the committed copies are used.
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "..");
const shared = process.env.PITX_SHARED_DIR ?? path.resolve(app, "../../../shared");

if (!existsSync(path.join(shared, "styles.css"))) {
  console.log(`sync-shared: ${shared} not found, using the committed copies`);
  process.exit(0);
}

const css = readFileSync(path.join(shared, "styles.css"), "utf8");
writeFileSync(
  path.join(app, "src/app/pitx-shared.css"),
  `/* GENERATED from docs/shared/styles.css by scripts/sync-shared.mjs. Do not edit here. */\n${css}`,
);

const platform = readFileSync(path.join(shared, "platform.js"), "utf8");
const match = platform.match(/export const ICONS = (\{[\s\S]*?\n\});/);
if (!match) throw new Error("sync-shared: ICONS not found in platform.js");
writeFileSync(path.join(app, "src/lib/pitx-icons.json"), JSON.stringify(JSON.parse(match[1]), null, 2) + "\n");

console.log("sync-shared: copied styles.css and ICONS from", shared);

// Trip Scheduling's destinations and gates (its assets/app.js), so Ticketing's routes and
// trip-number codes are the same ones (src/lib/trip-routes.ts).
const tsApp = process.env.PITX_TRIP_SCHEDULING_APP ?? path.resolve(app, "../../trip-scheduling/assets/app.js");
if (existsSync(tsApp)) {
  const source = readFileSync(tsApp, "utf8");
  const literal = (name) => {
    const found = source.match(new RegExp(`export const ${name} = ([\\[{][\\s\\S]*?\\n[\\]}]);`));
    if (!found) throw new Error(`sync-shared: ${name} not found in ${tsApp}`);
    return new Function(`return ${found[1]}`)();
  };
  writeFileSync(
    path.join(app, "src/lib/trip-routes.json"),
    JSON.stringify({ source: "docs/modules/trip-scheduling/assets/app.js", routes: literal("ROUTES"), gates: literal("ROUTE_GATES") }, null, 2) + "\n",
  );
  console.log("sync-shared: copied ROUTES and ROUTE_GATES from", tsApp);
} else {
  console.log(`sync-shared: ${tsApp} not found, using the committed trip-routes.json`);
}

// Trip Scheduling's demo week (scripts/trip-scheduling/seed-demo-week.mjs): which operator
// runs which destination, at what time and on which weekdays, and which trips it leaves
// pending, rejected or cancelled. Ticketing's sample trips are the same ones (seed.ts).
const tsWeek = process.env.PITX_TRIP_SCHEDULING_WEEK ?? path.resolve(app, "../../../../scripts/trip-scheduling/seed-demo-week.mjs");
if (existsSync(tsWeek)) {
  const source = readFileSync(tsWeek, "utf8");
  const start = source.indexOf("const ALL =");
  const end = source.indexOf("/* ---", source.indexOf("const OVERRIDES"));
  if (start < 0 || end < 0) throw new Error(`sync-shared: trip list not found in ${tsWeek}`);
  const week = new Function(
    `${source.slice(start, end)}; return { trips: TRIPS, pendingAll: [...PENDING_ALL], pendingDays: PENDING_DAYS, overrides: OVERRIDES };`,
  )();
  writeFileSync(
    path.join(app, "src/lib/ts-demo-week.json"),
    JSON.stringify({ source: "scripts/trip-scheduling/seed-demo-week.mjs", ...week }) + "\n",
  );
  console.log("sync-shared: copied the demo week from", tsWeek);
} else {
  console.log(`sync-shared: ${tsWeek} not found, using the committed ts-demo-week.json`);
}
