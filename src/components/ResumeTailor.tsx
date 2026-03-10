"use client";

import { useEffect, useMemo, useState } from "react";
import type { Resume } from "@prisma/client";
import { fetchJson } from "@/lib/fetchJson";

type TailorResult = {
  fastWins: string[];
  tailoredSummaries: string[];
  suggestedSkillOrder: string[];
  jobKeywordsToMirror: string[];
  bulletSuggestions: Array<{
    original: string;
    matchedJobLine?: string;
    rewrite: string;
    score: number;
  }>;
  extracted: {
    jobRequiredSkills: string[];
    jobPreferredSkills: string[];
    resumeSkills: string[];
  };
};

export function ResumeTailor({ jobId }: { jobId: string }) {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeId, setResumeId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TailorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/resumes");
      const data = await fetchJson<Resume[]>(res);
      setResumes(data);
      setResumeId(data[0]?.id || "");
    })().catch(() => {});
  }, []);

  const selectedResume = useMemo(
    () => resumes.find((r) => r.id === resumeId),
    [resumes, resumeId]
  );

  async function run() {
    if (!resumeId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, resumeId }),
      });
      const data = await fetchJson<any>(res);
      if (!res.ok) throw new Error(data.error || "Tailor failed");
      setResult(data as TailorResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tailor failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Tailor Resume</h2>
          <p className="text-xs text-slate-400">Local, template-based tailoring (no API key).</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={resumeId}
            onChange={(e) => setResumeId(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
          >
            {resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={run}
            disabled={!resumeId || loading}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            {loading ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>

      {selectedResume && (
        <p className="text-xs text-slate-500">
          Using resume: <span className="text-slate-300">{selectedResume.name}</span>
        </p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {result && (
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-800/30 border border-slate-700/50 p-3">
            <p className="text-xs text-slate-400 mb-2">Fast wins</p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {result.fastWins.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-800/30 border border-slate-700/50 p-3">
              <p className="text-xs text-slate-400 mb-2">Tailored summary (pick one)</p>
              <div className="space-y-2 text-sm">
                {result.tailoredSummaries.map((s, i) => (
                  <p key={i} className="text-slate-200">
                    {s}
                  </p>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-slate-800/30 border border-slate-700/50 p-3">
              <p className="text-xs text-slate-400 mb-2">Suggested skill order</p>
              <div className="flex flex-wrap gap-2">
                {result.suggestedSkillOrder.slice(0, 24).map((s) => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded bg-slate-700/60 text-slate-200">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-slate-800/30 border border-slate-700/50 p-3">
            <p className="text-xs text-slate-400 mb-2">Targeted bullet rewrites</p>
            <div className="space-y-3">
              {result.bulletSuggestions.slice(0, 8).map((b, i) => (
                <div key={i} className="rounded-lg border border-slate-700/40 bg-slate-900/30 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">Match strength</p>
                    <p className="text-xs text-slate-300">{b.score}/100</p>
                  </div>
                  {b.matchedJobLine && (
                    <p className="mt-2 text-xs text-slate-400">
                      Matched JD line: <span className="text-slate-200">{b.matchedJobLine}</span>
                    </p>
                  )}
                  <p className="mt-2 text-sm text-slate-300">
                    Original: <span className="text-slate-200">{b.original}</span>
                  </p>
                  <p className="mt-2 text-sm text-emerald-200">
                    Rewrite: <span className="text-slate-100">{b.rewrite}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

