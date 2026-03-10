"use client";

import Link from "next/link";
import { ExternalLink, GripVertical, Trash2 } from "lucide-react";
import type { Job } from "@prisma/client";
import { StatusSelect } from "@/components/StatusSelect";
import { useState } from "react";
import { fetchJson } from "@/lib/fetchJson";

export function JobCard({
  job,
  onDeleted,
  onStatusChanged,
}: {
  job: Job;
  onDeleted?: (jobId: string) => void;
  onStatusChanged?: (jobId: string, newStatus: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm("Delete this job? This cannot be undone.");
    if (!ok) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
      const data = await fetchJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Delete failed");
      onDeleted?.(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="p-3 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/30 hover:border-slate-600 transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <button
              type="button"
              className="mt-0.5 text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/jobId", job.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={(e) => {
                // keep clicks from stealing focus on the card
                e.preventDefault();
                e.stopPropagation();
              }}
              aria-label="Drag job"
              title="Drag"
            >
              <GripVertical className="w-4 h-4" />
            </button>

            <Link href={`/jobs/${job.id}`} className="block min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{job.title}</p>
            <p className="text-xs text-slate-500 truncate">{job.company}</p>
            </Link>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-3 h-3" />
                Open
              </a>
            )}
            {job.platform && (
              <span className="text-xs px-2 py-0.5 rounded bg-slate-700/60 text-slate-300">
                {job.platform}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <StatusSelect
            jobId={job.id}
            currentStatus={job.status}
            size="sm"
            onChanged={(s) => onStatusChanged?.(job.id, s)}
          />
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-2 px-2 py-1.5 rounded-lg border border-red-700/50 text-red-300 hover:text-red-200 hover:border-red-600 bg-red-950/20 hover:bg-red-950/40 text-sm disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </div>
  );
}

