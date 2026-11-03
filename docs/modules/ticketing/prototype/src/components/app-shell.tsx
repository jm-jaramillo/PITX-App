"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { asset } from "@/lib/paths";
import { canAccess, homeFor, isCompanyRole, NAV } from "@/lib/roles";
import { resetDemoData, signIn, signOut, useDb, useHydrated } from "@/lib/store";
import { ROLES, type Role } from "@/lib/types";

function SignIn() {
  const db = useDb();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("Teller");
  const counters = db.counters.filter((c) => c.status === "Active");
  const [counterId, setCounterId] = useState(db.settings.defaultCounterId || counters[0]?.id || "");
  const needsCounter = role === "Teller";
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

  if (!session) return <SignIn />;

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
          <div className="flex flex-wrap gap-2">
            <button className="rounded border border-white/40 px-3 py-1.5 hover:bg-brand-dark" onClick={signOut}>
              Sign out
            </button>
            {session.role === "Super Admin" && (
              <button
                className="rounded border border-white/40 px-3 py-1.5 hover:bg-brand-dark"
                onClick={() => {
                  if (window.confirm("Reset all demo data? Tickets and changes in this browser will be lost.")) {
                    resetDemoData();
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
          Prototype: dummy data saved in this browser only. No real payments yet.
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
