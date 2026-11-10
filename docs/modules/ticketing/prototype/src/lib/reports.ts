import type { Db, Ticket } from "./types";

export interface ShiftRemittance {
  key: string;
  teller: string;
  counter: string;
  counterId?: string;
  count: number;
  voided: number;
  refunds: number;
  reprintFees: number;
  Cash: number;
  Card: number;
  "E-Wallet": number;
}

const manilaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" });

export function saleDate(ticket: Ticket): string {
  return manilaDate.format(new Date(ticket.issuedAt));
}

/**
 * Counter sales by teller for a sale date range. A voided ticket only keeps any fare not
 * refunded. Reprint fees are cash, credited to whoever collected them.
 */
export function shiftRemittance(db: Db, from: string, to: string, companyId = ""): ShiftRemittance[] {
  const shifts = new Map<string, ShiftRemittance>();
  const shiftFor = (teller: string, counterId?: string) => {
    const counter = db.counters.find((c) => c.id === counterId)?.code ?? "-";
    const key = `${teller}|${counter}`;
    const shift = shifts.get(key) ?? {
      key,
      teller,
      counter,
      counterId,
      count: 0,
      voided: 0,
      refunds: 0,
      reprintFees: 0,
      Cash: 0,
      Card: 0,
      "E-Wallet": 0,
    };
    shifts.set(key, shift);
    return shift;
  };
  for (const ticket of db.tickets) {
    const trip = db.trips.find((t) => t.id === ticket.tripId);
    if (companyId && db.routes.find((r) => r.id === trip?.routeId)?.companyId !== companyId) continue;
    for (const reprint of ticket.reprints ?? []) {
      const on = manilaDate.format(new Date(reprint.at));
      if (on < from || on > to) continue;
      const shift = shiftFor(reprint.by, reprint.counterId);
      shift.reprintFees += reprint.charge;
      shift.Cash += reprint.charge;
    }
    const sold = saleDate(ticket);
    if (ticket.source !== "Counter" || sold < from || sold > to) continue;
    const shift = shiftFor(ticket.soldBy ?? "Unknown", ticket.counterId);
    const insurance = ticket.insurance ?? 0;
    if (ticket.status === "Voided") {
      const refund = ticket.refundAmount ?? ticket.fare;
      shift.voided++;
      shift.refunds += refund;
      shift[ticket.paymentMethod] += ticket.fare - refund + insurance;
    } else {
      shift.count++;
      shift[ticket.paymentMethod] += ticket.fare + insurance;
    }
  }
  return [...shifts.values()];
}

export interface ExportOptions {
  from: string;
  to: string;
  companyId: string; // Blank means all companies
}

export function reportTickets(db: Db, { from, to, companyId }: ExportOptions): Ticket[] {
  return db.tickets.filter((ticket) => {
    const trip = db.trips.find((t) => t.id === ticket.tripId);
    if (!trip || trip.date < from || trip.date > to) return false;
    return !companyId || db.routes.find((r) => r.id === trip.routeId)?.companyId === companyId;
  });
}

/** Builds and downloads the report. Contact details and discount IDs stay out of the file. */
export async function downloadTicketingReport(db: Db, options: ExportOptions): Promise<number> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const company = db.companies.find((c) => c.id === options.companyId);
  const tickets = reportTickets(db, options);

  const sheet = workbook.addWorksheet("Ticketing Report");
  sheet.addRows([
    ["PITX Ticketing and Boarding Report"],
    ["Reporting Period:", `${options.from} to ${options.to}`],
    ["Operator ID:", company?.code ?? "All"],
    ["Printed by:", db.session?.name ?? ""],
    ["Date/Time Printed:", new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })],
    ["Total Record:", tickets.length],
    [],
  ]);
  sheet.getCell("A1").font = { bold: true, size: 14 };
  const header = sheet.addRow([
    "No", "Trip Date", "Trip Time", "Trip No", "Company", "Denomination", "Plate No", "Ticket No", "Booking Ref",
    "Source", "Seat", "Passenger", "Fare Type", "Fare", "Payment", "Status", "Sold By", "Counter", "Sale Date",
    "Void Reason", "Refund", "Reprints",
  ]);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2A5B" } };
  tickets.forEach((ticket, index) => {
    const trip = db.trips.find((t) => t.id === ticket.tripId);
    const route = db.routes.find((r) => r.id === trip?.routeId);
    sheet.addRow([
      index + 1,
      trip?.date,
      trip?.time,
      trip?.tripNo,
      db.companies.find((c) => c.id === route?.companyId)?.code,
      route?.denomination,
      db.buses.find((b) => b.id === trip?.busId)?.plateNo,
      ticket.ticketNo,
      ticket.bookingRef,
      ticket.source,
      ticket.seatNo,
      ticket.passengerName,
      ticket.fareType,
      ticket.fare,
      ticket.paymentMethod,
      ticket.status,
      ticket.soldBy,
      db.counters.find((c) => c.id === ticket.counterId)?.code,
      saleDate(ticket),
      ticket.voidReason,
      ticket.refundAmount,
      ticket.reprints?.length ?? 0,
    ]);
  });
  sheet.columns.forEach((column) => {
    column.width = 15;
  });

  const remit = workbook.addWorksheet("Shift Remittance");
  const remitHeader = remit.addRow(["Teller", "Counter", "Tickets", "Voided", "Refunds", "Reprint fees", "Cash to remit", "Card", "E-Wallet"]);
  remitHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
  remitHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2A5B" } };
  for (const r of shiftRemittance(db, options.from, options.to, options.companyId)) {
    remit.addRow([r.teller, r.counter, r.count, r.voided, r.refunds, r.reprintFees, r.Cash, r.Card, r["E-Wallet"]]);
  }
  remit.columns.forEach((column) => {
    column.width = 16;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `PITX-Ticketing-Report-${options.from}-to-${options.to}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
  return tickets.length;
}

export interface IssueKpi {
  key: string;
  teller: string;
  counter: string;
  sales: number; // Timed counter transactions (one payment, any number of seats)
  avgSeconds: number;
  withinTarget: number; // Transactions done within the target
}

/**
 * KPI 11 (process map: Ticket / Boarding Pass Issuance): how long each counter sale took,
 * from the first seat picked to payment, by teller and counter. One payment counts once.
 */
export function issueKpi(db: Db, from: string, to: string, target: number, companyId = ""): IssueKpi[] {
  const groups = new Map<string, { teller: string; counter: string; seconds: number }>();
  for (const ticket of db.tickets) {
    if (ticket.source !== "Counter" || ticket.serviceSeconds === undefined) continue;
    const sold = saleDate(ticket);
    if (sold < from || sold > to) continue;
    const trip = db.trips.find((t) => t.id === ticket.tripId);
    if (companyId && db.routes.find((r) => r.id === trip?.routeId)?.companyId !== companyId) continue;
    groups.set(ticket.groupId ?? ticket.id, {
      teller: ticket.soldBy ?? "Unknown",
      counter: db.counters.find((c) => c.id === ticket.counterId)?.code ?? "-",
      seconds: ticket.serviceSeconds,
    });
  }
  const rows = new Map<string, IssueKpi & { total: number }>();
  for (const g of groups.values()) {
    const key = `${g.teller}|${g.counter}`;
    const row = rows.get(key) ?? { key, teller: g.teller, counter: g.counter, sales: 0, avgSeconds: 0, withinTarget: 0, total: 0 };
    row.sales++;
    row.total += g.seconds;
    if (g.seconds <= target) row.withinTarget++;
    rows.set(key, row);
  }
  return [...rows.values()]
    .map(({ total, ...row }) => ({ ...row, avgSeconds: Math.round(total / row.sales) }))
    .sort((a, b) => a.teller.localeCompare(b.teller));
}

/** 95 -> "1m 35s". */
export function minSec(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}
