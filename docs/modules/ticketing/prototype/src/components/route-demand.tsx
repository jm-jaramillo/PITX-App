"use client";

import { Fragment, useState } from "react";
import { ROUTE_GROUPS } from "@/lib/places";
import type { RouteDemand } from "@/lib/store";

// Passengers served by route, grouped by the board's route groups (Bicol, Labazon, Mindoro,
// Visayas, Mindanao, Northern Routes). Click a group to see its routes. Load factor is
// boarded over seats available.

const pct = (boarded: number, seats: number) => (seats ? `${Math.round((boarded / seats) * 100)}%` : "-");

function totals(rows: RouteDemand[]) {
  return rows.reduce(
    (t, r) => ({ trips: t.trips + r.trips, seats: t.seats + r.seats, ticketed: t.ticketed + r.ticketed, boarded: t.boarded + r.boarded, vacant: t.vacant + r.vacant }),
    { trips: 0, seats: 0, ticketed: 0, boarded: 0, vacant: 0 },
  );
}

export function RouteDemandTable({ rows, top, showCompany }: { rows: RouteDemand[]; top?: number; showCompany?: boolean }) {
  const [open, setOpen] = useState<string[]>([]);
  const groups = [...ROUTE_GROUPS, null].map((g) => ({ group: g, rows: rows.filter((r) => r.group === g) })).filter((g) => g.rows.length);
  const cols = showCompany ? 8 : 7;
  const th = "px-3 py-2 text-right";
  const num = "px-3 py-2 text-right tabular-nums";

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2">Group / route</th>
            {showCompany && <th className="px-3 py-2">Company</th>}
            <th className={th}>Trips</th>
            <th className={th}>Seats available</th>
            <th className={th}>Tickets sold</th>
            <th className={th}>Boarded</th>
            <th className={th}>Vacant seats</th>
            <th className={th} title="Boarded over seats available">
              Load factor
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ group, rows: inGroup }) => {
            const key = group ?? "Not provincial";
            const t = totals(inGroup);
            const expanded = open.includes(key);
            const shown = top ? inGroup.slice(0, top) : inGroup;
            return (
              <Fragment key={key}>
                <tr className="border-t border-slate-200 bg-slate-50/60 font-semibold">
                  <td className="px-3 py-2" colSpan={showCompany ? 2 : 1}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      className="flex items-center gap-2 text-left"
                      onClick={() => setOpen(expanded ? open.filter((k) => k !== key) : [...open, key])}
                    >
                      <span aria-hidden className="inline-block w-3 text-slate-500">
                        {expanded ? "▾" : "▸"}
                      </span>
                      {key}
                      <span className="text-xs font-normal text-slate-500">
                        {inGroup.length} route{inGroup.length > 1 ? "s" : ""}
                      </span>
                    </button>
                  </td>
                  <td className={num}>{t.trips}</td>
                  <td className={num}>{t.seats}</td>
                  <td className={num}>{t.ticketed}</td>
                  <td className={num}>{t.boarded}</td>
                  <td className={num}>{t.vacant}</td>
                  <td className={num}>{pct(t.boarded, t.seats)}</td>
                </tr>
                {expanded &&
                  shown.map((r) => (
                    <tr key={r.routeId} className="border-t border-slate-100">
                      <td className="py-2 pl-8 pr-3">{r.route}</td>
                      {showCompany && <td className="px-3 py-2">{r.company}</td>}
                      <td className={num}>{r.trips}</td>
                      <td className={num}>{r.seats}</td>
                      <td className={num}>{r.ticketed}</td>
                      <td className={num}>{r.boarded}</td>
                      <td className={num}>{r.vacant}</td>
                      <td className={num}>{pct(r.boarded, r.seats)}</td>
                    </tr>
                  ))}
                {expanded && top && inGroup.length > top && (
                  <tr>
                    <td colSpan={cols} className="py-1 pl-8 pr-3 text-xs text-slate-500">
                      Top {top} of {inGroup.length} routes by tickets sold. All routes are in Reports.
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {groups.length === 0 && (
            <tr>
              <td colSpan={cols} className="px-3 py-4 text-center text-slate-500">
                No trips.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
