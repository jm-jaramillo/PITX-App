"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BoardingPass } from "@/components/boarding-pass";
import { peso } from "@/lib/format";
import { ticketHref } from "@/lib/paths";
import { markPrinted, scopedTickets, useDb } from "@/lib/store";

export default function GroupPassesPage() {
  return (
    <Suspense>
      <GroupPasses />
    </Suspense>
  );
}

function GroupPasses() {
  const db = useDb();
  const id = useSearchParams().get("id") ?? "";
  const tickets = scopedTickets(db)
    .filter((t) => t.groupId === id)
    .sort((a, b) => a.seatNo - b.seatNo);

  if (tickets.length === 0) return <p className="text-sm text-slate-500">Sale not found.</p>;

  const first = tickets[0];
  const total = tickets.reduce((sum, t) => sum + t.fare + (t.insurance ?? 0), 0);
  const unprinted = tickets.filter((t) => !t.printed);

  return (
    <div className="space-y-4">
      <div className="no-print mx-auto max-w-sm space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h1 className="font-semibold">
          {tickets.length} ticket{tickets.length > 1 ? "s" : ""} sold
        </h1>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt>Total ({first.paymentMethod})</dt>
            <dd className="font-semibold">{peso(total)}</dd>
          </div>
          {first.tendered !== undefined && (
            <>
              <div className="flex justify-between">
                <dt>Cash received</dt>
                <dd>{peso(first.tendered)}</dd>
              </div>
              <div className="flex justify-between font-semibold text-green-800">
                <dt>Change</dt>
                <dd>{peso(first.tendered - total)}</dd>
              </div>
            </>
          )}
        </dl>
        <div className="flex flex-wrap gap-2">
          {unprinted.length > 0 ? (
            <button
              className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white"
              onClick={() => {
                window.print();
                markPrinted(unprinted.map((t) => t.id));
              }}
            >
              Print all passes
            </button>
          ) : (
            <span className="self-center text-xs text-slate-600">Printed. Use Reprint on a pass for another copy.</span>
          )}
          <Link className="rounded border border-slate-300 px-4 py-2 text-sm" href={`/pos?trip=${first.tripId}`}>
            Next sale, same trip
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 print:block">
        {tickets.map((ticket) => (
          <div key={ticket.id} className="print:break-after-page">
            <BoardingPass db={db} ticket={ticket} />
            <p className="no-print mt-2 text-center text-sm">
              <Link className="text-brand underline" href={ticketHref(ticket.id)}>
                Change seat, reprint or refund
              </Link>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
