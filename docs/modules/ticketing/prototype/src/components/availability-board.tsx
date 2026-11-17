"use client";

import { useEffect, useRef, useState } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { todayManila } from "@/lib/format";
import { asset } from "@/lib/paths";
import { routeGroupOf, ROUTE_GROUPS, type RouteGroup } from "@/lib/places";
import { departurePassed, scopedTrips, ticketAvailability, tripCompanyId, type AvailabilityStatus } from "@/lib/store";
import type { Db, Trip } from "@/lib/types";

// The Ticket Availability board, in the format of the PIDS screens at the booths: one group
// of routes per screen, a band per destination, then the trips still to leave today.

const RED = "#c1202f";
const NAVY = "#3b3a78";
const MAROON = "#6b1508";

/** What the PIDS legend calls each availability status. */
const BOARD: Record<AvailabilityStatus, { label: string; color: string }> = {
  Available: { label: "Available", color: "#14145a" },
  "Last Few Seats": { label: "Selling Fast", color: "#0f6b1f" },
  "Sold Out": { label: "Not Available", color: "#e00000" },
  "On-Hold": { label: "On Hold", color: "#475569" },
};

const LEGEND = [
  { label: "Available", swatch: "#14145a" },
  { label: "Selling Fast", swatch: "#0f6b1f" },
  { label: "Sold Out", swatch: "#e00000" },
];

function time12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  if (!now) return null;
  const zone = { timeZone: "Asia/Manila" } as const;
  const day = new Intl.DateTimeFormat("en-GB", { ...zone, weekday: "short", day: "numeric", month: "short", year: "numeric" })
    .format(now)
    .replace(",", "");
  const time = new Intl.DateTimeFormat("en-US", { ...zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(now);
  return (
    <span className="tabular-nums">
      {day}
      <span className="ml-5">{time}</span>
    </span>
  );
}

const stillToLeave = (t: Trip) => t.status !== "Cancelled" && t.status !== "Departed" && !departurePassed(t);

export function AvailabilityBoard({ db }: { db: Db }) {
  const [group, setGroup] = useState<RouteGroup>("Bicol");
  const [booth, setBooth] = useState("");
  const screen = useRef<HTMLDivElement>(null);
  const today = todayManila();

  const counter = db.counters.find((c) => c.id === booth);
  const boothCompanies = counter?.companyIds?.length ? new Set(counter.companyIds) : null;
  const routeOf = (t: Trip) => db.routes.find((r) => r.id === t.routeId);
  const destinationOf = (t: Trip) => (routeOf(t)?.description ?? "").replace(/^PITX to /, "");

  const upcoming = scopedTrips(db)
    .filter((t) => t.date === today && stillToLeave(t))
    .filter((t) => !boothCompanies || boothCompanies.has(tripCompanyId(db, t) ?? ""));
  const inGroup = (g: RouteGroup) => upcoming.filter((t) => routeGroupOf(destinationOf(t)) === g);
  const groups = ROUTE_GROUPS.filter((g) => g !== "Other" || inGroup(g).length > 0);

  const trips = inGroup(group);
  const destinations = [...new Set(trips.map(destinationOf))].sort();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto flex flex-wrap gap-2" role="tablist" aria-label="Route group">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={group === g}
              onClick={() => setGroup(g)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                group === g ? "border-brand bg-brand font-semibold text-white" : "border-slate-300 bg-white"
              }`}
            >
              {g} · {inGroup(g).length}
            </button>
          ))}
        </div>
        <label>
          Booth
          <select value={booth} onChange={(e) => setBooth(e.target.value)}>
            <option value="">All booths</option>
            {db.counters
              .filter((c) => c.status === "Active")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.description}
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          onClick={() => screen.current?.requestFullscreen?.()}
        >
          Full screen
        </button>
      </div>
      {counter && !boothCompanies && (
        <p className="text-xs text-slate-600">
          {counter.description} is open to all bus companies, so it shows every trip. Set its companies in Master Data, Counter
          Assignment.
        </p>
      )}

      <div ref={screen} className="overflow-x-auto bg-white" style={{ background: RED }}>
        <div className="min-w-[720px] p-2 text-white">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-1 pb-2">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset("/brand/pitx-horizontal-on-dark.png")} alt="PITX, Parañaque Integrated Terminal Exchange" className="h-12 w-auto" />
            </div>
            <div className="text-center">
              <div className="text-3xl font-black uppercase tracking-tight sm:text-4xl">Tickets Availability</div>
              <div className="text-sm font-semibold uppercase tracking-wider">{group}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <ul className="border border-white bg-white text-xs font-bold">
                {LEGEND.map((l) => (
                  <li key={l.label} className="flex items-center border-b border-slate-300 last:border-0">
                    <span className="h-4 w-6" style={{ background: l.swatch }} />
                    <span className="px-2" style={{ color: l.swatch }}>
                      {l.label}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="text-base">
                <Clock />
              </div>
            </div>
          </div>

          {destinations.length === 0 && (
            <p className="border-2 border-black px-3 py-10 text-center text-xl font-semibold" style={{ background: NAVY }}>
              No more {group} trips today{counter ? ` at ${counter.description}` : ""}.
            </p>
          )}

          {destinations.map((d) => (
            <section key={d} className="border-2 border-black">
              <h3 className="py-1 text-center text-3xl font-bold uppercase" style={{ background: NAVY }}>
                {d}
              </h3>
              <table className="w-full table-fixed text-left">
                <thead className="text-sm font-bold" style={{ background: MAROON }}>
                  <tr>
                    <th className="w-[28%] px-1 py-0.5">Company</th>
                    <th className="w-[10%] px-1">Aircon</th>
                    <th className="w-[18%] px-1">Time</th>
                    <th className="w-[22%] px-1">Available Tickets</th>
                    <th className="px-1">Status</th>
                  </tr>
                </thead>
                <tbody className="text-2xl font-bold sm:text-3xl">
                  {trips
                    .filter((t) => destinationOf(t) === d)
                    .sort((a, b) => a.time.localeCompare(b.time))
                    .map((t, i) => {
                      const company = db.companies.find((c) => c.id === tripCompanyId(db, t));
                      const bus = db.buses.find((b) => b.id === t.busId);
                      const { status, left } = ticketAvailability(db, t);
                      const look = BOARD[status];
                      const soldOut = status === "Sold Out";
                      return (
                        <tr key={t.id} className="text-slate-900" style={{ background: i % 2 ? "#b4b4b4" : "#c8c8c8" }}>
                          <td className="px-0 py-0">
                            <div className="flex items-center gap-3">
                              <span className="flex h-14 w-32 shrink-0 items-center justify-center bg-white p-1 text-sm">
                                <CompanyLogo company={company} className="h-12 w-full" />
                              </span>
                              <span className="truncate">{company?.code}</span>
                            </div>
                          </td>
                          <td className="px-1">{bus ? (bus.aircon ? "A/C" : "Ord") : "-"}</td>
                          <td className="px-1 tabular-nums" style={{ color: soldOut ? look.color : "#14145a" }}>
                            {time12(t.time)}
                          </td>
                          <td className="px-1 tabular-nums" style={{ color: soldOut ? look.color : "#14145a" }}>
                            {soldOut ? "Sold Out" : status === "On-Hold" ? "-" : left}
                          </td>
                          <td className="px-1" style={{ color: look.color }}>
                            {look.label}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Today&apos;s trips still to leave, the same seats-left numbers the booth screens show. Selling Fast is 20% of seats or
        fewer left. On Hold means no unit yet or selling stopped.
      </p>
    </div>
  );
}
