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

type JobPostingParsed = {
  overview: {
    title: string;
    company: string;
    location?: string;
    platform?: string | null;
    url?: string | null;
    mission?: string;
  };
  keySkills: string[];
  responsibilities: Array<{ title: string; items: string[] }>;
  requirements: string[];
  niceToHave: string[];
  raw: { description: string | null; parsedRequirements: string | null };
};

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [job, setJob] = useState<Job | null>(null);
  const [parsed, setParsed] = useState<JobPostingParsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [reqPasteOpen, setReqPasteOpen] = useState(false);
  const [requirementsText, setRequirementsText] = useState("");
  const [savingReq, setSavingReq] = useState(false);
  const [tab, setTab] = useState<"posting" | "intelligence" | "tailor" | "applications">("posting");

  useEffect(() => {
    (async () => {
      const [r1, r2] = await Promise.all([fetch(`/api/jobs/${id}`), fetch(`/api/jobs/${id}/parse`)]);
      const [jobData, parsedData] = await Promise.all([fetchJson<any>(r1), fetchJson<any>(r2)]);
      if (!r1.ok) throw new Error(jobData.error || "Failed to load job");
      if (!r2.ok) throw new Error(parsedData.error || "Failed to parse job");
      setJob(jobData as Job);
      setParsed(parsedData as JobPostingParsed);
    })().catch((e) => setError(e instanceof Error ? e.message : "Failed to load job"));
  }, [id]);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!job) return <p className="text-slate-400">Loading…</p>;

  async function saveRequirements() {
    if (!requirementsText.trim()) return;
    setSavingReq(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsedRequirements: requirementsText.trim() }),
      });
      const body = await fetchJson<any>(res);
      if (!res.ok) throw new Error(body.error || "Save failed");
      setReqPasteOpen(false);
      // refresh parsed view
      const r2 = await fetch(`/api/jobs/${job.id}/parse`);
      const parsedData = await fetchJson<any>(r2);
      if (r2.ok) setParsed(parsedData as JobPostingParsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingReq(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Overview */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">
              {parsed?.overview.title ?? job.title} — {parsed?.overview.company ?? job.company}
            </h1>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/50">
                Company: {parsed?.overview.company ?? job.company}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/50">
                Location: {parsed?.overview.location || "Unknown"}
              </span>
              {job.platform && (
                <span className="px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/50">
                  {job.platform}
                </span>
              )}
              {job.deadline && (
                <span className="px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/50">
                  Deadline: {new Date(job.deadline).toLocaleDateString()}
                </span>
              )}
            </div>
            {parsed?.overview.mission && (
              <p className="mt-3 text-slate-200 text-sm leading-6">
                <span className="text-slate-400 text-xs block mb-1">Mission</span>
                {parsed.overview.mission}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setReqPasteOpen((v) => !v)}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
            >
              Extract Requirements
            </button>
            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:text-white text-sm"
              >
                Open listing
              </a>
            )}
          </div>
        </div>

        {reqPasteOpen && (
          <div className="mt-4 rounded-xl border border-slate-700/50 bg-slate-950/30 p-4 space-y-2">
            <p className="text-xs text-slate-400">
              Paste the Requirements/Qualifications section here. We’ll use it to improve analysis without overwriting the original job snapshot.
            </p>
            <textarea
              value={requirementsText}
              onChange={(e) => setRequirementsText(e.target.value)}
              rows={7}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm resize-y"
              placeholder="Paste Requirements/Qualifications…"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveRequirements}
                disabled={savingReq || !requirementsText.trim()}
                className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium"
              >
                {savingReq ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setReqPasteOpen(false)}
                className="px-3 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/40 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["posting", "Job Posting"],
            ["intelligence", "Job Fit"],
            ["tailor", "Tailor Resume"],
            ["applications", "Applications"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={
              "px-3 py-2 rounded-lg text-sm font-semibold border " +
              (tab === k
                ? "bg-slate-800/70 border-slate-500 text-white"
                : "bg-slate-900/30 border-slate-700/60 text-slate-300 hover:bg-slate-800/30")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "posting" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
            <h2 className="font-semibold">Key Skills</h2>
            <p className="text-xs text-slate-400 mt-1">Key technologies detected from the posting.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(parsed?.keySkills || []).slice(0, 18).map((s) => (
                <span
                  key={s}
                  className="text-xs px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/50 text-slate-200"
                >
                  {s}
                </span>
              ))}
              {!parsed?.keySkills?.length && <p className="text-sm text-slate-500 mt-2">No skills detected yet.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
            <h2 className="font-semibold">Responsibilities</h2>
            <div className="mt-3 space-y-4">
              {(parsed?.responsibilities || []).map((g, idx) => (
                <div key={idx}>
                  <p className="text-xs text-slate-400 mb-2">{g.title}</p>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-slate-200">
                    {g.items.slice(0, 12).map((it, j) => (
                      <li key={j}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {!parsed?.responsibilities?.length && <p className="text-sm text-slate-500">No responsibilities extracted yet.</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
              <h2 className="font-semibold">Requirements</h2>
              <ul className="mt-3 list-disc pl-5 space-y-1 text-sm text-slate-200">
                {(parsed?.requirements || []).slice(0, 16).map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
              {!parsed?.requirements?.length && (
                <p className="text-sm text-slate-500 mt-2">
                  No clear requirements extracted yet. Use “Extract Requirements” and paste the Requirements/Qualifications section.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
              <h2 className="font-semibold">Nice-to-haves</h2>
              <ul className="mt-3 list-disc pl-5 space-y-1 text-sm text-slate-200">
                {(parsed?.niceToHave || []).slice(0, 14).map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
              {!parsed?.niceToHave?.length && <p className="text-sm text-slate-500 mt-2">None detected.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
            <button
              type="button"
              onClick={() => setShowFull((v) => !v)}
              className="w-full flex items-center justify-between"
            >
              <span className="font-semibold">Full job description</span>
              <span className="text-sm text-slate-400">{showFull ? "Hide ▲" : "Show ▼"}</span>
            </button>
            {showFull && (
              <div className="mt-3">
                <FormattedText text={parsed?.raw.description ?? job.description} />
              </div>
            )}
          </div>

          <JobEditorPanel job={job} onUpdated={setJob} />
        </div>
      )}

      {tab === "intelligence" && <JobIntelligence jobId={job.id} />}
      {tab === "tailor" && <ResumeTailor jobId={job.id} />}
      {tab === "applications" && <AddApplicationRecord jobId={job.id} />}
    </div>
  );
}

