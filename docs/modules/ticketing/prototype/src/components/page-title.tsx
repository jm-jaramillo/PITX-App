"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NAV } from "@/lib/roles";

/**
 * A page's title block, as on Trip Scheduling and TOS: a small grey eyebrow
 * ("Ticketing & Booking · <page>"), the h1, and an optional one-line description.
 */
export function PageTitle({ children, sub, className = "" }: { children: ReactNode; sub?: ReactNode; className?: string }) {
  const pathname = usePathname();
  const path = pathname.replace(/\/$/, "") || "/";
  const section = NAV.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)))?.label;
  return (
    <div className={className}>
      <p className="eyebrow">Ticketing &amp; Booking{section ? ` · ${section}` : ""}</p>
      <h1>{children}</h1>
      {sub && <p className="subtle">{sub}</p>}
    </div>
  );
}
