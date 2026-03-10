"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Resume } from "@prisma/client";
import { fetchJson } from "@/lib/fetchJson";
import { FormattedText } from "@/components/FormattedText";
import { ReplaceResumePdf } from "@/components/ReplaceResumePdf";

export default function ResumeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [resume, setResume] = useState<Resume | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/resumes");
    const data = await fetchJson<any>(res);
    if (!res.ok) throw new Error(data.error || "Failed to load resumes");
    const found = (data as Resume[]).find((r) => r.id === id) || null;
    setResume(found);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!resume) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{resume.name}</h1>
          <p className="text-slate-500 text-sm">
            Updated {new Date(resume.updatedAt).toLocaleString()}
          </p>
        </div>
      </div>

      <ReplaceResumePdf resumeId={resume.id} onDone={load} />

      <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
        <h2 className="font-semibold mb-2">Resume content</h2>
        <FormattedText text={resume.content} />
      </div>
    </div>
  );
}

