import week from "./ts-demo-week.json";

// Trip Scheduling's demo week, copied from scripts/trip-scheduling/seed-demo-week.mjs by
// scripts/sync-shared.mjs. Ticketing's sample trips are the same trips: same operator,
// destination, time and weekdays, and only the ones Trip Scheduling approves (pending and
// rejected requests never reach Ticketing).

/** [portal username, destination, HH:mm, weekdays (0 = Monday)] */
export type WeekTrip = [string, string, string, number[]];

interface Override {
  who: string;
  route: string;
  day: number;
  status?: "rejected" | "cancelled";
  reason?: string;
  cancelRequest?: string;
}

export const WEEK_TRIPS = week.trips as WeekTrip[];
const PENDING_ALL = new Set(week.pendingAll as string[]);
const PENDING_DAYS = week.pendingDays as Record<string, number[]>;
const OVERRIDES = week.overrides as Override[];

/** The operator accounts in the demo week. Names are each account's company name. */
export const TS_OPERATORS: { username: string; code: string; name: string; logo?: string }[] = [
  { username: "abliner.ops", code: "ABL", name: "A&B LINER" },
  { username: "alps.ops", code: "ALPS", name: "ALPS THE BUS, INC" },
  { username: "antoninaline.ops", code: "ANT", name: "ANTONINA LINE" },
  { username: "arandialine.ops", code: "ARL", name: "A. ARANDIA LINE" },
  { username: "baliwagtransit.ops", code: "BTI", name: "BALIWAG TRANSIT" },
  { username: "barneyautoline.ops", code: "BAL", name: "BARNEY AUTO LINES (BAL TRANSPORT CORPORATION)" },
  { username: "batmanstarexpress.ops", code: "BSE", name: "BATMAN STAREXPRESS CORPORATION" },
  { username: "bicolisarog.ops", code: "BIS", name: "BICOL ISAROG" },
  { username: "bicolmagayon.ops", code: "BMG", name: "BICOL MAGAYON" },
  { username: "bobisliner.ops", code: "BOB", name: "BOBIS LINER" },
  { username: "cagsawa.ops", code: "CAG", name: "CAGSAWA TRAVEL & TOURS" },
  { username: "ceresgoldstar.ops", code: "CER", name: "CERES TRANSPORT INC / GOLDSTAR BUS TRANSIT INC" },
  { username: "cultransport.ops", code: "CUL", name: "C.U.L. TRANSPORT" },
  { username: "daetexpress.ops", code: "DAE", name: "DAET AUTO EXPRESS TRANSIT INC." },
  { username: "davaometroshuttle.ops", code: "DMS", name: "DAVAO METRO SHUTTLE (DMS)" },
  { username: "dltb.ops", code: "DLTB", name: "DEL MONTE MOTOR WORKS INC (DLTB)", logo: "/brand/operators/dltb.jpg" },
  { username: "dmmctravel.ops", code: "DMMC", name: "DMMC TRAVEL AND TOURS, INC." },
  { username: "easterngoldtrans.ops", code: "EGT", name: "EASTERN GOLDTRANS TOURS, INC." },
  { username: "elaviltours.ops", code: "ELV", name: "ELAVIL TOURS PHILS INC" },
  { username: "firstnorthluzon.ops", code: "FNL", name: "FIRST NORTH LUZON TRANSIT, INC." },
  { username: "genesis.ops", code: "GEN", name: "GENESIS TRANSPORT SERVICE INC" },
  { username: "goldtransbts.ops", code: "GBT", name: "GOLDTRANS BUS TRANSPORTATION SERVICES" },
  { username: "gvflorida.ops", code: "GVF", name: "GV FLORIDA TRANSPORT, INC" },
  { username: "jacliner.ops", code: "JAC", name: "JAC LINER INC" },
  { username: "jamliner.ops", code: "JAM", name: "JAM LINER INC" },
  { username: "jamlinerlli.ops", code: "LLI", name: "LUCENA LINES INC (LLI)" },
  { username: "jvhtransport.ops", code: "JVH", name: "JVH TRANSPORT / R. VOLANTE LINE" },
];

export const operatorByUsername = (username: string) => TS_OPERATORS.find((o) => o.username === username);

/** Each operator's destinations in the demo week, in the order they appear. */
export function destinationsOf(username: string): string[] {
  return [...new Set(WEEK_TRIPS.filter((t) => t[0] === username).map((t) => t[1]))];
}

/** Monday = 0, as in the demo week. */
export function weekday(date: string): number {
  return (new Date(`${date}T12:00:00+08:00`).getUTCDay() + 6) % 7;
}

export interface ApprovedTrip {
  username: string;
  destination: string;
  time: string;
  cancelled: boolean;
  cancelRequest?: string;
}

/** The trips Trip Scheduling approves on this date's weekday, by departure time. */
export function approvedTrips(date: string): ApprovedTrip[] {
  const day = weekday(date);
  return WEEK_TRIPS.filter(([who, , , days]) => days.includes(day))
    .filter(([who]) => !PENDING_ALL.has(who) && !(PENDING_DAYS[who] ?? []).includes(day))
    .map(([who, destination, time]) => {
      const override = OVERRIDES.find((o) => o.who === who && o.route === destination && o.day === day);
      return { username: who, destination, time, override };
    })
    .filter((t) => t.override?.status !== "rejected")
    .map(({ username, destination, time, override }) => ({
      username,
      destination,
      time,
      cancelled: override?.status === "cancelled",
      cancelRequest: override?.cancelRequest,
    }))
    .sort((a, b) => a.time.localeCompare(b.time) || a.username.localeCompare(b.username));
}

/** Operators whose every trip is still pending in Trip Scheduling. */
export const ALL_PENDING = [...PENDING_ALL];
