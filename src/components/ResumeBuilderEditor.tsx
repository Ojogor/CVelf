"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";
import type { ResumeTemplate, SectionId } from "@/lib/resume/types";
import { defaultResumeTemplate } from "@/lib/resume/templates";
import type {
  ResumeBlock,
  ResumeDocument,
  HeaderContent,
  SummaryContent,
  SkillsContent,
  ExperienceItemContent,
  ProjectItemContent,
  EducationItemContent,
  BulletContent,
} from "@/lib/tailor/document";
import { createBlockId } from "@/lib/tailor/document";
import { ResumeBlocksEditor } from "@/components/resume/ResumeBlocksEditor";
import { ResumeHtmlPreview } from "@/components/resume/ResumeHtmlPreview";

type BuilderAssembly = {
  version: 1;
  templateName: string;
  sections: SectionId[];
  theme: { primaryColor: string; accentColor: string; backgroundColor: string };
  fontFamily: string;
  fontSize: number;
  document: ResumeDocument;
};

type BlockContent =
  | HeaderContent
  | SummaryContent
  | SkillsContent
  | ExperienceItemContent
  | ProjectItemContent
  | EducationItemContent
  | BulletContent
  | { title?: string; text?: string };

function blankDocument(): ResumeDocument {
  const header: ResumeBlock = {
    id: createBlockId(),
    type: "header",
    order: 0,
    content: { name: "Your Name", email: "", phone: "", address: "", subtitle: "" } as HeaderContent,
  };
  const summary: ResumeBlock = {
    id: createBlockId(),
    type: "summary",
    order: 1,
    content: { text: "Write a short summary (2–3 lines) tailored to your target role." } as SummaryContent,
  };
  const experienceItem: ResumeBlock = {
    id: createBlockId(),
    type: "experience_item",
    order: 0,
    content: { organization: "Company", title: "Role", location: "", startDate: "", endDate: "" } as ExperienceItemContent,
    children: [
      {
        id: createBlockId(),
        type: "bullet",
        order: 0,
        content: { text: "Quantified impact + tech stack + scope." } as BulletContent,
      },
    ],
  };
  const experience: ResumeBlock = {
    id: createBlockId(),
    type: "experience",
    order: 2,
    content: { title: "Experience" },
    children: [experienceItem],
  };
  const skills: ResumeBlock = {
    id: createBlockId(),
    type: "skills",
    order: 3,
    content: { items: ["JavaScript", "TypeScript", "React", "Node.js"] } as SkillsContent,
  };
  return { version: 1, blocks: [header, summary, experience, skills] };
}

export function ResumeBuilderEditor({
  generatedResumeId,
  initialMode,
}: {
  generatedResumeId?: string;
  initialMode?: "edit" | "preview";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<Array<Pick<ResumeTemplate, "templateName" | "layout">>>([]);
  const [templateName, setTemplateName] = useState<string>(defaultResumeTemplate().templateName);
  const [template, setTemplate] = useState<ResumeTemplate>(defaultResumeTemplate());
  const [sections, setSections] = useState<SectionId[]>(defaultResumeTemplate().layout.sections);
  const [fontFamily, setFontFamily] = useState<string>(defaultResumeTemplate().layout.page.fontFamily);
  const [theme, setTheme] = useState<{ primaryColor: string; accentColor: string; backgroundColor: string }>(
    defaultResumeTemplate().layout.theme
  );
  const [fontSize, setFontSize] = useState<number>(defaultResumeTemplate().layout.page.fontSize || 11);
  const [name, setName] = useState<string>("New resume");
  const [exportFormat, setExportFormat] = useState<"pdf" | "docx">("pdf");
  const [viewMode, setViewMode] = useState<"edit" | "preview">(initialMode || "edit");

  const [document, setDocument] = useState<ResumeDocument>(blankDocument());

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/templates/resume");
      const data = await fetchJson<any>(res);
      if (res.ok && Array.isArray(data?.templates)) setTemplates(data.templates);
    })().catch(() => {});
  }, []);

  useEffect(() => {
    if (!generatedResumeId) return;
    setLoading(true);
    setError(null);
    (async () => {
      const res = await fetch(`/api/generated-resumes/${generatedResumeId}`);
      const data = await fetchJson<any>(res);
      if (!res.ok) throw new Error(data?.error || "Failed to load");
      setName(String(data?.name || "Resume"));
      setTemplateName(String(data?.template || defaultResumeTemplate().templateName));
      const parsed = JSON.parse(data?.assemblyJson || "{}");
      if (parsed?.document?.blocks) setDocument(parsed.document as ResumeDocument);
      if (parsed?.sections) setSections(parsed.sections as SectionId[]);
      if (parsed?.theme) setTheme(parsed.theme);
      if (parsed?.fontFamily) setFontFamily(String(parsed.fontFamily));
      if (parsed?.fontSize) setFontSize(Number(parsed.fontSize));
    })()
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [generatedResumeId]);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/templates/resume?templateName=${encodeURIComponent(templateName)}`);
      const data = await fetchJson<any>(res);
      if (res.ok && data?.template) {
        setTemplate(data.template as ResumeTemplate);
        const sec = (data.template?.layout?.sections || []) as SectionId[];
        if (sec?.length) setSections(sec);
        const page = data.template?.layout?.page || {};
        if (page?.fontFamily) setFontFamily(String(page.fontFamily));
        if (page?.fontSize) setFontSize(Number(page.fontSize));
        const th = data.template?.layout?.theme;
        if (th?.primaryColor) setTheme(th);
      }
    })().catch(() => {});
  }, [templateName]);

  function ensureSectionBlock(section: SectionId) {
    const exists =
      section === "projects"
        ? document.blocks.some((b) => b.type === "projects")
        : section === "education"
          ? document.blocks.some((b) => b.type === "education")
          : section === "experience"
            ? document.blocks.some((b) => b.type === "experience")
            : section === "skills"
              ? document.blocks.some((b) => b.type === "skills")
              : section === "header"
                ? document.blocks.some((b) => b.type === "header")
                : false;
    if (exists) return;
    const baseOrder = document.blocks.length;
    if (section === "projects") {
      const projItem: ResumeBlock = {
        id: createBlockId(),
        type: "project_item",
        order: 0,
        content: { name: "Project (edit)", dateRange: "", link: "" } as ProjectItemContent,
        children: [{ id: createBlockId(), type: "bullet", order: 0, content: { text: "Describe what you built." } as BulletContent }],
      };
      setDocument({
        ...document,
        blocks: [...document.blocks, { id: createBlockId(), type: "projects", order: baseOrder, content: { title: "Projects" }, children: [projItem] }],
      });
    } else if (section === "education") {
      const eduItem: ResumeBlock = {
        id: createBlockId(),
        type: "education_item",
        order: 0,
        content: { school: "School (edit)", degree: "", location: "", dateRange: "" } as EducationItemContent,
        children: [{ id: createBlockId(), type: "bullet", order: 0, content: { text: "Honors, coursework, thesis, etc." } as BulletContent }],
      };
      setDocument({
        ...document,
        blocks: [...document.blocks, { id: createBlockId(), type: "education", order: baseOrder, content: { title: "Education" }, children: [eduItem] }],
      });
    }
  }

  function removeSectionBlock(section: SectionId) {
    if (section === "projects") setDocument({ ...document, blocks: document.blocks.filter((b) => b.type !== "projects") });
    if (section === "education") setDocument({ ...document, blocks: document.blocks.filter((b) => b.type !== "education") });
    if (section === "skills") setDocument({ ...document, blocks: document.blocks.filter((b) => b.type !== "skills") });
    if (section === "experience") setDocument({ ...document, blocks: document.blocks.filter((b) => b.type !== "experience") });
    if (section === "header") setDocument({ ...document, blocks: document.blocks.filter((b) => b.type !== "header") });
  }

  const assembly: BuilderAssembly = useMemo(
    () => ({
      version: 1,
      templateName,
      sections,
      theme,
      fontFamily,
      fontSize,
      document,
    }),
    [templateName, sections, theme, fontFamily, fontSize, document]
  );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        name,
        template: templateName,
        assemblyJson: JSON.stringify(assembly),
      };
      const res = await fetch(generatedResumeId ? `/api/generated-resumes/${generatedResumeId}` : "/api/generated-resumes", {
        method: generatedResumeId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await fetchJson<any>(res);
      if (!res.ok) throw new Error(data?.error || "Save failed");
      if (!generatedResumeId) router.push(`/resumes/builder/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteGenerated() {
    if (!generatedResumeId) return;
    const ok = window.confirm("Delete this created resume? This cannot be undone.");
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/generated-resumes/${generatedResumeId}`, { method: "DELETE" });
      const data = await fetchJson<any>(res);
      if (!res.ok) throw new Error(data?.error || "Delete failed");
      router.push("/resumes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  async function exportThis() {
    if (!generatedResumeId) {
      setError("Save this resume first to enable export.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/export/generated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generatedResumeId, exportFormat }),
      });
      if (!res.ok) {
        const body = await fetchJson<any>(res);
        throw new Error(body?.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = globalThis.document.createElement("a");
      a.href = url;
      a.download = `resume.${exportFormat}`;
      globalThis.document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setSaving(false);
    }
  }

  function insertBlock(kind: "header" | "summary" | "highlights" | "skills" | "experience" | "projects" | "education" | "custom") {
    if (kind === "custom") {
      const next: ResumeBlock = {
        id: createBlockId(),
        type: "section",
        order: document.blocks.length,
        content: { title: "Custom section", text: "" },
        children: [{ id: createBlockId(), type: "bullet", order: 0, content: { text: "" } }],
      };
      setDocument({ ...document, blocks: [...document.blocks, next] });
      return;
    }
    if (kind === "highlights") {
      const next: ResumeBlock = {
        id: createBlockId(),
        type: "section",
        order: document.blocks.length,
        content: { title: "Highlights", text: "" },
        children: [{ id: createBlockId(), type: "bullet", order: 0, content: { text: "" } }],
      };
      setDocument({ ...document, blocks: [...document.blocks, next] });
      return;
    }
    const s = kind as SectionId;
    setSections((prev) => (prev.includes(s) ? prev : [...prev, s]));
    ensureSectionBlock(s);
  }

  if (loading) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr] items-start">
      <aside className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-4">
        <div>
          <h2 className="font-semibold">Resume</h2>
          <p className="text-xs text-slate-400 mt-1">Template-based resume stored as normalized JSON.</p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs text-slate-400">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs text-slate-400">Template</label>
          <select
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
          >
            {templates.map((t) => (
              <option key={t.templateName} value={t.templateName}>
                {t.templateName.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-xs text-slate-400">Font</label>
          <select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
          >
            {["Helvetica", "Georgia", "Times New Roman", "Courier New"].map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={9}
              max={15}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-full"
            />
            <span className="text-xs text-slate-400 w-10 text-right">{fontSize}px</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs text-slate-400">Theme</label>
          <div className="grid grid-cols-3 gap-2">
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
              >
                <div className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded" style={{ background: t.primaryColor }} />
                  <span className="h-3 w-3 rounded" style={{ background: t.accentColor }} />
                  <span className="h-3 w-3 rounded border border-slate-700" style={{ background: t.backgroundColor }} />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs text-slate-400">Insert</label>
          <select
            value=""
            onChange={(e) => {
              const v = e.target.value as any;
              if (!v) return;
              insertBlock(v);
              e.currentTarget.value = "";
            }}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
          >
            <option value="">Add a block…</option>
            <option value="header">Header</option>
            <option value="summary">Summary</option>
            <option value="highlights">Highlights</option>
            <option value="skills">Skills</option>
            <option value="experience">Experience</option>
            <option value="projects">Projects</option>
            <option value="education">Education</option>
            <option value="custom">Custom section</option>
          </select>

          <div className="mt-2 flex flex-wrap gap-2">
            {(["header", "summary", "skills", "experience", "projects", "education"] as SectionId[]).map((s) => {
              const on = sections.includes(s);
              if (!on) return null;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSections((prev) => prev.filter((x) => x !== s));
                    removeSectionBlock(s);
                  }}
                  className="px-2 py-1 rounded-full border border-slate-300/20 bg-white/5 text-xs text-slate-200 hover:bg-white/10"
                  title={`Remove ${s}`}
                >
                  <span className="capitalize">{s}</span> <span className="text-slate-300">×</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <div className="grid grid-cols-[1fr_1fr] gap-2">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
            >
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
            </select>
            <button
              type="button"
              onClick={exportThis}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-900 hover:bg-white disabled:opacity-50 text-sm font-medium"
            >
              Export
            </button>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {generatedResumeId && (
            <button
              type="button"
              onClick={deleteGenerated}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-red-700/60 text-red-300 hover:text-red-200 hover:border-red-500 text-sm disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
      </aside>

      <main className="rounded-xl border border-slate-700/50 bg-slate-900/20 p-4">
        <div className="flex items-center justify-end gap-2 mb-3">
          <button
            type="button"
            onClick={() => setViewMode("edit")}
            className={[
              "px-3 py-1.5 rounded-md text-xs border",
              viewMode === "edit" ? "bg-white/10 border-slate-500/60 text-white" : "border-slate-700/60 text-slate-300 hover:text-white",
            ].join(" ")}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setViewMode("preview")}
            className={[
              "px-3 py-1.5 rounded-md text-xs border",
              viewMode === "preview" ? "bg-white/10 border-slate-500/60 text-white" : "border-slate-700/60 text-slate-300 hover:text-white",
            ].join(" ")}
          >
            Preview
          </button>
        </div>

        {viewMode === "preview" ? (
          <ResumeHtmlPreview document={document} theme={theme} fontFamily={fontFamily} fontSize={fontSize} templateName={templateName} />
        ) : (
          <ResumeBlocksEditor
            document={document}
            onChange={setDocument}
            sections={sections}
            theme={theme}
            fontFamily={fontFamily}
            fontSize={fontSize}
          />
        )}
      </main>
    </div>
  );
}
