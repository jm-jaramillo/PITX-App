"use client";

import { useState } from "react";
import { peso } from "@/lib/format";
import { computeFare, saveCounterFare, useDb } from "@/lib/store";
import type { Counter, CounterFare, Route } from "@/lib/types";

const FARE_KEYS = ["adult", "student", "senior", "pwd"] as const;
const LABELS = { adult: "Adult", student: "Student", senior: "Senior", pwd: "PWD" } as const;

function CounterRow({ route, counter }: { route: Route; counter: Counter }) {
  const saved = route.counterFares?.find((f) => f.counterId === counter.id);
  const [selling, setSelling] = useState(saved?.selling ?? true);
  const [fares, setFares] = useState<Record<string, string>>(() =>
    Object.fromEntries(FARE_KEYS.map((k) => [k, saved?.[k] === undefined ? "" : String(saved[k])])),
  );
  const [done, setDone] = useState(false);

  function save() {
    const fare: CounterFare = { counterId: counter.id, selling };
    for (const key of FARE_KEYS) {
      if (fares[key] !== "") fare[key] = Number(fares[key]);
    }
    saveCounterFare(route.id, fare);
    setDone(true);
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2 whitespace-nowrap">
        {counter.code} · {counter.description}
      </td>
      <td className="px-3 py-2">
        <label className="!font-normal whitespace-nowrap">
          <input
            type="checkbox"
            checked={selling}
            onChange={(e) => {
              setSelling(e.target.checked);
              setDone(false);
            }}
          />
          Selling
        </label>
      </td>
      {FARE_KEYS.map((key) => (
        <td key={key} className="px-3 py-2">
          <input
            aria-label={`${LABELS[key]} fare at ${counter.code}`}
            type="number"
            min={0}
            step="any"
            className="!mt-0 min-w-20"
            placeholder={String(computeFare(route, LABELS[key]))}
            value={fares[key]}
            onChange={(e) => {
              setFares({ ...fares, [key]: e.target.value });
              setDone(false);
            }}
          />
        </td>
      ))}
      <td className="px-3 py-2 whitespace-nowrap">
        <button className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white" onClick={save}>
          Save
        </button>
        {done && <span className="ml-2 text-xs font-medium text-green-800">Saved</span>}
      </td>
    </tr>
  );
}

export function CounterFares() {
  const db = useDb();
  const [routeId, setRouteId] = useState(db.routes[0]?.id ?? "");
  const route = db.routes.find((r) => r.id === routeId);
  const counters = db.counters.filter((c) => c.status === "Active");

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="text-lg font-semibold">Counter Fares</h2>
          <p className="text-sm text-slate-600">
            Choose which counters sell a route and set their own fares. Blank fares use the route&apos;s fare, shown in gray.
          </p>
        </div>
        <label>
          Route
          <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            {db.routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} · {r.description}
              </option>
            ))}
          </select>
        </label>
      </div>
      {route && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="text-left text-xs">
              <tr>
                <th className="px-3 py-2">Counter</th>
                <th className="px-3 py-2">Sell</th>
                {FARE_KEYS.map((k) => (
                  <th key={k} className="px-3 py-2">
                    {LABELS[k]}
                  </th>
                ))}
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {counters.map((counter) => (
                <CounterRow key={`${route.id}-${counter.id}`} route={route} counter={counter} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {route && <p className="text-xs text-slate-500">Route Adult fare: {peso(route.price)}</p>}
    </section>
  );
}
