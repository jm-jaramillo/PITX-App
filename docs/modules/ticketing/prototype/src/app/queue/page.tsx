"use client";

import { useState, type FormEvent } from "react";
import { PageTitle } from "@/components/page-title";
import { dateTimeManila, todayManila } from "@/lib/format";
import { saleDate } from "@/lib/reports";
import { recordQueueCount, useDb } from "@/lib/store";
import { QUEUE_PLACES, type QueuePlace } from "@/lib/types";

const manilaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" });
const manilaTime = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit" });

/**
 * Passenger demand data gathering from the process map: Ticketing and Boarding staff count
 * the people waiting at each booth and gate during the day.
 */
export default function QueuePage() {
  const db = useDb();
  const today = todayManila();
  const [place, setPlace] = useState<QueuePlace>("Ticket booth");
  const [spot, setSpot] = useState("");
  const [count, setCount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const counts = db.queueCounts.filter((q) => manilaDate.format(new Date(q.at)) === today).slice().reverse();
  const gates = [...new Set(db.trips.filter((t) => t.date === today && t.bay).map((t) => t.bay))].sort();
  const spots = place === "Ticket booth" ? db.counters.filter((c) => c.status === "Active").map((c) => c.code) : gates;
  // Latest count per booth or gate, and the busiest count today.
  const latest = new Map<string, (typeof counts)[number]>();
  for (const q of counts) if (!latest.has(`${q.place}|${q.spot}`)) latest.set(`${q.place}|${q.spot}`, q);
  const peak = counts.reduce<(typeof counts)[number] | undefined>((best, q) => (!best || q.count > best.count ? q : best), undefined);
  const served = db.tickets.filter((t) => t.status !== "Voided" && saleDate(t) === today).length;

  function submit(event: FormEvent) {
    event.preventDefault();
    const problem = recordQueueCount(place, spot, count === "" ? NaN : Number(count));
    setError(problem);
    if (!problem) setCount("");
  }

  return (
    <div className="space-y-4">
      <PageTitle sub="Count the people in line at the ticket booths and boarding gates during the day. The counts go into the Passenger Demand Report.">
        Queue Count
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="kpi">
          <div className="kpi-label">Counts today</div>
          <div className="kpi-value">
            <strong>{counts.length}</strong>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Longest line</div>
          <div className="kpi-value">
            <strong>{peak?.count ?? 0}</strong>
            <span>{peak ? `${peak.spot} · ${manilaTime.format(new Date(peak.at))}` : "people"}</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Tickets sold today</div>
          <div className="kpi-value">
            <strong>{served}</strong>
            <span>passengers</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <form noValidate onSubmit={submit} className="h-fit space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="section-head">New count</p>
          <label>
            Where
            <select
              value={place}
              onChange={(e) => {
                setPlace(e.target.value as QueuePlace);
                setSpot("");
              }}
            >
              {QUEUE_PLACES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            {place === "Ticket booth" ? "Counter" : "Gate or bay"}
            <input list="queue-spots" value={spot} onChange={(e) => setSpot(e.target.value)} />
            <datalist id="queue-spots">
              {spots.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label>
            People in line
            <input type="number" min={0} step={1} value={count} onChange={(e) => setCount(e.target.value)} />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button className="w-full rounded bg-accent py-2.5 font-semibold text-white hover:bg-accent-dark">Save count</button>
        </form>

        <div className="space-y-4">
          {latest.size > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="section-head mb-2">Latest per booth and gate</p>
              <ul className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
                {[...latest.values()].map((q) => (
                  <li key={q.id} className="rounded border border-slate-200 px-3 py-2">
                    <span className="font-semibold">{q.spot}</span> · {q.place}
                    <div>
                      <strong className="text-lg">{q.count}</strong> in line at {manilaTime.format(new Date(q.at))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Where</th>
                  <th className="px-3 py-2">Booth or gate</th>
                  <th className="px-3 py-2 text-right">In line</th>
                  <th className="px-3 py-2">Counted by</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((q) => (
                  <tr key={q.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{dateTimeManila(q.at)}</td>
                    <td className="px-3 py-2">{q.place}</td>
                    <td className="px-3 py-2">{q.spot}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{q.count}</td>
                    <td className="px-3 py-2">{q.by}</td>
                  </tr>
                ))}
                {counts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      No counts yet today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
