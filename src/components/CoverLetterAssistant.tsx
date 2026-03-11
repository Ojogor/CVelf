"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { getAiSettings } from "@/lib/ai/clientSettings";
import { defaultResumeTemplate } from "@/lib/resume/templates";
import { renderCoverLetterHtml } from "@/lib/render/coverLetterHtml";

type ResumeOption = {
  kind: "master" | "resume" | "generated";
  id: string;
  name: string;
  updatedAt: string;
  content: string;
  template?: string | null;
};

type CoverLetterResult = {
  subject: string;
  body: string;
  highlights: string[];
  warnings: string[];
};

export function CoverLetterAssistant({ jobId }: { jobId: string }) {
  const [resumes, setResumes] = useState<ResumeOption[]>([]);
  const [resumeId, setResumeId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CoverLetterResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [refining, setRefining] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [fontFamily, setFontFamily] = useState<string>(defaultResumeTemplate().layout.page.fontFamily || "Helvetica");
  const [fontSize, setFontSize] = useState<number>(defaultResumeTemplate().layout.page.fontSize || 11);
  const [theme, setTheme] = useState<{ primaryColor: string; accentColor: string; backgroundColor: string }>(
    defaultResumeTemplate().layout.theme
  );

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/resume-options");
      const items = await fetchJson<ResumeOption[]>(res);
      setResumes(Array.isArray(items) ? items : []);
      setResumeId((Array.isArray(items) && items[0]?.id) || "");
    })().catch(() => {});
  }, []);

  const selectedResume = useMemo(
    () => resumes.find((r) => r.id === resumeId),
    [resumes, resumeId]
  );

  async function generate() {
    if (!resumeId) return;
    setLoading(true);
    setError(null);
    try {
      const opt = resumes.find((r) => r.id === resumeId);
      const res = await fetch("/api/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, resumeId, resumeKind: opt?.kind || "resume" }),
      });
      const body = await fetchJson<any>(res);
      if (!res.ok) throw new Error(body.error || "Generate failed");
      setData(body as CoverLetterResult);
      setDraft((body as CoverLetterResult).body);

      const ai = getAiSettings();
      if (ai.auto && ai.provider !== "local" && ai.apiKey) {
        // Fire-and-forget refinement (best effort); keep tokens low.
        refineWithAi((body as CoverLetterResult).body, ai.provider, ai.apiKey).catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setLoading(false);
    }
  }

  async function refineWithAi(baseDraft: string, provider?: string, apiKey?: string) {
    const ai = provider && apiKey ? { provider, apiKey } : getAiSettings();
    if (!ai.apiKey || ai.provider === "local") {
      setError("AI provider is set to Local or missing API key.");
      return;
    }
    if (!data) {
      // still allow refine right after generate by using baseDraft
    }
    setRefining(true);
    setError(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: ai.provider,
          apiKey: ai.apiKey,
          task: "cover_letter_refine",
          input: {
            draft: baseDraft,
            jobTitle: "", // keep minimal; server doesn't need full job text
            company: "",
            keySkills: [],
            requirements: [],
          },
        }),
      });
      const body = await fetchJson<any>(res);
      if (!res.ok) throw new Error(body?.error || "AI refine failed");
      if (body?.ok === false) throw new Error(body?.error || "AI refine failed");

      const text = String(body.text || "").trim();

      // When Gemini misbehaves we sometimes get back an empty string but no HTTP error.
      // In that case, surface a helpful message instead of silently doing nothing.
      if (!text) {
        const note =
          typeof body.note === "string" && body.note.trim()
            ? body.note.trim()
            : "AI did not return an improved draft. Check your Gemini API key/quota or try again later.";
        setError(note);
        return;
      }

      setDraft(text);
    } finally {
      setRefining(false);
    }
  }

  async function copy() {
    if (!draft.trim()) return;
    try {
      await navigator.clipboard.writeText(draft);
    } catch {
      // ignore
    }
  }

  async function exportPdf() {
    if (!draft.trim()) return;
    setError(null);
    try {
      const res = await fetch("/api/export/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: data?.subject || "", body: draft, theme, fontFamily, fontSize }),
      });
      if (!res.ok) {
        const body = await fetchJson<any>(res);
        throw new Error(body?.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = globalThis.document.createElement("a");
      a.href = url;
      a.download = "cover-letter.pdf";
      globalThis.document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    }
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Cover Letter</h2>
          <p className="text-xs text-slate-400">Generate a clean, realistic draft based on your resume and this posting.</p>
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
            onClick={generate}
            disabled={!resumeId || loading}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium"
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

      {data?.warnings?.length ? (
        <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3">
          <p className="text-xs text-amber-200 font-semibold">Heads up</p>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-amber-100/90">
            {data.warnings.slice(0, 3).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {data && (
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-800/30 border border-slate-700/50 p-3">
            <p className="text-xs text-slate-400">Subject</p>
            <p className="text-sm text-slate-100 mt-1">{data.subject}</p>
          </div>

          <div className="rounded-lg bg-slate-800/30 border border-slate-700/50 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-400">Draft</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={exportPdf}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-900 hover:bg-white"
                >
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={() => refineWithAi(draft)}
                  disabled={refining}
                  className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
                >
                  {refining ? "Refining…" : "Refine with AI"}
                </button>
                <button
                  type="button"
                  onClick={copy}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/60"
                >
                  Copy
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode("edit")}
                  className={[
                    "px-3 py-1.5 rounded-md text-xs border",
                    viewMode === "edit"
                      ? "bg-white/10 border-slate-500/60 text-white"
                      : "border-slate-700/60 text-slate-300 hover:text-white",
                  ].join(" ")}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("preview")}
                  className={[
                    "px-3 py-1.5 rounded-md text-xs border",
                    viewMode === "preview"
                      ? "bg-white/10 border-slate-500/60 text-white"
                      : "border-slate-700/60 text-slate-300 hover:text-white",
                  ].join(" ")}
                >
                  Preview
                </button>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
                >
                  {["Helvetica", "Georgia", "Times New Roman", "Courier New"].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={9}
                    max={15}
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="w-32"
                  />
                  <span className="text-xs text-slate-400 w-10 text-right">{fontSize}px</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {[
                { primaryColor: "#0f172a", accentColor: "#2563eb", backgroundColor: "#ffffff" },
                { primaryColor: "#111827", accentColor: "#10b981", backgroundColor: "#ffffff" },
                { primaryColor: "#0b1320", accentColor: "#f97316", backgroundColor: "#ffffff" },
              ].map((t, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setTheme(t)}
                  className="rounded-lg border border-slate-700/50 bg-slate-800/60 p-2 text-left"
                  title="Theme"
                >
                  <div className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded" style={{ background: t.primaryColor }} />
                    <span className="h-3 w-3 rounded" style={{ background: t.accentColor }} />
                    <span className="h-3 w-3 rounded border border-slate-700" style={{ background: t.backgroundColor }} />
                  </div>
                </button>
              ))}
            </div>

            {viewMode === "preview" ? (
              <div className="rounded-xl border border-slate-700/50 shadow-lg overflow-hidden bg-white">
                <iframe
                  title="Cover letter preview"
                  className="w-full min-h-[70vh]"
                  sandbox="allow-same-origin"
                  srcDoc={renderCoverLetterHtml({ subject: data.subject, body: draft }, { theme, fontFamily, fontSize })}
                />
              </div>
            ) : (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={14}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm resize-y"
              />
            )}
            <p className="text-[11px] text-slate-500">
              Tip: paste the Requirements/Qualifications section (Extract Requirements) for a more targeted draft.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

