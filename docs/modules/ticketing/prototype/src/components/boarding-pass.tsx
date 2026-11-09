"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { dateTimeManila, peso } from "@/lib/format";
import { asset } from "@/lib/paths";
import { computeFare } from "@/lib/store";
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

  // BIR invoice part (RR 7-2024: the invoice replaces the official receipt). Land
  // transport of passengers pays percentage tax, not VAT, so the sale is VAT-exempt.
  // Finance to confirm the wording and the accreditation numbers.
  const regular = route ? computeFare(route, "Adult", ticket.counterId) : ticket.fare;
  const discount = Math.max(0, regular - ticket.fare);
  const total = ticket.fare + (ticket.insurance ?? 0);
  const invoice: [string, string][] = [
    ["Regular fare", peso(regular)],
    ...(discount > 0 ? ([[`Less ${ticket.fareType} discount`, `-${peso(discount)}`]] as [string, string][]) : []),
    ...(ticket.insurance ? ([["Insurance", peso(ticket.insurance)]] as [string, string][]) : []),
    ["Total amount due", peso(total)],
    ["VAT-exempt sale", peso(ticket.fare)],
    ["VAT", peso(0)],
  ];
  const reprints = ticket.reprints ?? [];
  const lastReprint = reprints.at(-1);

  return (
    <div className={`mx-auto max-w-sm rounded-lg border border-slate-200 bg-white p-5 ${className}`}>
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset("/brand/pitx-stacked-on-light.png")} alt="PITX" className="mx-auto w-36" />
        <div className="mt-3 border-y border-accent py-1 text-xs font-semibold tracking-widest text-accent">
          BOARDING PASS
        </div>
        <CompanyLogo company={company} className="mx-auto mt-3 h-8 max-w-[14rem]" />
        <div className="mt-2 text-lg font-semibold">{ticket.passengerName}</div>
        {ticket.status === "Voided" && <div className="mt-1 font-bold text-red-700">VOIDED</div>}
        {lastReprint && ticket.status !== "Voided" && (
          <div className="mt-2 rounded border-2 border-dashed border-red-600 px-2 py-1 text-red-700">
            <div className="text-base font-extrabold tracking-widest">REPRINT · COPY {reprints.length + 1}</div>
            <div className="text-xs">
              Not the original. Reprinted {dateTimeManila(lastReprint.at)} by {lastReprint.by} ({lastReprint.category})
            </div>
          </div>
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
      <div className="mt-3 border-t border-dashed border-slate-300 pt-3 text-xs">
        <div className="text-center font-bold tracking-widest">INVOICE</div>
        <div className="mt-1 text-center">
          {company?.name}
          <br />
          {company?.address}
          <br />
          VAT-exempt TIN {company?.tin || "-"}
        </div>
        <dl className="mt-2 space-y-0.5">
          {[
            ["Invoice no.", ticket.ticketNo],
            ["MIN", company?.minNo || "Not set"],
            ["Serial no.", company?.serialNo || "Not set"],
            ["PTU no.", company?.ptuNo || "Not set"],
            ...invoice,
          ].map(([label, value]) => (
            <div key={label} className={`flex justify-between gap-4 ${label === "Total amount due" ? "font-bold" : ""}`}>
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right">{value}</dd>
            </div>
          ))}
        </dl>
        {ticket.fareType !== "Adult" && (
          <p className="mt-1">
            {ticket.fareType} ID {ticket.idNo ? "on file" : "-"} · Name and signature: ____________
          </p>
        )}
        <p className="mt-2 text-center font-semibold">THIS DOCUMENT SERVES AS YOUR INVOICE</p>
      </div>
      {route?.message && (
        <p className="mt-3 border-t border-dashed border-slate-300 pt-3 text-center text-xs">{route.message}</p>
      )}
    </div>
  );
}
