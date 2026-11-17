"use client";

import { Moved } from "@/components/moved";

// Boarding was removed (entry 35); the manifest shows who boarded.
export default function GateTestPage() {
  return <Moved from="/validate" />;
}
