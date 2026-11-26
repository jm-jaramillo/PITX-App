"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { NAV } from "@/lib/roles";

/** The demo-data notice from the shell, shown under each page title. */
export const DemoNotice = createContext<string>("");

/**
 * A page's title block, built like Trip Scheduling and TOS pages after
 * tidyPageHead() (docs/shared/platform.js): .page-head with the (hidden) eyebrow,
 * the h1 with a "?" that shows or hides the one-line description, and a small
 * "Demo data" tag whose details show on hover.
 */
export function PageTitle({ children, sub, className = "" }: { children: ReactNode; sub?: ReactNode; className?: string }) {
  const pathname = usePathname();
  const notice = useContext(DemoNotice);
  const [help, setHelp] = useState(false);
  const path = pathname.replace(/\/$/, "") || "/";
  const section = NAV.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)))?.label;
  return (
    <div className={className}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Ticketing &amp; Boarding{section ? ` · ${section}` : ""}</p>
          <h1>
            {children}
            {sub && (
              <>
                {" "}
                <button type="button" className="help-dot" aria-label="About this page" onClick={() => setHelp((h) => !h)}>
                  ?
                </button>
              </>
            )}
            {/* Demo-data note (entry 41): a small tag with the details on hover, not a banner.
                To go when the demo data does. */}
            {notice && (
              <>
                {" "}
                <span
                  className="no-print cursor-help rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 align-middle text-xs font-semibold text-amber-800"
                  title={notice}
                  tabIndex={0}
                  aria-label={`Demo data: ${notice}`}
                >
                  Demo data
                </span>
              </>
            )}
          </h1>
          {sub && <p className={`subtle page-help${help ? "" : " hidden"}`}>{sub}</p>}
        </div>
      </div>
    </div>
  );
}
