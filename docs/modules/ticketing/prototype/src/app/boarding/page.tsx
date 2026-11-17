"use client";

import { Moved } from "@/components/moved";

// Boarding was removed; the manifest shows boarded and not boarded (entry 35).
export default function BoardingPage() {
  return <Moved from="/boarding" />;
}
