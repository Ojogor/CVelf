"use client";

import { useEffect, useMemo, useState } from "react";
import type { Resume } from "@prisma/client";
import { fetchJson } from "@/lib/fetchJson";
import { getAiSettings } from "@/lib/ai/clientSettings";

const TAILOR_CACHE_KEY = "jtp_tailor";
const TAILOR_CACHE_TTL_MS = 30 * 60 * 1000;

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
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [template, setTemplate] = useState<"classic" | "compact">("classic");
  const [sectionsOrder, setSectionsOrder] = useState<Array<"summary" | "skills" | "highlights">>([
    "summary",
    "skills",
    "highlights",
  ]);
  const [draggingSection, setDraggingSection] = useState<"summary" | "skills" | "highlights" | null>(null);

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

  useEffect(() => {
    if (!jobId || !resumeId) return;
    try {
      const raw = sessionStorage.getItem(`${TAILOR_CACHE_KEY}_${jobId}_${resumeId}`);
      if (!raw) return;
      const { result: cached, ts } = JSON.parse(raw);
      if (cached && Date.now() - (ts || 0) <= TAILOR_CACHE_TTL_MS) {
        setResult(cached as TailorResult);
        setError(null);
      }
    } catch {}
  }, [jobId, resumeId]);

  async function run(forceRefresh = false) {
    if (!resumeId) return;
    if (!forceRefresh) {
      try {
        const raw = sessionStorage.getItem(`${TAILOR_CACHE_KEY}_${jobId}_${resumeId}`);
        if (raw) {
          const { result: cached, ts } = JSON.parse(raw);
          if (cached && Date.now() - (ts || 0) <= TAILOR_CACHE_TTL_MS) {
            setResult(cached as TailorResult);
            setEdits({});
            setAccepted({});
            setSkipped({});
            setSummaryIdx(0);
            setError(null);
            return;
          }
        }
      } catch {}
    }
    setLoading(true);
    setError(null);
    try {
      const ai = getAiSettings();
      const payload: { jobId: string; resumeId: string; apiKey?: string } = { jobId, resumeId };
      if (ai.provider === "gemini" && ai.apiKey) payload.apiKey = ai.apiKey;

      const res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await fetchJson<any>(res);
      if (!res.ok) throw new Error(data.error || "Tailor failed");
      const tailorResult = data as TailorResult;
      setResult(tailorResult);
      setEdits({});
      setAccepted({});
      setSkipped({});
      setSummaryIdx(0);
      setAiNote(null);
      try {
        sessionStorage.setItem(
          `${TAILOR_CACHE_KEY}_${jobId}_${resumeId}`,
          JSON.stringify({ result: tailorResult, ts: Date.now() })
        );
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tailor failed");
    } finally {
      setLoading(false);
    }
  }

  async function refineWithAi() {
    const ai = getAiSettings();
    if (ai.provider === "local" || !ai.apiKey) {
      setError("AI provider is set to Local or missing API key.");
      return;
    }
    if (!result) return;
    setAiLoading(true);
    setError(null);
    try {
      // For Gemini, use a text-only refinement mode that is much more tolerant
      // than strict JSON parsing. For future providers we can still use the
      // structured JSON-based endpoint.
      if (ai.provider === "gemini") {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: ai.provider,
            apiKey: ai.apiKey,
            task: "tailor_bullets_refine_text",
            input: {
              bullets: result.bulletSuggestions.slice(0, 10).map((b) => ({
                original: b.original,
                matchedRequirement: b.matchedRequirement || "",
                currentSuggestion: b.suggestion || null,
              })),
            },
          }),
        });
        const body = await fetchJson<any>(res);
        if (!res.ok) throw new Error(body?.error || "AI refine failed");
        if (body?.ok === false) throw new Error(body?.error || "AI refine failed");

        const text = String(body?.text || "").trim();
        if (!text) {
          setAiNote("AI returned no refinements. Check your API key, quota, or try again later.");
          return;
        }

        const lines = text
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);

        if (!lines.length) {
          setAiNote("AI returned no usable bullet rewrites.");
          return;
        }

        let applied = false;
        setEdits((prev) => {
          const next = { ...prev };
          const max = Math.min(lines.length, result.bulletSuggestions.length);
          let lineIdx = 0;
          for (let i = 0; i < max; i++) {
            const suggestionExists = !!result.bulletSuggestions[i]?.suggestion;
            if (!suggestionExists) continue;
            const rewrite = lines[lineIdx++]?.trim();
            if (!rewrite) continue;
            next[i] = rewrite;
            applied = true;
            if (lineIdx >= lines.length) break;
          }
          return next;
        });

        if (applied) {
          setAiNote("AI refinements applied to editable suggestions.");
        } else {
          setAiNote("AI could not suggest better bullet rewrites for the current suggestions.");
        }
      } else {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: ai.provider,
            apiKey: ai.apiKey,
            task: "tailor_bullets_refine",
            input: {
              bullets: result.bulletSuggestions.slice(0, 10).map((b) => ({
                original: b.original,
                matchedRequirement: b.matchedRequirement || "",
                currentSuggestion: b.suggestion || null,
              })),
              jobRequirements: {
                required: result.extracted.jobRequiredSkills,
                preferred: result.extracted.jobPreferredSkills,
                domain: result.extracted.jobDomainContext,
              },
              keySkills: result.suggestedSkillOrder.slice(0, 18),
            },
          }),
        });
        const body = await fetchJson<any>(res);
        if (!res.ok) throw new Error(body?.error || "AI refine failed");
        if (body?.ok === false) throw new Error(body?.error || "AI refine failed");

        const data = body?.data || {};
        const improved = Array.isArray(data.bullets) ? data.bullets : [];

        if (!improved.length) {
          const note =
            typeof data._note === "string" && data._note.trim()
              ? data._note.trim()
              : "AI returned no refinements. Check your API key, quota, or try again later.";
          setAiNote(note);
          return;
        }

        let applied = false;
        setEdits((prev) => {
          const next = { ...prev };
          for (let i = 0; i < improved.length; i++) {
            const rewrite = (improved[i]?.rewrite || "").trim();
            if (!rewrite) continue;
            if (!result.bulletSuggestions[i]?.suggestion) continue;
            next[i] = rewrite;
            applied = true;
          }
          return next;
        });

        if (applied) {
          setAiNote("AI refinements applied to editable suggestions.");
        } else {
          const note =
            typeof data._note === "string" && data._note.trim()
              ? data._note.trim()
              : "AI could not suggest better bullet rewrites with the current provider/key.";
          setAiNote(note);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI refine failed");
    } finally {
      setAiLoading(false);
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
        body: JSON.stringify({
          jobId,
          resumeId,
          chosenSummary,
          acceptedBullets,
          template,
          sectionsOrder,
        }),
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
          <p className="text-xs text-slate-400">
            Start from your master resume, accept the best suggestions, then choose layout and section order.
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
            onClick={() => run()}
            disabled={!resumeId || loading}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            {loading ? "Generating…" : "Generate"}
          </button>
          <button
            type="button"
            onClick={refineWithAi}
            disabled={!result || aiLoading}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            {aiLoading ? "Refining…" : "AI refine"}
          </button>
        </div>
      </div>

      {selectedResume && (
        <p className="text-xs text-slate-500">
          Using resume: <span className="text-slate-300">{selectedResume.name}</span>
        </p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {aiNote && <p className="text-xs text-slate-400">{aiNote}</p>}

      {result && (
        <div className="space-y-3">
          {result.warning && (
            <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3">
              <p className="text-sm text-amber-200">{result.warning}</p>
            </div>
          )}

          <div className="rounded-lg bg-slate-800/30 border border-slate-700/50 p-3">
            <p className="text-xs text-slate-400 mb-2">Key gaps / fast wins</p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {result.fastWins.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-800/30 border border-slate-700/50 p-3 space-y-3">
              <p className="text-xs text-slate-400 mb-1">Step 1 · Tailored summary (pick one)</p>
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
              <div className="rounded-lg bg-slate-900/40 border border-slate-700/60 p-3 space-y-2">
                <p className="text-xs text-slate-400 mb-1">Step 2 · Layout template</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "classic", label: "Classic" },
                    { id: "compact", label: "Compact" },
                  ].map((opt) => {
                    const active = template === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setTemplate(opt.id as "classic" | "compact")}
                        className={[
                          "px-3 py-1.5 rounded-lg text-xs border",
                          active
                            ? "bg-slate-100 text-slate-900 border-slate-100"
                            : "bg-slate-900/40 text-slate-200 border-slate-600 hover:bg-slate-800/60",
                        ].join(" ")}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500">
                  Compact keeps margins tight and fits more on a single page.
                </p>
              </div>
              <div className="rounded-lg bg-slate-900/40 border border-slate-700/60 p-3 space-y-2">
                <p className="text-xs text-slate-400 mb-1">Step 3 · Section order (drag to reorder)</p>
                <div className="flex flex-col gap-2">
                  {sectionsOrder.map((section) => (
                    <div
                      key={section}
                      draggable
                      onDragStart={() => setDraggingSection(section)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!draggingSection || draggingSection === section) return;
                        setSectionsOrder((prev) => {
                          const next = prev.slice();
                          const from = next.indexOf(draggingSection);
                          const to = next.indexOf(section);
                          if (from === -1 || to === -1) return prev;
                          next.splice(from, 1);
                          next.splice(to, 0, draggingSection);
                          return next;
                        });
                        setDraggingSection(null);
                      }}
                      className={[
                        "flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs cursor-move select-none",
                        draggingSection === section
                          ? "border-blue-500 bg-blue-500/20 text-blue-100"
                          : "border-slate-600 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60",
                      ].join(" ")}
                    >
                      <span>
                        {section === "summary"
                          ? "Summary"
                          : section === "skills"
                            ? "Skills"
                            : "Highlights"}
                      </span>
                      <span className="text-[10px] text-slate-400">drag</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">
                  This controls the order of sections in the exported PDF, while keeping formatting consistent.
                </p>
              </div>
              <button
                type="button"
                onClick={exportPdf}
                disabled={exporting}
                className="mt-1 w-full px-4 py-2 rounded-lg bg-slate-100 text-slate-900 hover:bg-white disabled:opacity-50 text-sm font-medium"
              >
                {exporting ? "Exporting…" : "Export tailored PDF (ATS-friendly)"}
              </button>
              <p className="mt-1 text-xs text-slate-500">
                Exports: selected summary + accepted bullets + skills using your chosen layout.
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
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => refineWithAi()}
                          disabled={aiLoading}
                          className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
                        >
                          {aiLoading ? "Refining…" : "Refine with AI"}
                        </button>
                      </div>
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
                        Accept only bullets you’d actually submit.
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

