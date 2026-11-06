"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { dateTimeManila } from "@/lib/format";
import { companyIdForOperator, loadLive } from "@/lib/live";
import { asset } from "@/lib/paths";
import { moduleHomeUrl, onPortalSite, portalUrl, portalUser, type PortalUser } from "@/lib/portal";
import { canAccess, homeFor, isCompanyRole, NAV, sells } from "@/lib/roles";
import { getDb, replaceData, resetDemoData, saveRecord, signIn, signOut, useDb, useHydrated } from "@/lib/store";
import { ROLES, type Db, type Role, type Session } from "@/lib/types";

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
// company: one role, Bus Company (Teller and PUB Admin together), for its own company only.
const isOperator = (user: PortalUser | null) => user?.role === "operator";

/** The operator's own company: by operator id (real PITX data), else by name. */
function operatorCompanyId(db: Db, user: PortalUser): string | undefined {
  const byId = user.operatorId ? companyIdForOperator(user.operatorId) : "";
  const name = user.name.trim().toUpperCase();
  return (
    db.companies.find((c) => c.id === byId) ??
    db.companies.find((c) => c.name.toUpperCase() === name || c.description?.toUpperCase() === name)
  )?.id;
}

/** A session for the portal user in the given demo role, with the first active counter/company. */
function portalSession(db: Db, user: PortalUser, role: Role): Session {
  const operator = isOperator(user);
  const sessionRole: Role = operator ? "Bus Company" : role;
  return {
    name: user.name,
    role: sessionRole,
    counterId: sells(sessionRole)
      ? db.settings.defaultCounterId || db.counters.find((c) => c.status === "Active")?.id
      : undefined,
    companyId: operator
      ? operatorCompanyId(db, user)
      : isCompanyRole(sessionRole)
        ? db.companies.find((c) => c.status === "Active")?.id
        : undefined,
  };
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
    <label className="block text-white/70">
      View as
      <select
        className="mt-1 w-full rounded border border-white/40 bg-brand px-2 py-1.5 text-sm text-white"
        value={session.role}
        onChange={(e) => signIn(portalSession(db, user, e.target.value as Role))}
      >
        {ROLES.map((r) => (
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
  const counters = db.counters.filter((c) => c.status === "Active");
  const [counterId, setCounterId] = useState(db.settings.defaultCounterId || counters[0]?.id || "");
  const needsCounter = sells(role);
  const needsCompany = isCompanyRole(role);
  const companies = db.companies.filter((c) => c.status === "Active");
  const [companyId, setCompanyId] = useState("");

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
      (isOperator(user) && (session.role !== "Bus Company" || session.companyId !== operatorCompany)));
  useEffect(() => {
    if (!onSite) return;
    if (!user) {
      location.replace(moduleHomeUrl());
    } else if (isOperator(user) && !operatorCompany) {
      addOperatorCompany(user);
    } else if (sessionStale) {
      // Same person: keep the role they picked. Someone else: start as Super Admin.
      signIn(portalSession(db, user, session && session.name === user.name ? session.role : "Super Admin"));
    }
  }, [onSite, user, session, db, operatorCompany, sessionStale]);

  // On the site, read real PITX trips once per page load (live.ts).
  const [live, setLive] = useState<LiveState>(liveState);
  const signedIn = !!session && !!user;
  useEffect(() => {
    if (!onSite || !signedIn || liveState !== "idle") return;
    refreshLive(setLive);
  }, [onSite, signedIn]);

  if (!session || (onSite && (!user || sessionStale))) {
    return onSite ? <p className="p-6 text-sm text-slate-500">Signing in…</p> : <SignIn />;
  }

  return (
    <div className="min-h-screen">
      <aside className="no-print flex flex-col border-b-4 border-accent bg-brand text-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-r-4 lg:border-b-0">
        <div className="border-b border-white/15 px-5 py-4">
          <img src={asset("/brand/pitx-horizontal-on-dark.png")} alt="PITX, Parañaque Integrated Terminal Exchange" className="w-52 max-w-full" />
          <div className="mt-2 text-xs font-semibold tracking-wide text-white/70">TICKETING</div>
        </div>
        <nav className="flex flex-1 flex-wrap gap-1 overflow-y-auto p-3 text-sm lg:flex-col lg:flex-nowrap">
          {NAV.filter((item) => item.roles.includes(session.role)).map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded px-3 py-2 ${active ? "bg-accent font-semibold" : "text-white/85 hover:bg-brand-dark"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-white/15 p-4 text-xs">
          {company && (
            <div className="flex h-12 items-center justify-center rounded bg-white p-1.5">
              <CompanyLogo company={company} className="max-h-full max-w-full" />
            </div>
          )}
          <div>
            <div className="text-sm font-semibold">{session.name}</div>
            <div className="text-white/70">
              {session.role}
              {company ? ` · ${company.code}` : ""}
              {counter ? ` · ${counter.code}` : ""}
            </div>
          </div>
          {onSite && user && !isOperator(user) && <ViewAs db={db} session={session} user={user} />}
          <div className="flex flex-wrap gap-2">
            {onSite ? (
              <a className="rounded border border-white/40 px-3 py-1.5 hover:bg-brand-dark" href={portalUrl()}>
                All modules
              </a>
            ) : (
              <button className="rounded border border-white/40 px-3 py-1.5 hover:bg-brand-dark" onClick={signOut}>
                Sign out
              </button>
            )}
            {onSite && session.role === "Super Admin" && (
              <button
                className="rounded border border-white/40 px-3 py-1.5 hover:bg-brand-dark disabled:opacity-50"
                disabled={live === "loading"}
                onClick={() => refreshLive(setLive)}
              >
                {live === "loading" ? "Reading PITX…" : "Refresh from PITX"}
              </button>
            )}
            {session.role === "Super Admin" && (
              <button
                className="rounded border border-white/40 px-3 py-1.5 hover:bg-brand-dark"
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
          </div>
        </div>
      </aside>
      <div className="flex min-h-screen flex-col lg:ml-64 print:ml-0">
        <div className="no-print bg-brand-tint px-4 py-1 text-center text-xs text-brand">
          {db.source === "pitx"
            ? `Real PITX trips, operators and plates from Trip Scheduling (read ${dateTimeManila(db.loadedAt ?? "")}). Fares are placeholders. Sales are saved in this browser only.`
            : live === "empty"
              ? "Sample data: no real trips are open to your account. Sales are saved in this browser only."
              : "Prototype: dummy data saved in this browser only. No real payments yet."}
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-6">
          {canAccess(session.role, pathname) ? (
            children
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
