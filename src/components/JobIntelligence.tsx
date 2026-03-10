"use client";

import { useEffect, useMemo, useState } from "react";
import type { Resume } from "@prisma/client";
import { fetchJson } from "@/lib/fetchJson";

type ScoreApiResponse =
  | {
      analysis: {
        status: "full";
        evidence: {
          jobTextLength: number;
          requiredSkills: number;
          preferredSkills: number;
          requirementLines: number;
          responsibilities: number;
          domainSignals: number;
          recognizedSkills: string[];
          otherTechnicalTerms: string[];
          domainTerms: string[];
          softSkills: string[];
        };
      };
      result: {
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
        missingRequiredSkills: string[];
        matchedPreferredSkills: string[];
        missingPreferredSkills: string[];
        suggestions: string[];
      };
    }
  | {
      analysis: {
        status: "partial";
        note: string;
        detectedSkills: string[];
        overlapSkills: string[];
        preliminaryFit: "Good" | "Maybe" | "Unclear";
        evidence: {
          jobTextLength: number;
          requiredSkills: number;
          preferredSkills: number;
          requirementLines: number;
          responsibilities: number;
          domainSignals: number;
          recognizedSkills: string[];
          otherTechnicalTerms: string[];
          domainTerms: string[];
          softSkills: string[];
        };
      };
      extracted: {
        detectedSkills: string[];
        possibleOverlapSkills: string[];
        responsibilities: string[];
      };
    }
  | {
      analysis: {
        status: "insufficient";
        note: string;
        detectedSkills: string[];
        evidence: {
          jobTextLength: number;
          requiredSkills: number;
          preferredSkills: number;
          requirementLines: number;
          responsibilities: number;
          domainSignals: number;
          recognizedSkills: string[];
          otherTechnicalTerms: string[];
          domainTerms: string[];
          softSkills: string[];
        };
      };
      extracted: {
        detectedSkills: string[];
        requiredSkills: string[];
        preferredSkills: string[];
        responsibilities: string[];
      };
    };

export function JobIntelligence({ jobId }: { jobId: string }) {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeId, setResumeId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScoreApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [requirementsText, setRequirementsText] = useState("");
  const [savingReq, setSavingReq] = useState(false);

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
      const body = await fetchJson<any>(res);
      if (!res.ok) throw new Error(body.error || "Score failed");
      setData(body as ScoreApiResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Score failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveRequirements() {
    if (!requirementsText.trim()) return;
    setSavingReq(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsedRequirements: requirementsText.trim() }),
      });
      const body = await fetchJson<any>(res);
      if (!res.ok) throw new Error(body.error || "Save failed");
      setPasteOpen(false);
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingReq(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Job Intelligence</h2>
          <p className="text-xs text-slate-400">Conservative analysis based on extracted evidence.</p>
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

      {data?.analysis.status === "insufficient" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/20 p-3">
            <p className="text-sm font-semibold">Insufficient job detail</p>
            <p className="text-xs text-slate-400 mt-1">{data.analysis.note}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPasteOpen((v) => !v)}
                className="px-3 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/40 text-sm"
              >
                Paste Requirements Section
              </button>
            </div>
          </div>

          {(data.analysis.evidence.recognizedSkills.length > 0 ||
            data.analysis.evidence.otherTechnicalTerms.length > 0) && (
            <div className="rounded-lg bg-slate-800/30 border border-slate-700/50 p-3 space-y-2">
              <p className="text-xs text-slate-400">Signals we could see (not enough for a score):</p>
              {data.analysis.evidence.recognizedSkills.length > 0 && (
                <div>
                  <p className="text-[11px] text-slate-400 mb-1">Recognized technical skills</p>
                  <div className="flex flex-wrap gap-2">
                    {data.analysis.evidence.recognizedSkills.slice(0, 18).map((s) => (
                      <span
                        key={s}
                        className="text-xs px-2 py-0.5 rounded bg-slate-700/60 border border-slate-600 text-slate-100"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {data.analysis.evidence.otherTechnicalTerms.length > 0 && (
                <div>
                  <p className="text-[11px] text-slate-400 mb-1">Other detected technical terms</p>
                  <div className="flex flex-wrap gap-2">
                    {data.analysis.evidence.otherTechnicalTerms.slice(0, 18).map((s) => (
                      <span
                        key={s}
                        className="text-xs px-2 py-0.5 rounded bg-slate-800/70 border border-slate-700 text-slate-200"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(data.analysis.evidence.domainTerms.length > 0 ||
                data.analysis.evidence.softSkills.length > 0) && (
                <p className="text-[11px] text-slate-500 mt-1">
                  We ignore vague domain/soft-skill phrases for strict scoring to avoid overclaiming.
                </p>
              )}
            </div>
          )}

          {pasteOpen && (
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-3 space-y-2">
              <p className="text-xs text-slate-400">
                Paste only the Requirements/Qualifications text. We’ll use it for analysis without replacing the full job description.
              </p>
              <textarea
                value={requirementsText}
                onChange={(e) => setRequirementsText(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm resize-y"
                placeholder="Paste Requirements/Qualifications here…"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveRequirements}
                  disabled={savingReq || !requirementsText.trim()}
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium"
                >
                  {savingReq ? "Saving…" : "Save & Re-analyze"}
                </button>
                <button
                  type="button"
                  onClick={() => setPasteOpen(false)}
                  className="px-3 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/40 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {data?.analysis.status === "partial" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-sky-700/40 bg-sky-950/15 p-3">
            <p className="text-sm font-semibold">Partial analysis</p>
            <p className="text-xs text-slate-400 mt-1">{data.analysis.note}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/50 text-slate-200">
                Preliminary fit: {data.analysis.preliminaryFit}
              </span>
              <button
                type="button"
                onClick={() => setPasteOpen((v) => !v)}
                className="px-3 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/40 text-sm"
              >
                Paste Requirements Section
              </button>
            </div>
          </div>

          {data.analysis.detectedSkills?.length > 0 && (
            <div className="rounded-lg bg-slate-800/30 border border-slate-700/50 p-3">
              <p className="text-xs text-slate-400 mb-2">Detected skills</p>
              <div className="flex flex-wrap gap-2">
                {data.analysis.detectedSkills.slice(0, 16).map((s) => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded bg-slate-700/60 text-slate-200">
                    {s}
                  </span>
                ))}
              </div>
              {data.analysis.overlapSkills?.length > 0 && (
                <p className="text-xs text-slate-500 mt-2">
                  Overlap: <span className="text-slate-300">{data.analysis.overlapSkills.slice(0, 10).join(", ")}</span>
                </p>
              )}
            </div>
          )}

          {(data.analysis.evidence.otherTechnicalTerms.length > 0 ||
            data.analysis.evidence.domainTerms.length > 0) && (
            <div className="rounded-lg bg-slate-900/40 border border-slate-700/50 p-3 space-y-2">
              {data.analysis.evidence.otherTechnicalTerms.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Other detected technical terms (not counted as core skills)</p>
                  <div className="flex flex-wrap gap-2">
                    {data.analysis.evidence.otherTechnicalTerms.slice(0, 16).map((s) => (
                      <span
                        key={s}
                        className="text-xs px-2 py-0.5 rounded bg-slate-800/70 border border-slate-700 text-slate-200"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {data.analysis.evidence.domainTerms.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Domain / context signals</p>
                  <div className="flex flex-wrap gap-2">
                    {data.analysis.evidence.domainTerms.slice(0, 12).map((s) => (
                      <span
                        key={s}
                        className="text-xs px-2 py-0.5 rounded bg-slate-900/70 border border-slate-700 text-slate-200"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[11px] text-slate-500">
                Low-confidence / culture-only phrases are shown for context but excluded from strict scoring.
              </p>
            </div>
          )}

          {pasteOpen && (
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-3 space-y-2">
              <p className="text-xs text-slate-400">
                Paste only the Requirements/Qualifications text. We’ll use it for analysis without replacing the full job description.
              </p>
              <textarea
                value={requirementsText}
                onChange={(e) => setRequirementsText(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm resize-y"
                placeholder="Paste Requirements/Qualifications here…"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveRequirements}
                  disabled={savingReq || !requirementsText.trim()}
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium"
                >
                  {savingReq ? "Saving…" : "Save & Re-analyze"}
                </button>
                <button
                  type="button"
                  onClick={() => setPasteOpen(false)}
                  className="px-3 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/40 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500">
            Tip: paste the Requirements/Qualifications section to unlock a full score.
          </p>
        </div>
      )}

      {data?.analysis.status === "full" && (
        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-slate-400 text-xs">Overall match</p>
              <p className="text-3xl font-bold">{data.result.overallScore}/100</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Required skills</p>
              <p className="text-sm">
                {data.result.breakdown.requiredSkillsMatched}/{data.result.breakdown.requiredSkillsTotal}
              </p>
              <p className="text-xs text-slate-400 mt-1">Preferred skills</p>
              <p className="text-sm">
                {data.result.breakdown.preferredSkillsMatched}/{data.result.breakdown.preferredSkillsTotal}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-800/40 border border-slate-700/50 p-3">
              <p className="text-xs text-slate-400 mb-1">Strong matches</p>
              <div className="flex flex-wrap gap-2">
                {data.result.matchedRequiredSkills.slice(0, 10).map((s) => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded bg-emerald-900/30 border border-emerald-700/40 text-emerald-200">
                    {s}
                  </span>
                ))}
                {data.result.matchedPreferredSkills.slice(0, 6).map((s) => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded bg-emerald-900/10 border border-emerald-700/30 text-emerald-200">
                    {s}
                  </span>
                ))}
                {!data.result.matchedRequiredSkills.length && !data.result.matchedPreferredSkills.length && (
                  <p className="text-xs text-slate-500">No clear matches extracted.</p>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-slate-800/40 border border-slate-700/50 p-3">
              <p className="text-xs text-slate-400 mb-1">Missing must-haves</p>
              <div className="flex flex-wrap gap-2">
                {data.result.missingRequiredSkills.slice(0, 12).map((s) => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded bg-red-900/20 border border-red-700/40 text-red-200">
                    {s}
                  </span>
                ))}
                {!data.result.missingRequiredSkills.length && (
                  <p className="text-xs text-slate-500">No missing required skills detected.</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-slate-800/30 border border-slate-700/50 p-3">
            <p className="text-xs text-slate-400 mb-2">Fix before applying</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-slate-200">
              {data.result.suggestions.slice(0, 6).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>

          {(data.analysis.evidence.recognizedSkills.length > 0 ||
            data.analysis.evidence.otherTechnicalTerms.length > 0 ||
            data.analysis.evidence.domainTerms.length > 0) && (
            <div className="rounded-lg bg-slate-900/40 border border-slate-700/50 p-3 space-y-2">
              <p className="text-xs text-slate-400 mb-1">How we interpreted this posting</p>
              {data.analysis.evidence.recognizedSkills.length > 0 && (
                <p className="text-[11px] text-slate-300">
                  Recognized technical skills used for scoring:{" "}
                  <span className="text-slate-100">
                    {data.analysis.evidence.recognizedSkills.slice(0, 18).join(", ")}
                  </span>
                  .
                </p>
              )}
              {data.analysis.evidence.otherTechnicalTerms.length > 0 && (
                <p className="text-[11px] text-slate-300">
                  Other detected technical terms (not all scored):{" "}
                  <span className="text-slate-100">
                    {data.analysis.evidence.otherTechnicalTerms.slice(0, 18).join(", ")}
                  </span>
                  .
                </p>
              )}
              {data.analysis.evidence.domainTerms.length > 0 && (
                <p className="text-[11px] text-slate-300">
                  Domain/context signals:{" "}
                  <span className="text-slate-100">
                    {data.analysis.evidence.domainTerms.slice(0, 12).join(", ")}
                  </span>
                  .
                </p>
              )}
              <p className="text-[11px] text-slate-500">
                The score only uses high/medium-confidence technical signals; vague culture language is ignored so the match stays honest.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

