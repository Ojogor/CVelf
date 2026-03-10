"use client";

import { useEffect, useMemo, useState } from "react";
import type { Resume } from "@prisma/client";
import { fetchJson } from "@/lib/fetchJson";

type ScoreResult = {
  overallScore: number;
  breakdown: {
    requiredSkillsMatched: number;
    requiredSkillsTotal: number;
    preferredSkillsMatched: number;
    preferredSkillsTotal: number;
    requiredSkillsScore: number;
    preferredSkillsScore: number;
    experienceScore: number;
    titleScore: number;
    semanticScore: number;
    penalties: number;
    overallScore: number;
  };
  matchedRequiredSkills: string[];
  missingRequiredSkills: string[];
  matchedPreferredSkills: string[];
  missingPreferredSkills: string[];
  suggestions: string[];
};

export function JobIntelligence({ jobId }: { jobId: string }) {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeId, setResumeId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
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
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, resumeId }),
      });
      const data = await fetchJson<any>(res);
      if (!res.ok) throw new Error(data.error || "Score failed");
      setResult(data as ScoreResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Score failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Job Intelligence</h2>
          <p className="text-xs text-slate-400">“Should I apply?” + what to fix first.</p>
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
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            {loading ? "Scoring…" : "Score"}
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
          <div className="flex items-end justify-between">
            <div>
              <p className="text-slate-400 text-xs">Overall match</p>
              <p className="text-3xl font-bold">{result.overallScore}/100</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Required skills</p>
              <p className="text-sm">
                {result.breakdown.requiredSkillsMatched}/{result.breakdown.requiredSkillsTotal}
              </p>
              <p className="text-xs text-slate-400 mt-1">Preferred skills</p>
              <p className="text-sm">
                {result.breakdown.preferredSkillsMatched}/{result.breakdown.preferredSkillsTotal}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-800/40 border border-slate-700/50 p-3">
              <p className="text-xs text-slate-400 mb-1">Strong matches</p>
              <div className="flex flex-wrap gap-2">
                {result.matchedRequiredSkills.slice(0, 10).map((s) => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded bg-emerald-900/30 border border-emerald-700/40 text-emerald-200">
                    {s}
                  </span>
                ))}
                {result.matchedPreferredSkills.slice(0, 6).map((s) => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded bg-emerald-900/10 border border-emerald-700/30 text-emerald-200">
                    {s}
                  </span>
                ))}
                {!result.matchedRequiredSkills.length && !result.matchedPreferredSkills.length && (
                  <p className="text-xs text-slate-500">No clear matches extracted.</p>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-slate-800/40 border border-slate-700/50 p-3">
              <p className="text-xs text-slate-400 mb-1">Missing must-haves</p>
              <div className="flex flex-wrap gap-2">
                {result.missingRequiredSkills.slice(0, 12).map((s) => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded bg-red-900/20 border border-red-700/40 text-red-200">
                    {s}
                  </span>
                ))}
                {!result.missingRequiredSkills.length && (
                  <p className="text-xs text-slate-500">No missing required skills detected.</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-slate-800/30 border border-slate-700/50 p-3">
            <p className="text-xs text-slate-400 mb-2">Fix before applying</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-slate-200">
              {result.suggestions.slice(0, 6).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

