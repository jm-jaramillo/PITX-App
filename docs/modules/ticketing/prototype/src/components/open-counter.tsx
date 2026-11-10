"use client";

import { useState, type FormEvent } from "react";
import { openCounter, useDb } from "@/lib/store";

/**
 * Booth activation from the process map (Ticket / Boarding Pass Issuance): before the first
 * sale of the day, the Teller confirms the sign-in, printer, QR scanner, network and change fund.
 */
export function OpenCounter({ today }: { today: string }) {
  const db = useDb();
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const counter = db.counters.find((c) => c.id === db.session?.counterId);
  const checks = db.settings.openingChecks;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(openCounter(done, today));
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-lg space-y-3 rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold">
        Open counter {counter ? `${counter.code} · ${counter.description}` : ""}
      </h2>
      <p className="text-sm text-slate-600">
        Before your first sale today, check your booth. This is saved with your name and the time.
      </p>
      <ul className="space-y-2">
        {checks.map((c) => (
          <li key={c}>
            <label className="flex items-center gap-2 !text-sm !font-normal !tracking-normal !normal-case !text-slate-800">
              <input
                type="checkbox"
                className="!mt-0 !w-auto"
                checked={done.includes(c)}
                onChange={(e) => setDone(e.target.checked ? [...done, c] : done.filter((x) => x !== c))}
              />
              {c}
            </label>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        disabled={done.length < checks.length}
        className="w-full rounded bg-accent py-2.5 font-semibold text-white hover:bg-accent-dark disabled:opacity-40"
      >
        Open counter and start selling
      </button>
      <p className="text-xs text-slate-500">
        Something not working? Don&apos;t sell yet. Report it to the Ticketing and Boarding Supervisor.
      </p>
    </form>
  );
}
