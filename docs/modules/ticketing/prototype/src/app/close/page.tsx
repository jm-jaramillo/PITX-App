"use client";

import { useState, type FormEvent } from "react";
import { dateTimeManila, todayManila } from "@/lib/format";
import { closeSales, useDb } from "@/lib/store";
import { PageTitle } from "@/components/page-title";

export default function CloseSalesPage() {
  const db = useDb();
  const [code, setCode] = useState("");
  const [count, setCount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const today = todayManila();
  const session = db.session;
  const closing = db.closings.find(
    (c) => c.date === today && c.teller === session?.name && c.counterId === session?.counterId,
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (count === "") {
      setError("Enter the cash you counted.");
      return;
    }
    if (window.confirm(`Close your sales for ${today}? You won't be able to sell again today at this counter.`)) {
      setError(closeSales(code, Number(count), today));
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageTitle>Close Sales · {today}</PageTitle>
      {closing ? (
        <div role="status" className="rounded-lg border border-green-300 bg-green-50 p-5 text-sm text-green-900">
          <p className="font-semibold">Your sales are closed.</p>
          <p className="mt-1">Submitted {dateTimeManila(closing.closedAt)}. Hand your cash to Account for counting.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">
            Count your cash and enter the amount. The system total stays hidden until Account has counted too.
          </p>
          <label>
            Approval code from the Super Admin
            <input autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <label>
            Cash you counted (PHP)
            <input type="number" min={0} step="any" value={count} onChange={(e) => setCount(e.target.value)} />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button className="w-full rounded bg-accent py-2.5 font-semibold text-white hover:bg-accent-dark">Close sales</button>
        </form>
      )}
    </div>
  );
}
