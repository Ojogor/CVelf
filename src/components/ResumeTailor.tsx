"use client";

import { useEffect, useMemo, useState } from "react";
import type { Resume } from "@prisma/client";
import { fetchJson } from "@/lib/fetchJson";

type TailorResult = {
  warning?: string;
  fastWins: string[];
  tailoredSummaries: string[];
  suggestedSkillOrder: string[];
  jobKeywordsToMirror: string[];
  bulletSuggestions: Array<{
    original: string;
    confidence: "strong" | "moderate" | "weak";
    matchedRequirement?: string;
    matchedCategory?: "hard_skills" | "responsibilities" | "domain_context" | "soft_skills";
    why: string;
    suggestion?: string;
    scoreBand: string;
  }>;
  extracted: {
    jobRequiredSkills: string[];
    jobPreferredSkills: string[];
    jobSoftSkills: string[];
    jobDomainContext: string[];
    resumeSkills: string[];
  };
};

export function ResumeTailor({ jobId }: { jobId: string }) {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeId, setResumeId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TailorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [accepted, setAccepted] = useState<Record<number, boolean>>({});
  const [skipped, setSkipped] = useState<Record<number, boolean>>({});
  const [summaryIdx, setSummaryIdx] = useState(0);
  const [exporting, setExporting] = useState(false);

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
      setEdits({});
      setAccepted({});
      setSkipped({});
      setSummaryIdx(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tailor failed");
    } finally {
      setLoading(false);
    }
  }

  async function exportPdf() {
    if (!result || !resumeId) return;
    setExporting(true);
    setError(null);
    try {
      const acceptedBullets = result.bulletSuggestions
        .map((b, i) => {
          if (!b.suggestion) return null;
          if (!accepted[i]) return null;
          return (edits[i] ?? b.suggestion).trim();
        })
        .filter(Boolean);

      const chosenSummary = result.tailoredSummaries[summaryIdx] || result.tailoredSummaries[0] || "";

      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, resumeId, chosenSummary, acceptedBullets }),
      });
      if (!res.ok) {
        const body = await fetchJson<any>(res);
        throw new Error(body.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tailored-resume.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
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
          {result.warning && (
            <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3">
              <p className="text-sm text-amber-200">{result.warning}</p>
            </div>
          )}

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
                {result.tailoredSummaries.map((s, i) => {
                  const active = i === summaryIdx;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSummaryIdx(i)}
                      className={[
                        "text-left rounded-lg border p-2 text-sm w-full",
                        active
                          ? "border-emerald-600 bg-emerald-950/20 text-slate-100"
                          : "border-slate-700/50 bg-slate-900/20 text-slate-200 hover:bg-slate-800/20",
                      ].join(" ")}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={exportPdf}
                disabled={exporting}
                className="mt-3 w-full px-4 py-2 rounded-lg bg-slate-100 text-slate-900 hover:bg-white disabled:opacity-50 text-sm font-medium"
              >
                {exporting ? "Exporting…" : "Export tailored PDF (ATS-friendly)"}
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Exports the selected summary + accepted bullets + suggested skill order.
              </p>
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
            <p className="text-xs text-slate-400 mb-2">Bullet suggestions (selective)</p>
            <div className="space-y-3">
              {result.bulletSuggestions.slice(0, 8).map((b, i) => (
                <div key={i} className="rounded-lg border border-slate-700/40 bg-slate-900/30 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">Confidence</p>
                    <p
                      className={[
                        "text-xs",
                        b.confidence === "strong"
                          ? "text-emerald-200"
                          : b.confidence === "moderate"
                            ? "text-sky-200"
                            : "text-slate-400",
                      ].join(" ")}
                    >
                      {b.scoreBand}
                    </p>
                  </div>
                  {b.matchedRequirement && (
                    <p className="mt-2 text-xs text-slate-400">
                      Best matched requirement:{" "}
                      <span className="text-slate-200">{b.matchedRequirement}</span>
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    Why it matched: <span className="text-slate-200">{b.why}</span>
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    Original: <span className="text-slate-200">{b.original}</span>
                  </p>
                  {b.suggestion ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm text-emerald-200">
                        Suggested rewrite:
                      </p>
                      <textarea
                        value={edits[i] ?? b.suggestion}
                        onChange={(e) => setEdits((p) => ({ ...p, [i]: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm resize-y"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setAccepted((p) => ({ ...p, [i]: true }))}
                          disabled={skipped[i]}
                          className={[
                            "px-3 py-1.5 rounded-lg text-sm border",
                            accepted[i]
                              ? "bg-emerald-700/30 border-emerald-600 text-emerald-100"
                              : "bg-slate-900/20 border-slate-600 text-slate-200 hover:bg-slate-800/40",
                            skipped[i] ? "opacity-50" : "",
                          ].join(" ")}
                        >
                          {accepted[i] ? "Accepted" : "Accept"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSkipped((p) => ({ ...p, [i]: true }))}
                          disabled={accepted[i]}
                          className={[
                            "px-3 py-1.5 rounded-lg text-sm border",
                            skipped[i]
                              ? "bg-slate-800/60 border-slate-600 text-slate-300"
                              : "bg-slate-900/20 border-slate-600 text-slate-200 hover:bg-slate-800/40",
                            accepted[i] ? "opacity-50" : "",
                          ].join(" ")}
                        >
                          {skipped[i] ? "Skipped" : "Skip"}
                        </button>
                      </div>
                      <p className="text-xs text-slate-500">
                        Tip: accept fewer bullets, but make them strong and specific.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">
                      No strong rewrite suggested for this bullet.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

