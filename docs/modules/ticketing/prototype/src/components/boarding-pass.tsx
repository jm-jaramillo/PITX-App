"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { dateTimeManila, peso } from "@/lib/format";
import type { Db, Ticket } from "@/lib/types";

export function BoardingPass({ db, ticket, className = "" }: { db: Db; ticket: Ticket; className?: string }) {
  const [qr, setQr] = useState("");
  const ticketNo = ticket.ticketNo;

  useEffect(() => {
    // Ticket number only, no passenger details in the code.
    QRCode.toDataURL(ticketNo, { width: 220, margin: 1 }).then(setQr);
  }, [ticketNo]);

  const trip = db.trips.find((t) => t.id === ticket.tripId);
  const route = db.routes.find((r) => r.id === trip?.routeId);
  const company = db.companies.find((c) => c.id === route?.companyId);
  const bus = db.buses.find((b) => b.id === trip?.busId);
  const counter = db.counters.find((c) => c.id === ticket.counterId);

  const rows: [string, string | number | undefined][] = [
    ["Operator", company?.name],
    ["Route", route?.description],
    ["Departure", `${trip?.date} ${trip?.time}`],
    ["Bay", trip?.bay || "-"],
    ["Bus", bus?.plateNo ?? "-"],
    ["Seat", ticket.seatNo],
    ["Fare", `${peso(ticket.fare)} (${ticket.fareType})`],
    ["Payment", ticket.paymentMethod],
    ...(ticket.bookingRef ? ([["Booking ref", ticket.bookingRef]] as [string, string][]) : []),
    ["Counter", counter?.code ?? "Online"],
    ["Issued", dateTimeManila(ticket.issuedAt)],
  ];

  return (
    <div className={`mx-auto max-w-sm rounded-lg border border-slate-200 bg-white p-5 ${className}`}>
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/pitx-stacked-on-light.png" alt="PITX" className="mx-auto w-36" />
        <div className="mt-3 border-y border-accent py-1 text-xs font-semibold tracking-widest text-accent">
          BOARDING PASS
        </div>
        <CompanyLogo company={company} className="mx-auto mt-3 h-8 max-w-[14rem]" />
        <div className="mt-2 text-lg font-semibold">{ticket.passengerName}</div>
        {ticket.status === "Voided" && <div className="mt-1 font-bold text-red-700">VOIDED</div>}
        {Boolean(ticket.reprints?.length) && ticket.status !== "Voided" && (
          <div className="mt-1 text-sm font-bold text-accent">REPRINT {ticket.reprints?.length}</div>
        )}
        {ticket.status === "Booked" && (
          <div className="mt-1 text-sm font-semibold text-amber-800">ONLINE BOOKING · PASS NOT YET ISSUED</div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr && <img src={qr} alt={`QR code for ticket ${ticket.ticketNo}`} className="mx-auto my-3" width={220} height={220} />}
        <div className="font-mono text-sm">{ticket.ticketNo}</div>
      </div>
      <dl className="mt-4 space-y-1 border-t border-dashed border-slate-300 pt-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {route?.message && (
        <p className="mt-3 border-t border-dashed border-slate-300 pt-3 text-center text-xs">{route.message}</p>
      )}
    </div>
  );
}
