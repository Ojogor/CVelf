"use client";

import { useState } from "react";
import type { Job } from "@prisma/client";
import { fetchJson } from "@/lib/fetchJson";

export function JobEditor({ job, onUpdated }: { job: Job; onUpdated?: (job: Job) => void }) {
  const [form, setForm] = useState({
    title: job.title || "",
    company: job.company || "",
    url: job.url || "",
    platform: job.platform || "",
    description: job.description || "",
    deadline: job.deadline ? new Date(job.deadline).toISOString().slice(0, 10) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          deadline: form.deadline || null,
        }),
      });
      const updated = await fetchJson<Job>(res);
      if (!res.ok) throw new Error((updated as any)?.error || "Save failed");
      onUpdated?.(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Title</label>
          <input
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Company</label>
          <input
            value={form.company}
            onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">URL</label>
          <input
            value={form.url}
            onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Platform</label>
          <input
            value={form.platform}
            onChange={(e) => setForm((p) => ({ ...p, platform: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Deadline</label>
        <input
          type="date"
          value={form.deadline}
          onChange={(e) => setForm((p) => ({ ...p, deadline: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          rows={8}
          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white resize-y"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

