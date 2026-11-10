"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { DemoNotice } from "@/components/page-title";
import { dateTimeManila } from "@/lib/format";
import { companyIdForOperator, loadLive } from "@/lib/live";
import { asset } from "@/lib/paths";
import { moduleHomeUrl, onPortalSite, portalUrl, portalUser, type PortalUser } from "@/lib/portal";
import { canAccess, homeFor, isCompanyRole, NAV, sells } from "@/lib/roles";
import { getDb, replaceData, resetDemoData, saveRecord, signIn, signOut, useDb, useHydrated } from "@/lib/store";
import { ROLES, type Db, type Role, type Session } from "@/lib/types";
import PITX_ICONS from "@/lib/pitx-icons.json";

// Same sidebar icons as Trip Scheduling and TOS (docs/shared/platform.js ICONS).
type IconName = keyof typeof PITX_ICONS;
const NAV_ICONS: Record<string, IconName> = {
  "/": "overview",
  "/pos": "bus",
  "/tickets": "check",
  "/availability": "calendar",
  "/close": "check",
  "/collection": "chart",
  "/units": "bus",
  "/manifest": "users",
  "/approvals": "check",
  "/validate": "bays",
  "/queue": "users",
  "/trips": "calendar",
  "/reports": "chart",
  "/master": "building",
  "/settings": "building",
};

function Icon({ name }: { name: IconName }) {
  return <span className="icon" dangerouslySetInnerHTML={{ __html: PITX_ICONS[name] }} />;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase() : "?";
}

// Real PITX data: read once per page load, and again on "Refresh from PITX".
type LiveState = "idle" | "loading" | "loaded" | "empty";
let liveState: LiveState = "idle";

async function refreshLive(setState: (state: LiveState) => void) {
  liveState = "loading";
  setState(liveState);
  const result = await loadLive(getDb());
  if (result) replaceData(result.db);
  liveState = result ? "loaded" : "empty";
  setState(liveState);
}

// An operator account on the portal (profiles.role = operator, e.g. genesis-ops) is a bus
// company: Operator Admin (or Teller, to see the counter view), for its own company only.
const isOperator = (user: PortalUser | null) => user?.role === "operator";

const letters = (text: string | undefined) => (text ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * The operator's own company: by operator id (real PITX data), else by name, else by
 * the company's first word inside the account name ("genesis-ops" is GENESIS TRANSPORT).
 */
function operatorCompanyId(db: Db, user: PortalUser): string | undefined {
  const byId = user.operatorId ? companyIdForOperator(user.operatorId) : "";
  const name = letters(user.name);
  const firstWord = (c: Db["companies"][number]) => letters(c.name.split(/\s+/).at(0));
  return (
    db.companies.find((c) => c.id === byId) ??
    db.companies.find((c) => letters(c.name) === name || letters(c.description) === name) ??
    db.companies.find((c) => firstWord(c).length >= 4 && name.includes(firstWord(c)))
  )?.id;
}

/** A session for the portal user in the given demo role, with the first active counter/company. */
function portalSession(db: Db, user: PortalUser, role: Role): Session {
  const operator = isOperator(user);
  const sessionRole: Role = operator && !isCompanyRole(role) ? "Operator Admin" : role;
  const companyId = operator
    ? operatorCompanyId(db, user)
    : isCompanyRole(sessionRole)
      ? db.companies.find((c) => c.status === "Active")?.id
      : undefined;
  const counters = countersFor(db, companyId);
  return {
    name: user.name,
    role: sessionRole,
    counterId: sells(sessionRole)
      ? (counters.find((c) => c.id === db.settings.defaultCounterId) ?? counters[0])?.id
      : undefined,
    companyId,
  };
}

/** Active counters a company's Teller may use: those assigned to it, or open to any company. */
function countersFor(db: Db, companyId?: string) {
  return db.counters.filter(
    (c) => c.status === "Active" && (!c.companyIds?.length || !companyId || c.companyIds.includes(companyId)),
  );
}

/** An operator with no company yet in this data gets one, so it never sees other companies. */
function addOperatorCompany(user: PortalUser) {
  const code = user.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "OPER";
  saveRecord("companies", {
    id: user.operatorId ? companyIdForOperator(user.operatorId) : `op-${code}`,
    code,
    name: user.name,
    registrationNo: "Not set",
    ptuNo: "Not set",
    tin: "Not set",
    ticketCode: code,
    advanceDays: 7,
    address: "Not set",
    contactPerson: "Not set",
    mobileNo: "Not set",
    status: "Active",
  });
}

/** On the site: which demo role to view as. Replaces the demo's own sign-in. */
function ViewAs({ db, session, user }: { db: Db; session: Session; user: PortalUser }) {
  return (
    <label style={{ margin: "8px 0" }}>
      View as
      <select
        value={session.role}
        onChange={(e) => signIn(portalSession(db, user, e.target.value as Role))}
      >
        {ROLES.filter((r) => !isOperator(user) || isCompanyRole(r)).map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
    </label>
  );
}

function SignIn() {
  const db = useDb();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("Teller");
  const needsCounter = sells(role);
  const needsCompany = isCompanyRole(role);
  const companies = db.companies.filter((c) => c.status === "Active");
  const [companyId, setCompanyId] = useState("");
  const counters = countersFor(db, companyId || undefined);
  const [picked, setCounterId] = useState(db.settings.defaultCounterId);
  const counterId = counters.some((c) => c.id === picked) ? picked : (counters[0]?.id ?? "");

  function submit(event: FormEvent) {
    event.preventDefault();
    signIn({
      name: name.trim(),
      role,
      counterId: needsCounter ? counterId : undefined,
      companyId: needsCompany ? companyId : undefined,
    });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col items-center justify-center gap-6 border-b-8 border-accent bg-brand px-8 py-12 text-center lg:border-r-8 lg:border-b-0">
        <img src={asset("/brand/pitx-stacked-on-dark.png")} alt="PITX, Parañaque Integrated Terminal Exchange" className="w-64 max-w-full lg:w-80" />
        <p className="text-lg font-semibold text-white">Centralized Ticketing System</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="rounded bg-brand-tint px-3 py-2 text-xs text-brand">
            Demo sign-in: no password yet, so this doesn&apos;t protect anything.
          </p>
          <label>
            Name
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          {needsCompany && (
            <label>
              Bus company
              <select required value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">Select one</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {needsCounter && (
            <label>
              Counter
              <select required value={counterId} onChange={(e) => setCounterId(e.target.value)}>
                {counters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.description}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="w-full rounded bg-accent py-2.5 font-semibold text-white hover:bg-accent-dark">Sign in</button>
        </form>
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const db = useDb();
  const session = db.session;
  const counter = db.counters.find((c) => c.id === session?.counterId);
  const company = db.companies.find((c) => c.id === session?.companyId);
  const onSite = onPortalSite();
  const user = onSite ? portalUser() : null;

  // On the site, the portal sign-in is the sign-in: signed out there means back to it.
  // Operators stay on their own company, also after the data is swapped for real PITX data.
  const operatorCompany = user && isOperator(user) ? operatorCompanyId(db, user) : undefined;
  const sessionStale =
    !!user &&
    (!session ||
      session.name !== user.name ||
      (isOperator(user) && (!isCompanyRole(session.role) || session.companyId !== operatorCompany)));
  useEffect(() => {
    if (!onSite) return;
    if (!user) {
      location.replace(moduleHomeUrl());
    } else if (isOperator(user) && !operatorCompany) {
      addOperatorCompany(user);
    } else if (sessionStale) {
      // Same person: keep the role they picked. Someone else: start as PITX Admin.
      signIn(portalSession(db, user, session && session.name === user.name ? session.role : "PITX Admin"));
    }
  }, [onSite, user, session, db, operatorCompany, sessionStale]);

  // On the site, read real PITX trips once per page load (live.ts).
  const [live, setLive] = useState<LiveState>(liveState);
  const [navCollapsed, setNavCollapsed] = useState(() => window.innerWidth < 860);
  const signedIn = !!session && !!user;
  useEffect(() => {
    if (!onSite || !signedIn || liveState !== "idle") return;
    refreshLive(setLive);
  }, [onSite, signedIn]);

  if (!session || (onSite && (!user || sessionStale))) {
    return onSite ? <p className="p-6 text-sm text-slate-500">Signing in…</p> : <SignIn />;
  }

  const avatar = initials(session.name);
  // Shown under each page title (PageTitle), where TS pages put their callouts.
  const notice =
    db.source === "pitx"
      ? `Real PITX trips, operators and plates from Trip Scheduling (read ${dateTimeManila(db.loadedAt ?? "")}). Passengers and sales are made up, and fares are placeholders. Sales are saved in this browser only.`
      : live === "empty"
        ? "Sample data: no real trips are open to your account. Sales are saved in this browser only."
        : "Prototype: dummy data saved in this browser only. No real payments yet.";
  return (
    <div className="app-shell">
      <aside className={`sidebar no-print${navCollapsed ? " is-collapsed" : ""}`} id="nav">
        <div className="sidebar-brand">
          <a href={onSite ? portalUrl() : "/"} className="brand-link" aria-label="PITX modules">
            <img src={onSite ? `${portalUrl()}shared/pitx-logo.webp` : asset("/brand/pitx-horizontal-on-dark.png")} alt="PITX" />
          </a>
          <span className="unit">
            Ticketing
            <br />
            &amp;&nbsp;Boarding
          </span>
        </div>
        <nav className="sidebar-links">
          {onSite && (
            <a href={portalUrl()}>
              <Icon name="overview" />
              All modules
            </a>
          )}
          {NAV.filter((item) => item.roles.includes(session.role)).map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
                <Icon name={NAV_ICONS[item.href] ?? "overview"} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="app-content">
        <div className="topbar no-print">
          <button type="button" className="sidebar-toggle" aria-label="Toggle menu" onClick={() => setNavCollapsed((c) => !c)}>
            &#9776;
          </button>
          {company && (
            <div className="flex h-9 items-center rounded bg-white px-2">
              <CompanyLogo company={company} className="max-h-7 max-w-28" />
            </div>
          )}
          <div className="topbar-right">
            <details className="row-menu account-menu">
              <summary className="avatar-btn" aria-label="Account">
                {avatar}
              </summary>
              <div className="row-menu-pop account-pop">
                <p className="account-name">{session.name}</p>
                <p className="account-role">
                  {session.role}
                  {company ? ` · ${company.code}` : ""}
                  {counter ? ` · ${counter.code}` : ""}
                </p>
                {onSite && user && <ViewAs db={db} session={session} user={user} />}
                {onSite && session.role === "PITX Admin" && (
                  <button type="button" className="btn-link" disabled={live === "loading"} onClick={() => refreshLive(setLive)}>
                    {live === "loading" ? "Reading PITX…" : "Refresh from PITX"}
                  </button>
                )}
                {session.role === "PITX Admin" && (
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => {
                      if (window.confirm("Reset all demo data? Tickets and changes in this browser will be lost.")) {
                        resetDemoData();
                        if (onSite) refreshLive(setLive);
                      }
                    }}
                  >
                    Reset demo data
                  </button>
                )}
                {onSite ? (
                  <a className="btn-outline" href={portalUrl()}>
                    All modules
                  </a>
                ) : (
                  <button type="button" className="btn-outline" onClick={signOut}>
                    Sign out
                  </button>
                )}
              </div>
            </details>
          </div>
        </div>
        <main className="wrap">
          {canAccess(session.role, pathname) ? (
            <DemoNotice.Provider value={notice}>{children}</DemoNotice.Provider>
          ) : (
            <p className="text-sm text-slate-600">
              Your role can&apos;t open this page.{" "}
              <Link className="text-brand underline" href={homeFor(session.role)}>
                Go to your home page
              </Link>
              .
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  if (!hydrated) return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  return <Shell>{children}</Shell>;
}
