"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { saveSettings, useDb } from "@/lib/store";
import type { ApprovalMode, SystemParams } from "@/lib/types";
import { PageTitle } from "@/components/page-title";

const MODES: { value: ApprovalMode; label: string }[] = [
  { value: "None", label: "No approval needed" },
  { value: "Admin", label: "Super Admin approves" },
  { value: "Password", label: "Approval password" },
];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-slate-200 bg-white p-4">
      <legend className="px-1 text-sm font-semibold text-brand">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export default function SystemParametersPage() {
  const db = useDb();
  const [form, setForm] = useState<SystemParams>(db.settings);
  const [refundReasons, setRefundReasons] = useState(db.settings.refundReasons.join(", "));
  const [reprintReasons, setReprintReasons] = useState(db.settings.reprintReasons.join(", "));
  const [saved, setSaved] = useState(false);

  function set<K extends keyof SystemParams>(key: K, value: SystemParams[K]) {
    setForm({ ...form, [key]: value });
    setSaved(false);
  }

  const number = (key: keyof SystemParams, label: string, max?: number) => (
    <label key={key}>
      {label}
      <input
        type="number"
        min={0}
        max={max}
        step="any"
        required
        value={String(form[key])}
        onChange={(e) => set(key, Number(e.target.value) as never)}
      />
    </label>
  );

  const toList = (text: string) => text.split(",").map((r) => r.trim()).filter(Boolean);

  function submit(event: FormEvent) {
    event.preventDefault();
    saveSettings({ ...form, refundReasons: toList(refundReasons), reprintReasons: toList(reprintReasons) });
    setSaved(true);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PageTitle>System Parameters</PageTitle>

      <Group title="Selling">
        <label>
          Default counter at sign-in
          <select value={form.defaultCounterId} onChange={(e) => set("defaultCounterId", e.target.value)}>
            {db.counters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.description}
              </option>
            ))}
          </select>
        </label>
        {number("insurancePrice", "Insurance price per ticket (PHP)")}
        {number("counterCutoffMinutes", "Stop showing trips at counters (minutes before departure)")}
        {number("kioskCutoffMinutes", "Stop showing trips at kiosks (minutes before departure)")}
      </Group>

      <Group title="Check-in at the gate">
        {number("checkInBeforeMinutes", "Opens (minutes before departure)")}
        {number("checkInAfterMinutes", "Closes (minutes after departure)")}
      </Group>

      <Group title="Seat transfer">
        <label className="sm:col-span-2">
          <input
            type="checkbox"
            checked={form.seatTransferCheckRoute}
            onChange={(e) => set("seatTransferCheckRoute", e.target.checked)}
          />
          Only allow transfers to a trip on the same route
        </label>
      </Group>

      <Group title="Refunds">
        {number("refundPercent", "Refund percentage", 100)}
        {number("refundCutoffHours", "Teller cutoff (hours before departure). Closer needs the Super Admin")}
        <label>
          Approval before the cutoff
          <select value={form.refundApproval} onChange={(e) => set("refundApproval", e.target.value as ApprovalMode)}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reason categories, separated by commas
          <input value={refundReasons} onChange={(e) => setRefundReasons(e.target.value)} />
        </label>
      </Group>

      <Group title="Reprints">
        <label className="self-end pb-2">
          <input type="checkbox" checked={form.reprintAllowed} onChange={(e) => set("reprintAllowed", e.target.checked)} />
          Allow ticket reprints
        </label>
        {number("reprintCharge", "Reprint charge (PHP)")}
        <label>
          Approval
          <select value={form.reprintApproval} onChange={(e) => set("reprintApproval", e.target.value as ApprovalMode)}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reason categories, separated by commas
          <input value={reprintReasons} onChange={(e) => setReprintReasons(e.target.value)} />
        </label>
      </Group>

      <Group title="Approval password">
        <label>
          Shared password (demo only)
          <input required autoComplete="off" value={form.approvalPassword} onChange={(e) => set("approvalPassword", e.target.value)} />
        </label>
      </Group>

      <div className="flex items-center gap-3">
        <button className="rounded bg-accent px-5 py-2.5 font-semibold text-white hover:bg-accent-dark">Save parameters</button>
        {saved && (
          <span role="status" className="text-sm font-medium text-green-800">
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
