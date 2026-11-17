"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { MOVED } from "@/lib/roles";

/** An old page that was merged into another: sends bookmarks and old links to the new place. */
export function Moved({ from }: { from: keyof typeof MOVED }) {
  const router = useRouter();
  const to = MOVED[from];
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return <p className="p-6 text-sm text-slate-500">This page moved. Opening it…</p>;
}
