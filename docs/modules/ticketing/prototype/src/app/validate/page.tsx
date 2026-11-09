"use client";

import { useRef, useState, type FormEvent } from "react";
import { todayManila } from "@/lib/format";
import { useDb, validateTicket, type ValidationResult } from "@/lib/store";
import { PageTitle } from "@/components/page-title";

export default function GateTestPage() {
  const db = useDb();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trip = db.trips.find((t) => t.id === result?.ticket?.tripId);
  const route = db.routes.find((r) => r.id === trip?.routeId);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    setResult(validateTicket(code, todayManila()));
    setCode("");
    inputRef.current?.focus();
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <PageTitle>Automated Gate Test</PageTitle>
        <p className="subtle">
          Boarding passes are validated by the automated gate, not by staff. This screen stands in for the gate until the
          hardware is connected, using the same rules the gate will follow.
        </p>
      </div>
      <form onSubmit={submit} className="flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex-1">
          Code read by the gate
          <input ref={inputRef} autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <button className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white">Test scan</button>
      </form>

      {result && (
        <div
          role="status"
          className={`rounded-lg border p-5 ${result.ok ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"}`}
        >
          <div className="text-lg font-semibold">{result.ok ? "GATE OPENS" : "GATE STAYS CLOSED"}</div>
          <p className="mt-1 text-sm">{result.message}</p>
          {result.ticket && (
            <p className="mt-3 text-sm">
              {result.ticket.passengerName} · {result.ticket.ticketNo}
              <br />
              {route?.description} · {trip?.date} {trip?.time}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
