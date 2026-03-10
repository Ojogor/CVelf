"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Job } from "@prisma/client";
import { fetchJson } from "@/lib/fetchJson";
import { FormattedText } from "@/components/FormattedText";
import { JobEditorPanel } from "@/components/JobEditorPanel";
import { JobIntelligence } from "@/components/JobIntelligence";
import { ResumeTailor } from "@/components/ResumeTailor";
import { AddApplicationRecord } from "@/components/AddApplicationRecord";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/jobs/${id}`);
      const data = await fetchJson<any>(res);
      if (!res.ok) throw new Error(data.error || "Failed to load job");
      setJob(data as Job);
    })().catch((e) => setError(e instanceof Error ? e.message : "Failed to load job"));
  }, [id]);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!job) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">{job.title}</h1>
          <p className="text-slate-400">{job.company}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {job.platform && (
              <span className="px-2 py-0.5 rounded bg-slate-700/60 text-slate-200">{job.platform}</span>
            )}
            {job.deadline && (
              <span className="px-2 py-0.5 rounded bg-slate-700/40 text-slate-300">
                Deadline: {new Date(job.deadline).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:text-white"
          >
            Open listing
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <JobIntelligence jobId={job.id} />
        <ResumeTailor jobId={job.id} />
      </div>

      <AddApplicationRecord jobId={job.id} />

      <JobEditorPanel job={job} onUpdated={setJob} />

      <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
        <h2 className="font-semibold mb-2">Job description</h2>
        <FormattedText text={job.description} />
      </div>
    </div>
  );
}

