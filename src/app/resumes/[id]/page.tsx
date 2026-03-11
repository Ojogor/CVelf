"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Resume } from "@prisma/client";
import { fetchJson } from "@/lib/fetchJson";
import { FormattedText } from "@/components/FormattedText";
import { ReplaceResumePdf } from "@/components/ReplaceResumePdf";

export default function ResumeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const [resume, setResume] = useState<Resume | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const res = await fetch(`/api/resumes/${id}`);
    const data = await fetchJson<any>(res);
    if (!res.ok) throw new Error(data.error || "Failed to load resume");
    setResume(data as Resume);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function updateName(next: string) {
    if (!resume) return;
    setSavingName(true);
    setError(null);
    try {
      const res = await fetch(`/api/resumes/${resume.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      const body = await fetchJson<any>(res);
      if (!res.ok) throw new Error(body.error || "Rename failed");
      setResume(body as Resume);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setSavingName(false);
    }
  }

  async function deleteResume() {
    if (!resume) return;
    const ok = window.confirm("Delete this resume? This cannot be undone.");
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/resumes/${resume.id}`, { method: "DELETE" });
      const body = await fetchJson<any>(res);
      if (!res.ok) throw new Error(body.error || "Delete failed");
      router.push("/resumes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  if (error) return <p className="text-red-400">{error}</p>;
  if (!resume) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <input
            className="w-full bg-transparent text-2xl font-bold text-slate-50 outline-none border-b border-transparent focus:border-slate-600"
            value={resume.name}
            onChange={(e) => updateName(e.target.value)}
            disabled={savingName}
          />
          <p className="text-slate-500 text-sm">
            Updated {new Date(resume.updatedAt).toLocaleString()}
          </p>
        </div>
        <button
          type="button"
          onClick={deleteResume}
          disabled={deleting}
          className="px-3 py-2 rounded-lg border border-red-700/60 text-red-300 hover:text-red-200 hover:border-red-500 text-sm disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete resume"}
        </button>
      </div>

      <ReplaceResumePdf resumeId={resume.id} onDone={load} />

      <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
        <h2 className="font-semibold mb-2">Resume content</h2>
        <FormattedText text={resume.content} />
      </div>
    </div>
  );
}

