"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { NAV } from "@/lib/roles";

/** The demo-data notice from the shell, shown under each page title. */
export const DemoNotice = createContext<string>("");

/**
 * A page's title block, built like Trip Scheduling and TOS pages after
 * tidyPageHead() (docs/shared/platform.js): .page-head with the (hidden) eyebrow,
 * the h1 with a "?" that shows or hides the one-line description, then the
 * demo-data notice.
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
          </h1>
          {sub && <p className={`subtle page-help${help ? "" : " hidden"}`}>{sub}</p>}
        </div>
      </div>
      {notice && <p className="hint no-print">{notice}</p>}
    </div>
  );
}
