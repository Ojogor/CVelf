"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { JobCard } from "@/components/JobCard";
import type { Job, Resume } from "@prisma/client";

export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "interested", label: "Interested" },
  { key: "applied", label: "Applied" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
  { key: "rejected", label: "Rejected" },
] as const;
type JobStatus = (typeof COLUMNS)[number]["key"];

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState<JobStatus>("interested");
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("all");
  const [company, setCompany] = useState("");
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [matchResumeId, setMatchResumeId] = useState<string>("");
  const [sortMode, setSortMode] = useState<"deadline" | "createdAt" | "bestMatch">("deadline");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetch("/api/jobs"), fetch("/api/resumes")])
      .then(async ([jobsRes, resumesRes]) => {
        const [jobsData, resumesData] = await Promise.all([
          fetchJson<Job[]>(jobsRes),
          fetchJson<Resume[]>(resumesRes),
        ]);
        if (!cancelled) {
          setJobs(Array.isArray(jobsData) ? jobsData : []);
          const list = Array.isArray(resumesData) ? resumesData : [];
          setResumes(list);
          if (!matchResumeId && list[0]?.id) {
            setMatchResumeId(list[0].id);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setJobs([]);
          setResumes([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) if (j.platform) set.add(j.platform);
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [jobs]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const cc = company.trim().toLowerCase();
    const list = jobs.filter((j) => {
      if (j.status !== activeStatus) return false;
      if (platform !== "all" && (j.platform || "Other") !== platform) return false;
      if (cc && !j.company.toLowerCase().includes(cc)) return false;
      if (qq) {
        const hay = `${j.title} ${j.company} ${j.platform ?? ""}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      return true;
    });
    if (sortMode === "bestMatch") {
      return list
        .slice()
        .sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
    }
    return list
      .slice()
      .sort((a, b) => {
        const ad = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
        const bd = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [jobs, q, platform, company, activeStatus, sortMode, scores]);

  async function computeMatchScores() {
    if (!matchResumeId) return;
    setScoring(true);
    setScoreError(null);
    try {
      const inColumn = jobs.filter((j) => j.status === activeStatus);
      const entries = await Promise.all(
        inColumn.map(async (job) => {
          try {
            const res = await fetch("/api/score", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jobId: job.id, resumeId: matchResumeId }),
            });
            const body = await fetchJson<any>(res);
            if (!res.ok) {
              throw new Error(body.error || "Score failed");
            }
            const result = body.result as { overallScore?: number } | undefined;
            const score =
              typeof result?.overallScore === "number" && Number.isFinite(result.overallScore)
                ? Math.max(0, Math.min(100, Math.round(result.overallScore)))
                : 0;
            return [job.id, score] as const;
          } catch {
            return [job.id, 0] as const;
          }
        }),
      );
      const next: Record<string, number> = {};
      for (const [id, score] of entries) {
        next[id] = score;
      }
      setScores(next);
    } catch (e) {
      setScoreError(e instanceof Error ? e.message : "Scoring failed");
    } finally {
      setScoring(false);
    }
  }

  async function moveJobToStatus(jobId: string, newStatus: JobStatus) {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j)));
    try {
      await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Saved Jobs</h1>
        <Link
          href="/jobs/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition"
        >
          <Plus className="w-4 h-4" />
          Add Job
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-700/60">
        {COLUMNS.map((t) => {
          const active = t.key === activeStatus;
          const count = jobs.filter((j) => j.status === t.key).length;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveStatus(t.key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const jobId = e.dataTransfer.getData("text/jobId");
                if (jobId) moveJobToStatus(jobId, t.key);
              }}
              className={[
                "px-4 py-2 rounded-t-lg text-sm font-medium transition",
                "border border-b-0",
                active
                  ? "bg-slate-900 border-slate-600 text-white"
                  : "bg-slate-800/30 border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-800/60",
              ].join(" ")}
            >
              <span>{t.label}</span>
              <span
                className={[
                  "ml-2 text-xs px-2 py-0.5 rounded-full",
                  active ? "bg-blue-600 text-white" : "bg-slate-700/60 text-slate-300",
                ].join(" ")}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl bg-slate-800/30 border border-slate-700/50 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Search</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Title, company, platform…"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {p === "all" ? "All" : p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Company</label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Filter by company…"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Sort & match</label>
            <div className="flex flex-col gap-2">
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="deadline">By deadline (soonest first)</option>
                <option value="createdAt">By created date</option>
                <option value="bestMatch">By best match score</option>
              </select>
              {resumes.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    value={matchResumeId}
                    onChange={(e) => setMatchResumeId(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-xs"
                  >
                    {resumes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={computeMatchScores}
                    disabled={scoring || !matchResumeId}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium"
                  >
                    {scoring ? "Scoring…" : "Score tab"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <p className="text-sm text-slate-400">
            {loading ? "Loading…" : `${filtered.length} job(s)`}
          </p>
          <button
            type="button"
            onClick={() => {
              setQ("");
              setPlatform("all");
              setCompany("");
            }}
            className="text-sm px-3 py-2 rounded-lg border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500"
          >
            Clear filters
          </button>
        </div>
        {scoreError && (
          <p className="mt-2 text-xs text-red-400">
            {scoreError}
          </p>
        )}
      </div>

      <div
        className="space-y-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const jobId = e.dataTransfer.getData("text/jobId");
          if (jobId) moveJobToStatus(jobId, activeStatus);
        }}
      >
        {filtered.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            matchScore={scores[job.id]}
            onDeleted={(jobId) => setJobs((prev) => prev.filter((j) => j.id !== jobId))}
            onStatusChanged={(jobId, newStatus) =>
              setJobs((prev) =>
                prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j))
              )
            }
          />
        ))}
        {!loading && filtered.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-slate-700 p-10 text-center text-slate-500">
            No jobs found in this tab.
          </div>
        )}
      </div>
    </div>
  );
}

