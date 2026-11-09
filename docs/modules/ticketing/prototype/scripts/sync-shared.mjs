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
