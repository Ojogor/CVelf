"use client";

import { useEffect, useMemo, useState } from "react";
import type { Resume } from "@prisma/client";
import { fetchJson } from "@/lib/fetchJson";
import { getAiSettings } from "@/lib/ai/clientSettings";
import type { ScoreResult } from "@/lib/ats/types";

type JobFitAi = {
  score: number;
  confidence: "low" | "medium" | "high";
  explanation: string;
  strong: string[];
  partial: string[];
  missing: string[];
  suggestions: string[];
};

const SCORE_CACHE_KEY = "jtp_score";
const SCORE_CACHE_TTL_MS = 30 * 60 * 1000;

function getScoreCache(jobId: string, resumeId: string): { jobFit: JobFitAi } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${SCORE_CACHE_KEY}_${jobId}_${resumeId}`);
    if (!raw) return null;
    const { jobFit, ts } = JSON.parse(raw);
    if (!jobFit || Date.now() - (ts || 0) > SCORE_CACHE_TTL_MS) return null;
    return { jobFit };
  } catch {
    return null;
  }
}

function setScoreCache(jobId: string, resumeId: string, jobFit: JobFitAi) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      `${SCORE_CACHE_KEY}_${jobId}_${resumeId}`,
      JSON.stringify({ jobFit, ts: Date.now() })
    );
  } catch {}
}

export function JobIntelligence({ jobId }: { jobId: string }) {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeId, setResumeId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<JobFitAi | null>(null);
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
    [resumes, resumeId],
  );

  async function run(forceRefresh = false) {
    if (!resumeId) return;
    if (!forceRefresh) {
      const cached = getScoreCache(jobId, resumeId);
      if (cached) {
        setData(cached.jobFit);
        setError(null);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const ai = getAiSettings();
      const payload: { jobId: string; resumeId: string; apiKey?: string } = { jobId, resumeId };
      if (ai.provider === "gemini" && ai.apiKey) payload.apiKey = ai.apiKey;

      const scoreRes = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const scoreBody = await fetchJson<any>(scoreRes);
      if (!scoreRes.ok) {
        throw new Error(scoreBody?.error || "Scoring failed");
      }
      if (scoreBody?.ok === false && typeof scoreBody?.error === "string") {
        throw new Error(scoreBody.error);
      }

      const analysis = scoreBody.analysis as
        | { status: "full" | "partial" | "insufficient"; note?: string; detectedSkills?: string[]; aiExplanation?: string; aiConfidence?: "low" | "medium" | "high" }
        | undefined;

      if (scoreBody.result) {
        const result = scoreBody.result as ScoreResult;
        const breakdown = result.breakdown;
        const matchedSkills = [
          ...result.matchedRequiredSkills,
          ...result.matchedPreferredSkills,
        ];
        const missingSkills = [
          ...result.missingRequiredSkills,
          ...result.missingPreferredSkills,
        ];

        const explanationLines: string[] = [];
        if (analysis?.aiExplanation?.trim()) {
          explanationLines.push(analysis.aiExplanation.trim());
        } else {
          explanationLines.push(
            "Local hybrid score combining required/preferred skills, title alignment, experience bullets, and semantic match.",
          );
          explanationLines.push(
            `Required skills coverage: ${breakdown.requiredSkillsMatched}/${breakdown.requiredSkillsTotal}.`,
          );
          explanationLines.push(
            `Semantic relevance: ${breakdown.semanticScore}/18; penalties: ${breakdown.penalties}.`,
          );
        }
        if (analysis?.note && !analysis?.aiExplanation) explanationLines.push(analysis.note);
        if (analysis?.status && analysis.status !== "full" && !analysis?.aiExplanation) {
          explanationLines.push(
            "Note: score based on partial local analysis; enrich job requirements for an even more accurate match.",
          );
        }

        const confidence: JobFitAi["confidence"] =
          (analysis?.aiConfidence === "low" || analysis?.aiConfidence === "medium" || analysis?.aiConfidence === "high")
            ? analysis.aiConfidence
            : breakdown.semanticScore >= 12 && breakdown.penalties <= 4
              ? "high"
              : breakdown.semanticScore <= 4 || breakdown.penalties >= 12
                ? "low"
                : "medium";

        const jobFit: JobFitAi = {
          score: Math.max(0, Math.min(100, Number(result.overallScore) || 0)),
          confidence,
          explanation: explanationLines.join(" "),
          strong: matchedSkills.slice(0, 16),
          partial: (analysis?.detectedSkills || []).filter(
            (s) => !matchedSkills.includes(s) && !missingSkills.includes(s),
          ),
          missing: missingSkills.slice(0, 16),
          suggestions: result.suggestions.slice(0, 8),
        };
        setData(jobFit);
        setScoreCache(jobId, resumeId, jobFit);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Job fit failed");
    } finally {
      setLoading(false);
    }
  }

  // Auto-run when resume changes so the match is always for the current resume.
  useEffect(() => {
    if (!resumeId) return;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId]);

  // Listen for global "Refine with AI" from the job detail page.
  useEffect(() => {
    function handleGlobalRefine(event: Event) {
      const anyEvent = event as CustomEvent<{ jobId?: string }>;
      const targetJobId = anyEvent.detail?.jobId;
      if (targetJobId && targetJobId !== jobId) return;
      if (!resumeId || loading) return;
      void run();
    }
    if (typeof window !== "undefined") {
      window.addEventListener("jtp-ai-refine-all", handleGlobalRefine as EventListener);
      return () => window.removeEventListener("jtp-ai-refine-all", handleGlobalRefine as EventListener);
    }
  }, [jobId, resumeId, loading]);

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Job Fit (AI)</h2>
          <p className="text-xs text-slate-400">
            Uses your Experience Bank and this posting to compute an AI-backed match score and concrete edits.
          </p>
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
            onClick={() => run(true)}
            disabled={!resumeId || loading}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            {loading ? "Scoring…" : "Re-score"}
          </button>
        </div>
      </div>

      {selectedResume && (
        <p className="text-xs text-slate-500">
          Using resume: <span className="text-slate-300">{selectedResume.name}</span>
        </p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {data && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">Overall match</p>
              <p className="text-3xl font-bold text-slate-100">{data.score}/100</p>
              <p className="mt-1 text-xs text-slate-300 whitespace-pre-line">{data.explanation}</p>
            </div>
            <div className="text-right text-xs text-slate-400 space-y-1">
              <p>
                Confidence:{" "}
                <span className="text-slate-100">
                  {data.confidence === "high"
                    ? "High"
                    : data.confidence === "low"
                      ? "Cautious"
                      : "Medium"}
                </span>
              </p>
              <p className="text-slate-400">
                Source: Experience Bank bullets + resume skills (no invented data).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-800/30 border border-slate-700/50 p-3">
              <p className="text-xs text-slate-400 mb-2">Clear strengths</p>
              <div className="flex flex-wrap gap-2">
                {data.strong.slice(0, 10).map((s) => (
                  <span
                    key={s}
                    className="text-xs px-2 py-0.5 rounded bg-emerald-900/20 border border-emerald-700/40 text-emerald-200"
                  >
                    {s}
                  </span>
                ))}
                {data.strong.length === 0 && (
                  <p className="text-xs text-slate-500">No strong, clearly-matched skills detected yet.</p>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-slate-800/30 border border-slate-700/50 p-3 space-y-1">
              <p className="text-xs text-slate-400 mb-1">Key gaps and partial matches</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {data.missing.slice(0, 8).map((s) => (
                  <span
                    key={`miss-${s}`}
                    className="px-2 py-0.5 rounded bg-red-900/25 border border-red-700/50 text-red-200"
                  >
                    {s}
                  </span>
                ))}
                {data.partial.slice(0, 8).map((s) => (
                  <span
                    key={`part-${s}`}
                    className="px-2 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200"
                  >
                    {s}
                  </span>
                ))}
                {data.missing.length + data.partial.length === 0 && (
                  <p className="text-xs text-slate-500">
                    No obvious stack gaps; focus on clarity, impact, and tailoring your bullets.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-slate-800/30 border border-slate-700/50 p-3 space-y-2">
            <p className="text-xs text-slate-400 mb-1">What to change in your resume</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-slate-200">
              {data.suggestions.slice(0, 6).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
              {data.suggestions.length === 0 && (
                <li>
                  Emphasize concrete impact (metrics, scale, stack) in 3–5 of your strongest bullets and mirror the
                  most important job requirements.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

