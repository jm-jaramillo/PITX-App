"use client";

import { useState } from "react";
import { GateTest } from "@/components/gate-test";
import { PageTitle } from "@/components/page-title";
import { QueueCount } from "@/components/queue-count";

// Boarding tools for PITX staff, one page with two tabs (entry 31):
//   Queue Count  people in line at the booths and gates, for the Passenger Demand Report
//   Gate Test    stands in for the automated gate until the hardware is connected
const TABS = [
  { id: "queue", label: "Queue Count" },
  { id: "gate", label: "Gate Test" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function BoardingPage() {
  // #gate opens the Gate Test tab (old /validate links land there).
  const [tab, setTab] = useState<Tab>(() => (typeof window !== "undefined" && window.location.hash === "#gate" ? "gate" : "queue"));

  function pick(next: Tab) {
    setTab(next);
    window.history.replaceState(null, "", next === "gate" ? "#gate" : window.location.pathname);
  }

  return (
    <div className="space-y-4">
      <PageTitle sub="Count the lines at the booths and gates, and test boarding passes the way the automated gate will.">Boarding</PageTitle>
      <div role="tablist" className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm font-semibold sm:w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => pick(t.id)}
            className={`flex-1 rounded-md px-4 py-2 sm:flex-none ${tab === t.id ? "bg-white text-brand shadow-sm" : "text-slate-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "queue" ? <QueueCount /> : <GateTest />}
    </div>
  );
}
