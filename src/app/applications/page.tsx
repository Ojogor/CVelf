"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";

type AppRow = {
  id: string;
  appliedAt: string;
  outcome: string;
  notes: string | null;
  job: { id: string; title: string; company: string };
  resume: { id: string; name: string };
};

const OUTCOMES = [
  "applied",
  "interview_scheduled",
  "offer_received",
  "rejected",
] as const;

function prettyOutcome(o: string) {
  return o.replaceAll("_", " ");
}

export default function ApplicationsPage() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/applications")
      .then((r) => fetchJson<any>(r))
      .then((data) => {
        if (!cancelled) setApps(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setApps([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return apps;
    return apps.filter((a) => {
      const hay = `${a.job.title} ${a.job.company} ${a.resume.name} ${a.outcome}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [apps, q]);

  async function updateOutcome(id: string, outcome: string) {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, outcome } : a)));
    try {
      await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
    } catch {
      // ignore
    }
  }

  async function remove(id: string) {
    const ok = window.confirm("Delete this application record?");
    if (!ok) return;
    setApps((prev) => prev.filter((a) => a.id !== id));
    try {
      await fetch(`/api/applications/${id}`, { method: "DELETE" });
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Applications</h1>
          <p className="text-slate-400 text-sm">Track your progress without extra overhead.</p>
        </div>
      </div>

      <div className="rounded-xl bg-slate-800/30 border border-slate-700/50 p-4">
        <label className="block text-xs text-slate-500 mb-1">Search</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Job, company, resume, status…"
          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 overflow-hidden">
        <div className="grid grid-cols-12 gap-0 px-4 py-3 text-xs text-slate-400 border-b border-slate-700/50">
          <div className="col-span-4">Job</div>
          <div className="col-span-3">Resume</div>
          <div className="col-span-2">Applied</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1 text-right"> </div>
        </div>

        {loading && <p className="p-4 text-slate-400">Loading…</p>}

        {!loading && filtered.length === 0 && (
          <p className="p-4 text-slate-400">
            No applications yet. When you apply to a job, add an application record from the job page.
          </p>
        )}

        {!loading &&
          filtered.map((a) => (
            <div
              key={a.id}
              className="grid grid-cols-12 gap-0 px-4 py-3 text-sm border-b border-slate-800/60 items-center"
            >
              <div className="col-span-4">
                <a href={`/jobs/${a.job.id}`} className="font-medium hover:underline">
                  {a.job.title}
                </a>
                <div className="text-xs text-slate-500">{a.job.company}</div>
              </div>
              <div className="col-span-3">
                <a href={`/resumes/${a.resume.id}`} className="text-slate-200 hover:underline">
                  {a.resume.name}
                </a>
              </div>
              <div className="col-span-2 text-slate-300 text-xs">
                {new Date(a.appliedAt).toLocaleDateString()}
              </div>
              <div className="col-span-2">
                <select
                  value={a.outcome}
                  onChange={(e) => updateOutcome(a.id, e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
                >
                  {OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {prettyOutcome(o)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-1 text-right">
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  className="text-xs px-2 py-1.5 rounded-lg border border-red-700/50 text-red-200 hover:bg-red-950/30"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

