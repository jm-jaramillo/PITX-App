"use client";

import { useState, type FormEvent } from "react";

export interface Field {
  key: string;
  label: string;
  type?: "text" | "number" | "checkbox" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  /** Show this field as a column in the list. */
  column?: boolean;
  /** Show a dropdown above the list that filters by this field. */
  filter?: boolean;
}

type Row = { id: string; status: string } & Record<string, unknown>;

function display(field: Field, value: unknown): string {
  if (field.type === "checkbox") return value ? "Yes" : "No";
  if (field.type === "select") return field.options?.find((o) => o.value === value)?.label ?? "";
  return value === undefined || value === null ? "" : String(value);
}

export function CrudTable({
  title,
  fields,
  rows,
  onSave,
}: {
  title: string;
  fields: Field[];
  rows: Row[];
  onSave: (record: Record<string, unknown>) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Active");
  const [perPage, setPerPage] = useState(25);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [fieldFilters, setFieldFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; ascending: boolean } | null>(null);

  const columns = fields.filter((f) => f.column);
  const term = search.trim().toLowerCase();
  const matching = rows.filter(
    (row) =>
      (statusFilter === "All" || row.status === statusFilter) &&
      fields.every((f) => !fieldFilters[f.key] || row[f.key] === fieldFilters[f.key]) &&
      (!term || columns.some((f) => display(f, row[f.key]).toLowerCase().includes(term))),
  );
  const sortField = fields.find((f) => f.key === sort?.key);
  const sorted = sortField
    ? [...matching].sort((a, b) => {
        const order = display(sortField, a[sortField.key]).localeCompare(
          display(sortField, b[sortField.key]),
          undefined,
          { numeric: true, sensitivity: "base" },
        );
        return sort?.ascending ? order : -order;
      })
    : matching;
  const visible = sorted.slice(0, perPage);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(editing!);
    setEditing(null);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-lg font-semibold">{title}</h2>
        <label>
          Search
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {fields
          .filter((f) => f.filter)
          .map((f) => (
            <label key={f.key}>
              {f.label}
              <select
                value={fieldFilters[f.key] ?? ""}
                onChange={(e) => setFieldFilters({ ...fieldFilters, [f.key]: e.target.value })}
              >
                <option value="">All</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        <label>
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option>Active</option>
            <option>Inactive</option>
            <option>All</option>
          </select>
        </label>
        <label>
          Per page
          <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))}>
            {[25, 50, 75, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <button
          className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white"
          onClick={() => setEditing({ status: "Active" })}
        >
          Add new
        </button>
      </div>

      {editing && (
        <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((field) => {
              const value = editing[field.key];
              const set = (v: unknown) => setEditing({ ...editing, [field.key]: v });
              if (field.type === "checkbox") {
                return (
                  <label key={field.key} className="self-end pb-2">
                    <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(e.target.checked)} />
                    {field.label}
                  </label>
                );
              }
              return (
                <label key={field.key}>
                  {field.label}
                  {field.type === "select" ? (
                    <select required={field.required} value={String(value ?? "")} onChange={(e) => set(e.target.value)}>
                      <option value="">Select one</option>
                      {field.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type ?? "text"}
                      min={field.type === "number" ? 0 : undefined}
                      step={field.type === "number" ? "any" : undefined}
                      required={field.required}
                      value={String(value ?? "")}
                      onChange={(e) =>
                        set(field.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)
                      }
                    />
                  )}
                </label>
              );
            })}
            <label>
              Status
              <select
                value={String(editing.status)}
                onChange={(e) => setEditing({ ...editing, status: e.target.value })}
              >
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white">Save</button>
            <button
              type="button"
              className="rounded border border-slate-300 px-4 py-2 text-sm"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">No.</th>
              {columns.map((f) => (
                <th
                  key={f.key}
                  className="px-3 py-2"
                  aria-sort={sort?.key === f.key ? (sort.ascending ? "ascending" : "descending") : undefined}
                >
                  <button
                    type="button"
                    className="font-semibold hover:underline"
                    onClick={() =>
                      setSort({ key: f.key, ascending: sort?.key === f.key ? !sort.ascending : true })
                    }
                  >
                    {f.label}
                    {sort?.key === f.key ? (sort.ascending ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{index + 1}</td>
                {columns.map((f) => (
                  <td key={f.key} className="px-3 py-2">
                    {display(f, row[f.key])}
                  </td>
                ))}
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2 text-right">
                  <button className="text-brand underline" onClick={() => setEditing({ ...row })}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length + 3} className="px-3 py-6 text-center text-slate-500">
                  No records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Showing {visible.length} of {matching.length}
      </p>
    </section>
  );
}
