"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { GeneratedResume, Resume } from "@prisma/client";
import { fetchJson } from "@/lib/fetchJson";
import { documentToPlainText } from "@/lib/tailor/document";
import { getAiSettings } from "@/lib/ai/clientSettings";

export default function ResumesPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [generated, setGenerated] = useState<GeneratedResume[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [normalizing, setNormalizing] = useState(false);

  async function load() {
    const [r1, r2] = await Promise.all([fetch("/api/resumes"), fetch("/api/generated-resumes")]);
    const d1 = await fetchJson<any>(r1);
    const d2 = await fetchJson<any>(r2);
    if (!r1.ok) throw new Error(d1?.error || "Failed to fetch resumes");
    if (!r2.ok) throw new Error(d2?.error || "Failed to fetch generated resumes");
    setResumes(d1 as Resume[]);
    setGenerated(d2 as GeneratedResume[]);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed to fetch"));
  }, []);

  function getGeneratedSnippet(gr: GeneratedResume) {
    try {
      const parsed = JSON.parse(gr.assemblyJson || "{}");
      const doc = parsed?.document;
      if (doc?.blocks?.length) {
        const text = documentToPlainText(doc);
        return text.replace(/\s+/g, " ").trim().slice(0, 240);
      }
    } catch {}
    return "Template-based resume. Click to edit and export.";
  }

  async function normalizeExisting() {
    const settings = getAiSettings();
    setNormalizing(true);
    setError(null);
    try {
      const res = await fetch("/api/resumes/normalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          settings.provider === "gemini" && settings.apiKey
            ? { apiKey: settings.apiKey }
            : {}
        ),
      });
      const body = await fetchJson<any>(res);
      if (!res.ok) throw new Error(body?.error || "Normalize failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Normalize failed");
    } finally {
      setNormalizing(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resumes</h1>
          <p className="text-xs text-slate-400 mt-1">
            Create template-based resumes (normalized JSON) or add master resumes from text/PDF.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={normalizeExisting}
            disabled={normalizing}
            className="px-3 py-1.5 rounded-md border border-slate-600/70 text-slate-200 hover:bg-white/5 disabled:opacity-50 text-xs font-medium"
            title="Convert existing master resumes into template-based created resumes"
          >
            {normalizing ? "Normalizing…" : "Normalize existing"}
          </button>
          <Link
            href="/resumes/builder/new"
            className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
          >
            Create resume
          </Link>
          <Link
            href="/resumes/new"
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
          >
            Add resume
          </Link>
        </div>
      </div>

      {error && <p className="text-red-400">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {generated.map((r) => (
          <div
            key={r.id}
            className="group relative rounded-xl border border-slate-700/50 bg-slate-900/40 hover:bg-slate-800/40 overflow-hidden"
          >
            <Link href={`/resumes/builder/${r.id}`} className="block p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium truncate">{r.name}</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                  Created
                </span>
              </div>
              <div className="mt-3 rounded-lg bg-white text-slate-900 p-3 shadow-inner">
                <p className="text-[10px] font-semibold tracking-wide uppercase text-slate-500">
                  {String(r.template || "Template").replaceAll("_", " ")}
                </p>
                <p className="mt-2 text-[11px] leading-4 text-slate-800 line-clamp-6">{getGeneratedSnippet(r)}</p>
              </div>
              <p className="text-xs text-slate-500 mt-3">Updated {new Date(r.updatedAt).toLocaleDateString()}</p>
            </Link>

            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950/40 flex items-start justify-end p-3 gap-2">
              <Link
                href={`/resumes/builder/${r.id}`}
                className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 text-white text-xs"
              >
                Edit
              </Link>
              <Link
                href={`/resumes/builder/${r.id}?preview=1`}
                className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 text-white text-xs"
              >
                Preview
              </Link>
            </div>
          </div>
        ))}

        {resumes.map((r) => (
          <Link
            key={r.id}
            href={`/resumes/${r.id}`}
            className="p-4 rounded-xl border border-slate-700/50 bg-slate-900/40 hover:bg-slate-800/40"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium truncate">{r.name}</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/20">
                Master
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Updated {new Date(r.updatedAt).toLocaleDateString()}
            </p>
            <p className="text-xs text-slate-500 mt-2 line-clamp-3">
              {r.content ? r.content.slice(0, 200) : "No content yet"}
            </p>
          </Link>
        ))}
      </div>

      {!error && resumes.length === 0 && generated.length === 0 && (
        <p className="text-slate-400">No resumes yet. Add one to start scoring jobs.</p>
      )}
    </div>
  );
}

