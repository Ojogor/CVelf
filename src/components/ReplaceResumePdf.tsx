"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/fetchJson";

export function ReplaceResumePdf({ resumeId, onDone }: { resumeId: string; onDone?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/resumes/${resumeId}/upload`, { method: "POST", body: form });
      const data = await fetchJson<any>(res);
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-3">
      <h3 className="font-semibold">Replace resume file (PDF or DOCX)</h3>
      <input
        type="file"
        accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-700 file:text-white hover:file:bg-slate-600"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="button"
        onClick={upload}
        disabled={!file || loading}
        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium"
      >
        {loading ? "Uploading…" : "Upload"}
      </button>
    </div>
  );
}

