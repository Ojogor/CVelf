"use client";

import { useState } from "react";
import type { Job } from "@prisma/client";
import { JobEditor } from "@/components/JobEditor";

export function JobEditorPanel({ job, onUpdated }: { job: Job; onUpdated?: (job: Job) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-medium">Edit job details</span>
        <span className="text-slate-400 text-sm">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <JobEditor job={job} onUpdated={onUpdated} />
        </div>
      )}
    </div>
  );
}

