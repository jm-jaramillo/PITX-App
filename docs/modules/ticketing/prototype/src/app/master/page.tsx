"use client";

import { useState } from "react";
import { CounterFares } from "@/components/counter-fares";
import { CrudTable, type Field } from "@/components/crud-table";
import { SEAT_LAYOUTS } from "@/lib/seat-layouts";
import { saveRecord, useDb } from "@/lib/store";
import { CHARTER_TYPES } from "@/lib/types";

type Tab = "companies" | "routes" | "busTypes" | "buses" | "counters" | "provinces" | "towns";

const TABS: { key: Tab | "counterFares"; label: string }[] = [
  { key: "companies", label: "Company Info" },
  { key: "routes", label: "Route Info" },
  { key: "counterFares", label: "Counter Fares" },
  { key: "busTypes", label: "Bus Type Info" },
  { key: "buses", label: "Bus Info" },
  { key: "counters", label: "Counter Info" },
  { key: "provinces", label: "System Province" },
  { key: "towns", label: "System Town" },
];

export default function MasterDataPage() {
  const db = useDb();
  const [tab, setTab] = useState<Tab | "counterFares">("companies");

  const companyOptions = db.companies.map((c) => ({ value: c.id, label: c.code }));
  const provinceOptions = db.provinces.map((p) => ({ value: p.id, label: p.description }));
  const townOptions = db.towns.map((t) => ({ value: t.id, label: t.description }));
  const busTypeOptions = db.busTypes.map((t) => ({ value: t.id, label: t.code }));

  const fields: Record<Tab, Field[]> = {
    companies: [
      { key: "code", label: "Company Code", required: true, column: true },
      { key: "name", label: "Company Name", required: true, column: true },
      { key: "description", label: "Description" },
      { key: "registrationNo", label: "Company Registration No.", column: true },
      { key: "ptuNo", label: "PTU No." },
      { key: "tin", label: "REG TIN" },
      { key: "serialNo", label: "Serial No." },
      { key: "minNo", label: "MIN No." },
      { key: "ticketCode", label: "Ticket Code", required: true, column: true },
      { key: "advanceDays", label: "Advance Ticket Selling (days)", type: "number", column: true },
      { key: "address", label: "Address" },
      { key: "contactPerson", label: "Contact Person" },
      { key: "mobileNo", label: "Mobile No" },
    ],
    routes: [
      { key: "companyId", label: "Company", type: "select", options: companyOptions, required: true, column: true },
      { key: "operatorRouteId", label: "Operator Route ID", required: true, column: true },
      { key: "code", label: "Route", required: true, column: true },
      { key: "description", label: "Description", required: true, column: true },
      { key: "denomination", label: "Denomination", column: true },
      { key: "authorizedAgent", label: "Authorized Agent" },
      { key: "seatConfirm", label: "Seat Confirm", type: "checkbox" },
      { key: "provinceId", label: "Province", type: "select", options: provinceOptions, column: true },
      { key: "townId", label: "Destination Town", type: "select", options: townOptions, column: true },
      { key: "mileage", label: "Mileage (km)", type: "number", column: true },
      { key: "price", label: "Adult Fare (PHP)", type: "number", required: true, column: true },
      { key: "studentFare", label: "Student Fare (blank = 20% off)", type: "number" },
      { key: "seniorFare", label: "Senior Fare (blank = 20% off)", type: "number" },
      { key: "pwdFare", label: "PWD Fare (blank = 20% off)", type: "number" },
      { key: "message", label: "Msg to Cust (printed on pass)" },
    ],
    busTypes: [
      { key: "companyId", label: "Company", type: "select", options: companyOptions, required: true, column: true },
      { key: "code", label: "Bus Type", required: true, column: true },
      { key: "description", label: "Description", required: true, column: true },
      {
        key: "layoutId",
        label: "Seat Arrangement",
        type: "select",
        options: SEAT_LAYOUTS.map((l) => ({ value: l.id, label: l.label })),
        required: true,
        column: true,
      },
      { key: "blockedSeats", label: "Blocked Seats, e.g. CR (44, 45)", column: true },
      { key: "remark", label: "Remark" },
    ],
    buses: [
      { key: "companyId", label: "Company", type: "select", options: companyOptions, required: true, column: true },
      { key: "plateNo", label: "Bus Plate No", required: true, column: true },
      { key: "description", label: "Description", column: true },
      { key: "busTypeId", label: "Bus Type", type: "select", options: busTypeOptions, required: true, column: true },
      { key: "aircon", label: "Air Conditioner", type: "checkbox", column: true },
      {
        key: "charter",
        label: "Chartered",
        type: "select",
        options: CHARTER_TYPES.map((c) => ({ value: c, label: c })),
        column: true,
        filter: true,
      },
    ],
    counters: [
      { key: "code", label: "Code", required: true, column: true },
      { key: "description", label: "Description", required: true, column: true },
      { key: "ticketCode", label: "Ticket Code", required: true, column: true },
      { key: "kiosk", label: "KIOSK", type: "checkbox", column: true },
      { key: "townId", label: "Town", type: "select", options: townOptions, required: true, column: true },
      { key: "allowInternet", label: "Allow Internet", type: "checkbox" },
      { key: "counterDisplay", label: "Counter Display", type: "checkbox" },
      { key: "kioskDisplay", label: "KIOSK Display", type: "checkbox" },
      { key: "remark", label: "Remark" },
    ],
    provinces: [
      { key: "code", label: "Province", required: true, column: true },
      { key: "description", label: "Description", required: true, column: true },
    ],
    towns: [
      { key: "code", label: "Town", required: true, column: true },
      { key: "description", label: "Description", required: true, column: true },
      { key: "provinceId", label: "Province", type: "select", options: provinceOptions, required: true, column: true },
    ],
  };

  const current = TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm ${tab === t.key ? "border-b-2 border-brand font-semibold text-brand" : "text-slate-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "counterFares" ? (
        <CounterFares />
      ) : (
        <CrudTable
          key={tab}
          title={current.label}
          fields={fields[tab]}
          rows={db[tab] as unknown as ({ id: string; status: string } & Record<string, unknown>)[]}
          onSave={(record) => saveRecord(tab, record)}
        />
      )}
    </div>
  );
}
