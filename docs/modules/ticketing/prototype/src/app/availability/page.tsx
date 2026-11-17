"use client";

import { AvailabilityBoard } from "@/components/availability-board";
import { PageTitle } from "@/components/page-title";
import { useDb } from "@/lib/store";

// Ticket Availability: the PIDS board by route group and booth (entries 33 and 34). The trip
// list moved to Reports, Daily trips (entry 35).
export default function AvailabilityPage() {
  const db = useDb();
  return (
    <div className="space-y-4">
      <PageTitle sub="The booth screens (PIDS): seats left on today's trips, one route group at a time. Pick a booth to show only the bus companies selling there.">
        Ticket Availability
      </PageTitle>
      <AvailabilityBoard db={db} />
    </div>
  );
}
