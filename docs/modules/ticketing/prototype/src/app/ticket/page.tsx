"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { BoardingPass } from "@/components/boarding-pass";
import { SeatMap } from "@/components/seat-map";
import { dateTimeManila, peso } from "@/lib/format";
import { canAccess } from "@/lib/roles";
import {
  markPrinted,
  moveTicket,
  pendingRequest,
  refundAmountFor,
  refundPlan,
  refundTicket,
  reprintPlan,
  reprintTicket,
  scopedTickets,
  takenSeats,
  transferOptions,
  tripSeating,
  useDb,
} from "@/lib/store";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/types";

type Panel = "none" | "move" | "refund" | "reprint";

export default function BoardingPassPage() {
  return (
    <Suspense>
      <TicketDetail />
    </Suspense>
  );
}

function TicketDetail() {
  const db = useDb();
  const id = useSearchParams().get("id") ?? "";
  const [panel, setPanel] = useState<Panel>("none");
  const [moveTripId, setMoveTripId] = useState("");
  const [moveSeat, setMoveSeat] = useState(0);
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("");
  const [password, setPassword] = useState("");
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("Cash");
  const [refundRef, setRefundRef] = useState("");
  const [passengerName, setPassengerName] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const ticket = scopedTickets(db).find((t) => t.id === id);

  if (!ticket) return <p className="text-sm text-slate-500">Ticket not found.</p>;

  const siblings = ticket.groupId ? db.tickets.filter((t) => t.groupId === ticket.groupId) : [ticket];
  const total = siblings.reduce((sum, t) => sum + t.fare + (t.insurance ?? 0), 0);
  const role = db.session?.role;
  const canManage = role ? canAccess(role, "/tickets") : false;
  const canSell = role ? canAccess(role, "/pos") : false;
  const canMove = canManage && ticket.status === "Reserved";
  const canPrint = canManage || role === "Passenger";
  // eslint-disable-next-line react-hooks/purity -- the refund cutoff depends on the current time
  const refund = refundPlan(db, ticket, Date.now());
  const reprint = reprintPlan(db, ticket);
  const refundPending = pendingRequest(db, ticket.id, "Refund");
  const reprintPending = pendingRequest(db, ticket.id, "Reprint");
  const options = transferOptions(db, ticket);
  // A cancelled current trip isn't an option, so fall back to the next open trip.
  const target = options.find((t) => t.id === (moveTripId || ticket.tripId)) ?? options[0];
  const seating = target ? tripSeating(db, target) : null;
  const taken = target ? takenSeats(db, target.id) : new Set<number>();
  const log = db.audit.filter((a) => a.ticketId === ticket.id).slice().reverse();

  function open(next: Panel) {
    setPanel(panel === next ? "none" : next);
    setMoveTripId("");
    setMoveSeat(0);
    setReason("");
    setCategory("");
    setPassword("");
    setRefundMethod(ticket?.paymentMethod ?? "Cash");
    setRefundRef("");
    setPassengerName(ticket?.passengerName ?? "");
    setContactNo(ticket?.contactNo ?? "");
    setError(null);
    setNotice(null);
  }

  function finish(problem: string | null) {
    setError(problem);
    if (!problem) setPanel("none");
  }

  function printFirstCopy() {
    window.print();
    markPrinted([ticket!.id]);
  }

  function submitRefund(event: FormEvent) {
    event.preventDefault();
    const result = refundTicket(ticket!.id, { category, remark: reason, method: refundMethod, ref: refundRef, password });
    finish(result.error ?? null);
    if (result.pending) setNotice("Refund request sent to the PITX Admin for approval.");
  }

  function submitReprint(event: FormEvent) {
    event.preventDefault();
    const result = reprintTicket(ticket!.id, { category, remark: reason, passengerName, contactNo, password });
    finish(result.error ?? null);
    if (result.pending) setNotice("Reprint request sent to the PITX Admin for approval.");
    else if (!result.error) {
      setNotice(`Reprint recorded. Collect ${peso(db.settings.reprintCharge)} from the passenger.`);
      window.print();
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BoardingPass db={db} ticket={ticket} />

      {canSell && ticket.tendered !== undefined && (
        <p className="no-print text-center text-sm text-slate-600">
          {siblings.length > 1 ? `Group sale of ${siblings.length}, total ${peso(total)}. ` : ""}
          Cash received {peso(ticket.tendered)}, change {peso(ticket.tendered - total)}
        </p>
      )}

      <div className="no-print flex flex-wrap justify-center gap-2">
        {ticket.status !== "Voided" && !ticket.printed && canPrint && (
          <button className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={printFirstCopy}>
            Print
          </button>
        )}
        {canSell && (
          <Link className="rounded border border-slate-300 px-4 py-2 text-sm" href={`/pos?trip=${ticket.tripId}`}>
            Next sale, same trip
          </Link>
        )}
        {canMove && (
          <button className="rounded border border-slate-300 px-4 py-2 text-sm" onClick={() => open("move")}>
            Change seat or trip
          </button>
        )}
        {canManage && ticket.printed && !reprint.block && !reprintPending && (
          <button className="rounded border border-slate-300 px-4 py-2 text-sm" onClick={() => open("reprint")}>
            Reprint
          </button>
        )}
        {canManage && !refund.block && !refundPending && (
          <button className="rounded border border-red-300 px-4 py-2 text-sm text-red-700" onClick={() => open("refund")}>
            Refund
          </button>
        )}
      </div>

      {notice && (
        <p role="status" className="no-print text-center text-sm font-medium text-green-800">
          {notice}
        </p>
      )}
      {(refundPending || reprintPending) && (
        <p className="no-print text-center text-sm text-amber-800">
          {refundPending ? "Refund" : "Reprint"} request is waiting for the PITX Admin.
        </p>
      )}
      {error && panel === "none" && (
        <p role="alert" className="no-print text-center text-sm text-red-700">
          {error}
        </p>
      )}

      {panel === "move" && (
        <form
          className="no-print space-y-3 rounded-lg border border-slate-200 bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            finish(moveTicket(ticket.id, target?.id ?? "", moveSeat, reason));
          }}
        >
          <h2 className="text-sm font-semibold">Change seat or transfer to another trip</h2>
          <label>
            Trip
            <select
              value={target?.id ?? ""}
              onChange={(e) => {
                setMoveTripId(e.target.value);
                setMoveSeat(0);
              }}
            >
              {options.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.date} {t.time} · {db.routes.find((r) => r.id === t.routeId)?.description} · {t.tripNo}
                  {t.id === ticket.tripId ? " (current)" : ""}
                </option>
              ))}
            </select>
          </label>
          {target && seating?.layout ? (
            <SeatMap
              layout={seating.layout}
              taken={taken}
              blocked={seating.blocked}
              selected={[moveSeat]}
              onSelect={setMoveSeat}
            />
          ) : (
            <p className="text-sm text-slate-500">No unit set on this trip yet, so seats aren&apos;t available.</p>
          )}
          <label>
            Reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white">Save change</button>
        </form>
      )}

      {panel === "refund" && (
        <form onSubmit={submitRefund} className="no-print space-y-3 rounded-lg border border-red-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Refund this ticket and release the seat</h2>
          <p className="text-sm">
            Refund: <span className="font-semibold">{peso(refundAmountFor(db, ticket))}</span> ({db.settings.refundPercent}% of{" "}
            {peso(ticket.fare)})
          </p>
          {refund.note && <p className="text-sm text-amber-800">{refund.note}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              Reason
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Select one</option>
                {db.settings.refundReasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              Remark
              <input value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <label>
              Refund method
              <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            {refundMethod !== "Cash" && (
              <label>
                Refund reference no.
                <input value={refundRef} onChange={(e) => setRefundRef(e.target.value)} />
              </label>
            )}
            {refund.step === "password" && (
              <label>
                Approval password
                <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark">
            {refund.step === "request" ? "Send for approval" : "Confirm refund"}
          </button>
        </form>
      )}

      {panel === "reprint" && (
        <form onSubmit={submitReprint} className="no-print space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Reprint this ticket</h2>
          <p className="text-sm">
            Charge: <span className="font-semibold">{peso(db.settings.reprintCharge)}</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              Reason
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Select one</option>
                {db.settings.reprintReasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              Remark
              <input value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <label>
              Passenger name
              <input value={passengerName} onChange={(e) => setPassengerName(e.target.value)} />
            </label>
            <label>
              Contact no.
              <input value={contactNo} onChange={(e) => setContactNo(e.target.value)} />
            </label>
            {reprint.step === "password" && (
              <label>
                Approval password
                <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white">
            {reprint.step === "request" ? "Send for approval" : "Record and reprint"}
          </button>
        </form>
      )}

      {canManage && (ticket.contactNo || ticket.email || ticket.status === "Voided" || ticket.reprints?.length) && (
        <div className="no-print space-y-1 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          {(ticket.contactNo || ticket.email) && (
            <p>
              <span className="font-semibold">Passenger contact: </span>
              {[ticket.contactNo, ticket.email].filter(Boolean).join(" · ")}
            </p>
          )}
          {ticket.status === "Voided" && (
            <p>
              <span className="font-semibold">Refunded: </span>
              {ticket.voidReason}
              {ticket.voidedBy ? ` (by ${ticket.voidedBy})` : ""}. Refund {peso(ticket.refundAmount ?? 0)}
              {ticket.refundAmount ? ` by ${ticket.refundMethod}` : ""}
              {ticket.refundRef ? `, ref ${ticket.refundRef}` : ""}.
            </p>
          )}
          {ticket.reprints?.map((r) => (
            <p key={r.at}>
              <span className="font-semibold">Reprinted: </span>
              {dateTimeManila(r.at)} by {r.by}. {r.category}
              {r.remark ? `: ${r.remark}` : ""}. Charge {peso(r.charge)}.
            </p>
          ))}
        </div>
      )}

      {log.length > 0 && (
        <div className="no-print rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold">Ticket history</h2>
          <ul className="space-y-1 text-xs text-slate-600">
            {log.map((a) => (
              <li key={a.id}>
                {dateTimeManila(a.at)} · {a.by} · <span className="font-medium">{a.action}</span> · {a.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
