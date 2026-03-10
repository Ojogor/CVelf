"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";

export default function NewResumePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createFromText() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/resumes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || "Pasted resume", content }),
      });
      const data = await fetchJson<any>(res);
      if (!res.ok) throw new Error(data.error || "Create failed");
      router.push(`/resumes/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setLoading(false);
    }
  }

  async function uploadPdf() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("name", name || file.name || "Uploaded resume");
      form.set("file", file);
      const res = await fetch("/api/resumes/upload", { method: "POST", body: form });
      const data = await fetchJson<any>(res);
      if (!res.ok) throw new Error(data.error || "Upload failed");
      router.push(`/resumes/${data.resume.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Add resume</h1>

      <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-3">
        <label className="block text-sm text-slate-400">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., SWE - General"
          className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-3">
          <h2 className="font-semibold">Paste text</h2>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            placeholder="Paste your resume text here…"
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white resize-y"
          />
          <button
            type="button"
            disabled={loading || !content.trim()}
            onClick={createFromText}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            {loading ? "Saving…" : "Save text resume"}
          </button>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-3">
          <h2 className="font-semibold">Upload PDF</h2>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-700 file:text-white hover:file:bg-slate-600"
          />
          <button
            type="button"
            disabled={loading || !file}
            onClick={uploadPdf}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            {loading ? "Uploading…" : "Upload PDF"}
          </button>
          <p className="text-xs text-slate-500">
            If extraction looks wrong, paste the text as a fallback.
          </p>
        </div>
      </div>

      {error && <p className="text-red-400">{error}</p>}
    </div>
  );
}

