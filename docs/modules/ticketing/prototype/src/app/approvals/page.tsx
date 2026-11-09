"use client";

import Link from "next/link";
import { useState } from "react";
import { dateTimeManila, peso } from "@/lib/format";
import { ticketHref } from "@/lib/paths";
import { decideRequest, generateCloseCode, refundAmountFor, useDb } from "@/lib/store";
import { PageTitle } from "@/components/page-title";

export default function ApprovalsPage() {
  const db = useDb();
  const [error, setError] = useState<string | null>(null);

  const pending = db.requests.filter((r) => r.status === "Pending");
  const decided = db.requests.filter((r) => r.status !== "Pending").slice().reverse().slice(0, 20);
  const openCodes = db.closeCodes.filter((c) => !c.used);

  return (
    <div className="space-y-6">
      <PageTitle>Approvals</PageTitle>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">Waiting for you · {pending.length}</h2>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="text-left text-xs">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Requested by</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => {
                const ticket = db.tickets.find((t) => t.id === r.ticketId);
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{r.type}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link className="text-brand underline" href={ticketHref(r.ticketId)}>
                        {ticket?.ticketNo}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {r.category}
                      {r.remark ? `: ${r.remark}` : ""}
                    </td>
                    <td className="px-3 py-2">
                      {ticket && (r.type === "Refund" ? peso(refundAmountFor(db, ticket)) : `${peso(db.settings.reprintCharge)} charge`)}
                    </td>
                    <td className="px-3 py-2">
                      {r.requestedBy}
                      <div className="text-xs text-slate-500">{dateTimeManila(r.requestedAt)}</div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white"
                        onClick={() => setError(decideRequest(r.id, true))}
                      >
                        Approve
                      </button>{" "}
                      <button
                        className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-700"
                        onClick={() => setError(decideRequest(r.id, false))}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                );
              })}
              {pending.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    Nothing waiting.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Close Sales approval codes</h2>
        <p className="text-sm text-slate-600">Give a Teller one of these when they&apos;re ready to close. Each code works once.</p>
        <button className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white" onClick={() => generateCloseCode()}>
          Generate code
        </button>
        {openCodes.length > 0 && (
          <ul className="flex flex-wrap gap-2 pt-1">
            {openCodes.map((c) => (
              <li key={c.code} className="rounded bg-brand-tint px-3 py-1 font-mono font-semibold text-brand">
                {c.code}
              </li>
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-600">Recently decided</h2>
          <ul className="space-y-1 text-xs text-slate-600">
            {decided.map((r) => (
              <li key={r.id}>
                {r.status} · {r.type} · {db.tickets.find((t) => t.id === r.ticketId)?.ticketNo} · requested by {r.requestedBy} ·
                decided by {r.decidedBy}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
