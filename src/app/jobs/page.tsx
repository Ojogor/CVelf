"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { JobCard } from "@/components/JobCard";
import type { Job } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_ORDER = [
  "pending",
  "in_progress",
  "applied",
  "interviewing",
  "offer",
  "rejected",
] as const;
type JobStatus = (typeof STATUS_ORDER)[number];

function prettyStatus(s: string) {
  return s.replaceAll("_", " ");
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState<JobStatus>("pending");
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("all");
  const [company, setCompany] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/jobs")
      .then((r) => fetchJson<Job[]>(r))
      .then((data) => {
        if (!cancelled) setJobs(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setJobs([]);
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

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of STATUS_ORDER) c[s] = 0;
    for (const j of jobs) c[j.status] = (c[j.status] || 0) + 1;
    return c as Record<JobStatus, number>;
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
    return list.sort((a, b) => {
      const ad = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [jobs, activeStatus, q, platform, company]);

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
        <h1 className="text-2xl font-bold">Jobs</h1>
        <Link
          href="/jobs/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition"
        >
          <Plus className="w-4 h-4" />
          Add Job
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-700/60">
        {STATUS_ORDER.map((status) => {
          const active = status === activeStatus;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setActiveStatus(status)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const jobId = e.dataTransfer.getData("text/jobId");
                if (jobId) moveJobToStatus(jobId, status);
              }}
              className={[
                "px-4 py-2 rounded-t-lg text-sm font-medium transition",
                "border border-b-0",
                active
                  ? "bg-slate-900 border-slate-600 text-white"
                  : "bg-slate-800/30 border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-800/60",
              ].join(" ")}
            >
              <span className="capitalize">{prettyStatus(status)}</span>
              <span
                className={[
                  "ml-2 text-xs px-2 py-0.5 rounded-full",
                  active ? "bg-blue-600 text-white" : "bg-slate-700/60 text-slate-300",
                ].join(" ")}
              >
                {counts[status] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl bg-slate-800/30 border border-slate-700/50 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <p className="text-sm text-slate-400">
            {loading ? "Loading…" : `${filtered.length} job(s) in ${prettyStatus(activeStatus)}`}
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
      </div>

      <div className="space-y-2">
        {filtered.map((job) => (
          <JobCard
            key={job.id}
            job={job}
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
            No jobs found for this tab + filters.
          </div>
        )}
      </div>
    </div>
  );
}

