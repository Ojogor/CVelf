"use client";

import { useEffect, useMemo, useState } from "react";
import type { Resume } from "@prisma/client";
import { fetchJson } from "@/lib/fetchJson";

export function AddApplicationRecord({ jobId }: { jobId: string }) {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeId, setResumeId] = useState("");
  const [appliedAt, setAppliedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    fetch("/api/resumes")
      .then((r) => fetchJson<Resume[]>(r))
      .then((data) => {
        setResumes(Array.isArray(data) ? data : []);
        setResumeId((Array.isArray(data) && data[0]?.id) || "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const key = `jtp_track_app_enabled_${jobId}`;
      const v = localStorage.getItem(key);
      if (v === "0") setEnabled(false);
      if (v === "1") setEnabled(true);
    } catch {}
  }, [jobId]);

  function toggleEnabled() {
    setEnabled((v) => {
      const next = !v;
      try {
        localStorage.setItem(`jtp_track_app_enabled_${jobId}`, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  const resumeName = useMemo(
    () => resumes.find((r) => r.id === resumeId)?.name,
    [resumes, resumeId]
  );

  async function create() {
    if (!resumeId) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          resumeId,
          appliedAt,
          outcome: "applied",
          notes: notes.trim() || null,
        }),
      });
      const data = await fetchJson<any>(res);
      if (!res.ok) throw new Error(data.error || "Failed to create application");
      setMessage("Application record created. You can manage it in Applications.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to create application");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Track this application</h3>
          <p className="text-xs text-slate-400">Create a record when you apply.</p>
        </div>
        <button
          type="button"
          onClick={toggleEnabled}
          className={
            "px-3 py-1.5 rounded-lg text-xs font-semibold border " +
            (enabled
              ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-200"
              : "bg-slate-800/40 border-slate-600 text-slate-300")
          }
        >
          {enabled ? "On" : "Off"}
        </button>
      </div>

      {!enabled ? (
        <p className="text-sm text-slate-400">
          Tracking is off for this job. Toggle back on when you’re ready to add an application record.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Resume used</label>
              <select
                value={resumeId}
                onChange={(e) => setResumeId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
              >
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              {resumeName && <p className="text-xs text-slate-500 mt-1">Using: {resumeName}</p>}
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Date applied</label>
              <input
                type="date"
                value={appliedAt}
                onChange={(e) => setAppliedAt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Recruiter name, application link, referral, etc."
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm resize-y"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={create}
              disabled={!resumeId || saving}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium"
            >
              {saving ? "Creating…" : "Add application record"}
            </button>
            <a
              href="/applications"
              className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/40 text-sm"
            >
              View Applications
            </a>
          </div>

          {message && (
            <p
              className={
                message.toLowerCase().includes("failed") ? "text-sm text-red-400" : "text-sm text-emerald-300"
              }
            >
              {message}
            </p>
          )}
        </>
      )}
    </div>
  );
}

