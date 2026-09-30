"use client";

import { useModuleNav } from "@/components/dashboard/module-nav";

/** Shown on Module 02 for demo and signed-in users — same copy, same placement. */
export function VisualsTimingNote() {
  const { activeHref } = useModuleNav();
  if (!activeHref.startsWith("/dashboard/visuals")) return null;

  return (
    <p className="mb-6 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
      <span className="font-semibold">Note-</span> If credits are used then Images/Motion will not
      generate completely.
    </p>
  );
}
