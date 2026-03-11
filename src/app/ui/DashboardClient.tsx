"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import type { Job, Resume } from "@prisma/client";

function detectPlatform(url: string) {
  const u = url.toLowerCase();
  if (u.includes("linkedin.com")) return "LinkedIn";
  if (u.includes("indeed.")) return "Indeed";
  if (u.includes("greenhouse.io")) return "Greenhouse";
  if (u.includes("lever.co")) return "Lever";
  return "Other";
}

function inferTitleCompanyFromPaste(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const first = lines[0] || "";
  const second = lines[1] || "";
  // very light heuristic: "Title — Company" or "Title - Company"
  const m = first.match(/^(.+?)\s+[-–—]\s+(.+?)$/);
  if (m) return { title: m[1].trim(), company: m[2].trim() };
  return {
    title: first.slice(0, 80) || "Untitled",
    company: second.slice(0, 80) || "Unknown",
  };
}

export default function DashboardClient() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  const [url, setUrl] = useState("");
  const [jobText, setJobText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/resumes"), fetch("/api/jobs")])
      .then(async ([r1, r2]) => {
        const [resumesData, jobsData] = await Promise.all([fetchJson<any>(r1), fetchJson<any>(r2)]);
        setResumes(Array.isArray(resumesData) ? resumesData : []);
        setJobs(Array.isArray(jobsData) ? jobsData : []);
      })
      .catch(() => {});
  }, []);

  const metrics = useMemo(() => {
    const saved = jobs.length;
    const applied = jobs.filter((j) => j.status === "applied").length;
    const interview = jobs.filter((j) => j.status === "interview").length;
    const offer = jobs.filter((j) => j.status === "offer").length;
    return { saved, applied, interview, offer };
  }, [jobs]);

  async function saveFromUrl() {
    if (!url.trim()) return;
    setSaving(true);
    setError(null);
    setImportNote(null);
    try {
      const importRes = await fetch("/api/jobs/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const imported = await fetchJson<any>(importRes);
      if (!importRes.ok || imported?.ok === false) {
        const msg =
          (imported && typeof imported.error === "string" && imported.error) ||
          "Could not import this URL. Paste the job description instead.";
        setError(msg);
        setImportNote("Tip: copy/paste the Requirements/Qualifications section for best results.");
        return;
      }

      const extractedText = String(imported?.text || "").trim();
      if (!extractedText) {
        setError("Imported page returned no readable text. Paste the job description instead.");
        setImportNote("Tip: copy/paste the Requirements/Qualifications section for best results.");
        return;
      }

      setJobText(extractedText);
      setImportNote("Imported text from the URL. Review/edit if needed, then it will be saved with the job.");

      const titleFromTitleTag = typeof imported?.title === "string" ? imported.title.trim() : "";
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleFromTitleTag || "New job (from link)",
          company: "Unknown",
          url: url.trim(),
          platform: detectPlatform(url),
          description: extractedText,
          status: "interested",
        }),
      });
      const data = await fetchJson<any>(res);
      if (!res.ok) throw new Error(data.error || "Save failed");
      window.location.href = `/jobs/${data.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveFromPaste() {
    if (!jobText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const inferred = inferTitleCompanyFromPaste(jobText);
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: inferred.title,
          company: inferred.company,
          description: jobText.trim(),
          status: "interested",
          platform: "Paste",
        }),
      });
      const data = await fetchJson<any>(res);
      if (!res.ok) throw new Error(data.error || "Save failed");
      window.location.href = `/jobs/${data.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Dashboard</h2>
          <p className="text-slate-400 mt-1">
            Save a job in seconds. Paste a link or the full job description.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={resumes.length ? "/jobs" : "/resumes/new"}
            className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/40 text-sm"
          >
            {resumes.length ? "Go to Saved Jobs" : "Upload resume first"}
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 p-5 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-4 space-y-3">
            <h3 className="font-semibold">Capture from link</h3>
            <p className="text-xs text-slate-400">
              Works best on company pages, Greenhouse/Lever, etc. If a site blocks extraction, you can paste the description instead.
            </p>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste job URL (LinkedIn, Indeed, Greenhouse, Lever...)"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
            />
            <button
              type="button"
              onClick={saveFromUrl}
              disabled={saving || !url.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium"
            >
              {saving ? "Saving…" : "Save job"}
            </button>
            {importNote && <p className="text-xs text-slate-400">{importNote}</p>}
          </div>

          <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-4 space-y-3">
            <h3 className="font-semibold">Capture from pasted description</h3>
            <p className="text-xs text-slate-400">
              Best option if the job site is blocked. Paste the full posting (especially Requirements/Qualifications).
            </p>
            <textarea
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
              rows={8}
              placeholder="Paste the full job description here…"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm resize-y"
            />
            <button
              type="button"
              onClick={saveFromPaste}
              disabled={saving || !jobText.trim()}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium"
            >
              {saving ? "Saving…" : "Save job"}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
          <p className="text-xs text-slate-400">Jobs saved</p>
          <p className="text-2xl font-bold">{metrics.saved}</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
          <p className="text-xs text-slate-400">Applied</p>
          <p className="text-2xl font-bold">{metrics.applied}</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
          <p className="text-xs text-slate-400">Interviews</p>
          <p className="text-2xl font-bold">{metrics.interview}</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
          <p className="text-xs text-slate-400">Offers</p>
          <p className="text-2xl font-bold">{metrics.offer}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/resumes"
          className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/40 text-sm"
        >
          Resume
        </Link>
        <Link
          href="/jobs"
          className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/40 text-sm"
        >
          Saved Jobs
        </Link>
        <Link
          href="/applications"
          className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/40 text-sm"
        >
          Applications
        </Link>
      </div>
    </div>
  );
}

