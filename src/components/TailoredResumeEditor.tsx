"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { getAiSettings } from "@/lib/ai/clientSettings";
import type {
  ResumeDocument,
  ResumeBlock,
  HeaderContent,
  SummaryContent,
  SkillsContent,
  ExperienceItemContent,
  ProjectItemContent,
  EducationItemContent,
  BulletContent,
} from "@/lib/tailor/document";
import {
  documentToPlainText,
  documentToExportPayload,
  createBlockId,
} from "@/lib/tailor/document";
import type { ResumeTemplate, SectionId } from "@/lib/resume/types";
import { defaultResumeTemplate } from "@/lib/resume/templates";
import { ResumeBlocksEditor } from "@/components/resume/ResumeBlocksEditor";
import { ResumeHtmlPreview } from "@/components/resume/ResumeHtmlPreview";

type ResumeOption = {
  kind: "master" | "resume" | "generated";
  id: string;
  name: string;
  updatedAt: string;
  content: string;
  template?: string | null;
};

type RefineSuggestion = {
  type: "remove" | "add" | "replace";
  target: string;
  value?: string;
  reason: string;
  targetInfo?: {
    section?: string;
    company?: string;
    role?: string;
    bulletIndex?: number;
    blockId?: string;
  };
};

export function TailoredResumeEditor({
  jobId,
  jobTitle,
  jobCompany,
  jobDescription,
}: {
  jobId: string;
  jobTitle?: string;
  jobCompany?: string;
  jobDescription?: string;
}) {
  const [resumes, setResumes] = useState<ResumeOption[]>([]);
  const [resumeId, setResumeId] = useState("");
  const [document, setDocument] = useState<ResumeDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<RefineSuggestion[]>([]);
  const [suggestionStatus, setSuggestionStatus] = useState<Record<number, "accepted" | "denied" | null>>({});
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [confirmScore, setConfirmScore] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<"pdf" | "docx">("pdf");
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Array<Pick<ResumeTemplate, "templateName" | "layout">>>([]);
  const [templateName, setTemplateName] = useState<string>(defaultResumeTemplate().templateName);
  const [template, setTemplate] = useState<ResumeTemplate>(defaultResumeTemplate());
  const [sections, setSections] = useState<SectionId[]>(defaultResumeTemplate().layout.sections);
  const [fontFamily, setFontFamily] = useState<string>(defaultResumeTemplate().layout.page.fontFamily);
  const [theme, setTheme] = useState<{ primaryColor: string; accentColor: string; backgroundColor: string }>(
    defaultResumeTemplate().layout.theme
  );
  const [fontSize, setFontSize] = useState<number>(defaultResumeTemplate().layout.page.fontSize || 11);
  const [insertValue, setInsertValue] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/resume-options");
      const data = await fetchJson<ResumeOption[]>(res);
      const items = Array.isArray(data) ? data : [];
      setResumes(items);
      setResumeId(items[0]?.id || "");
    })().catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/templates/resume");
      const data = await fetchJson<any>(res);
      if (res.ok && Array.isArray(data?.templates)) {
        setTemplates(data.templates);
      }
    })().catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      if (!templateName) return;
      const res = await fetch(`/api/templates/resume?templateName=${encodeURIComponent(templateName)}`);
      const data = await fetchJson<any>(res);
      if (!res.ok) return;
      const t = data?.template as ResumeTemplate;
      if (!t?.layout?.page) return;
      setTemplate(t);
      setSections((t.layout.sections || []) as SectionId[]);
      setFontFamily(t.layout.page.fontFamily || "Helvetica");
      setTheme(t.layout.theme || { primaryColor: "#0f172a", accentColor: "#2563eb", backgroundColor: "#ffffff" });
    })().catch(() => {});
  }, [templateName]);

  const selectedResume = useMemo(() => resumes.find((r) => r.id === resumeId) || null, [resumes, resumeId]);

  const experienceIndex = useMemo(() => {
    const map = new Map<string, string>(); // key -> experience_item blockId
    if (!document) return map;
    const expBlock = document.blocks.find((b) => b.type === "experience");
    for (const item of expBlock?.children || []) {
      if (item.type !== "experience_item") continue;
      const c = item.content as ExperienceItemContent;
      const key = `${(c.organization || "").toLowerCase()}|${(c.title || "").toLowerCase()}`;
      map.set(key, item.id);
    }
    return map;
  }, [document]);

  useEffect(() => {
    if (!suggestions.length) return;
    const s = suggestions[Math.min(suggestionIdx, suggestions.length - 1)];
    const info = s?.targetInfo;
    if (!document || !info) return;
    const key = `${(info.company || "").toLowerCase()}|${(info.role || "").toLowerCase()}`;
    const id = info.blockId || (info.company || info.role ? experienceIndex.get(key) : undefined) || null;
    setHighlightId(id);
    if (id) {
      // scroll after paint
      setTimeout(() => {
        const el = globalThis.document.querySelector(`[data-block-id="${CSS.escape(id)}"]`);
        if (el && "scrollIntoView" in el) (el as any).scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  }, [suggestionIdx, suggestions, document, experienceIndex]);

  const loadDocument = useCallback(async () => {
    if (!resumeId) return;
    setLoading(true);
    setError(null);
    try {
      const kind = selectedResume?.kind || "resume";
      const res = await fetch(
        `/api/tailor/document?jobId=${encodeURIComponent(jobId)}&resumeId=${encodeURIComponent(resumeId)}&resumeKind=${encodeURIComponent(kind)}`
      );
      const data = await fetchJson<{ document: ResumeDocument }>(res);
      if (!res.ok) throw new Error((data as any).error || "Failed to load document");
      setDocument(data.document);
      setSuggestions([]);
      setSuggestionStatus({});
      setSuggestionIdx(0);
      setConfirmScore(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load document");
    } finally {
      setLoading(false);
    }
  }, [jobId, resumeId]);

  useEffect(() => {
    if (jobId && resumeId) loadDocument();
  }, [jobId, resumeId, loadDocument]);

  function updateBlock(blockId: string, updater: (b: ResumeBlock) => ResumeBlock, blocks?: ResumeBlock[]): ResumeBlock[] {
    const list = blocks ?? document?.blocks ?? [];
    return list.map((b) => {
      if (b.id === blockId) return updater(b);
      if (b.children?.length) {
        return { ...b, children: updateBlock(blockId, updater, b.children) };
      }
      return b;
    });
  }

  function setBlockContent(blockId: string, content: BlockContent) {
    if (!document) return;
    setDocument({
      ...document,
      blocks: updateBlock(blockId, (b) => ({ ...b, content })),
    });
  }

  function setBlocks(blocks: ResumeBlock[]) {
    if (!document) return;
    setDocument({ ...document, blocks });
  }

  function reorderBlocks(parentBlocks: ResumeBlock[], fromId: string, toId: string, parentId?: string) {
    if (!document) return;
    const list = parentId ? findBlockChildren(document.blocks, parentId) : document.blocks;
    if (!list) return;
    const fromIdx = list.findIndex((b) => b.id === fromId);
    const toIdx = list.findIndex((b) => b.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = list.slice();
    const [removed] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, removed);
    if (parentId) {
      setDocument({
        ...document,
        blocks: updateBlock(parentId, (b) => ({ ...b, children: next })),
      });
    } else {
      setDocument({ ...document, blocks: next });
    }
  }

  function findBlockChildren(blocks: ResumeBlock[], id: string): ResumeBlock[] | null {
    for (const b of blocks) {
      if (b.id === id) return b.children ?? null;
      if (b.children?.length) {
        const found = findBlockChildren(b.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  function addChildBlock(parentId: string, type: "bullet" | "experience_item", afterId?: string) {
    if (!document) return;
    const parent = findBlock(document.blocks, parentId);
    if (!parent) return;
    const newBlock: ResumeBlock =
      type === "bullet"
        ? { id: createBlockId(), type: "bullet", content: { text: "" }, order: (parent.children?.length ?? 0) }
        : {
            id: createBlockId(),
            type: "experience_item",
            content: { organization: "", title: "", startDate: "", endDate: "" },
            order: (parent.children?.length ?? 0),
            children: [],
          };
    const siblings = parent.children ?? [];
    const insertIdx = afterId ? siblings.findIndex((b) => b.id === afterId) + 1 : siblings.length;
    const next = [...siblings.slice(0, insertIdx), newBlock, ...siblings.slice(insertIdx)];
    setDocument({
      ...document,
      blocks: updateBlock(parentId, () => ({ ...parent, children: next })),
    });
  }

  function ensureSectionBlock(section: SectionId) {
    if (!document) return;
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
        content: { name: "Project (edit)", dateRange: "" } as ProjectItemContent,
        children: [
          { id: createBlockId(), type: "bullet", order: 0, content: { text: "Describe what you built and impact." } as BulletContent },
        ],
      };
      setDocument({
        ...document,
        blocks: [
          ...document.blocks,
          { id: createBlockId(), type: "projects", order: baseOrder, content: { title: "Projects" }, children: [projItem] },
        ],
      });
    }
    if (section === "education") {
      const eduItem: ResumeBlock = {
        id: createBlockId(),
        type: "education_item",
        order: 0,
        content: { school: "School (edit)", degree: "", location: "", dateRange: "" } as EducationItemContent,
        children: [
          { id: createBlockId(), type: "bullet", order: 0, content: { text: "Coursework, honors, thesis, etc." } as BulletContent },
        ],
      };
      setDocument({
        ...document,
        blocks: [
          ...document.blocks,
          { id: createBlockId(), type: "education", order: baseOrder, content: { title: "Education" }, children: [eduItem] },
        ],
      });
    }
  }

  function insertBlock(kind: "header" | "summary" | "highlights" | "skills" | "experience" | "projects" | "education" | "custom") {
    if (!document) return;
    if (kind === "custom") {
      const next: ResumeBlock = {
        id: createBlockId(),
        type: "section",
        order: document.blocks.length,
        content: { title: "Custom section", text: "" },
        children: [{ id: createBlockId(), type: "bullet", order: 0, content: { text: "" } as BulletContent }],
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
        children: [{ id: createBlockId(), type: "bullet", order: 0, content: { text: "" } as BulletContent }],
      };
      setDocument({ ...document, blocks: [...document.blocks, next] });
      return;
    }
    const s = kind as SectionId;
    setSections((prev) => (prev.includes(s) ? prev : Array.from(new Set([...prev, s]))));
    ensureSectionBlock(s);
  }

  function findBlock(blocks: ResumeBlock[], id: string): ResumeBlock | null {
    for (const b of blocks) {
      if (b.id === id) return b;
      if (b.children?.length) {
        const found = findBlock(b.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  function removeBlock(blockId: string, parentId?: string) {
    if (!document) return;
    if (parentId) {
      const parent = findBlock(document.blocks, parentId);
      if (!parent?.children) return;
      const next = parent.children.filter((b) => b.id !== blockId);
      setDocument({
        ...document,
        blocks: updateBlock(parentId, () => ({ ...parent, children: next })),
      });
    } else {
      setDocument({
        ...document,
        blocks: document.blocks.filter((b) => b.id !== blockId),
      });
    }
  }

  async function refineWithAi() {
    const ai = getAiSettings();
    if (ai.provider === "local" || !ai.apiKey) {
      setError("Set an AI provider and API key in Settings to use Refine with AI.");
      return;
    }
    if (!document || !jobDescription) {
      setError("Load a resume and ensure the job has a description.");
      return;
    }
    setAiLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: ai.provider,
          apiKey: ai.apiKey,
          task: "resume_refine_suggestions",
          input: {
            jobTitle: jobTitle ?? "",
            company: jobCompany ?? "",
            jobDescription: jobDescription.slice(0, 6000),
            resumePlainText: documentToPlainText(document),
            experienceOutline: (document.blocks.find((b) => b.type === "experience")?.children || [])
              .filter((b) => b.type === "experience_item")
              .map((b) => {
                const c = b.content as ExperienceItemContent;
                const bullets = (b.children || []).filter((x) => x.type === "bullet").length;
                return `${c.organization} — ${c.title} (bullets:${bullets})`;
              })
              .slice(0, 10),
          },
        }),
      });
      const data = await fetchJson<any>(res);
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || "AI refine failed");
      }
      const list = Array.isArray(data?.data?.suggestions) ? data.data.suggestions : [];
      setSuggestions(list);
      setSuggestionStatus({});
      setSuggestionIdx(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refine failed");
    } finally {
      setAiLoading(false);
    }
  }

  function applySuggestion(index: number) {
    const s = suggestions[index];
    if (!s || !document) return;
    setSuggestionStatus((p) => ({ ...p, [index]: "accepted" }));

    const ti = s.targetInfo;
    const targetExperienceId = (() => {
      if (!ti || !document) return null;
      if (ti.blockId) return ti.blockId;
      if (!ti.company && !ti.role) return null;
      const key = `${(ti.company || "").toLowerCase()}|${(ti.role || "").toLowerCase()}`;
      return experienceIndex.get(key) || null;
    })();

    if (s.type === "add" && s.value) {
      const lowerTarget = (s.target || "").toLowerCase();
      if (lowerTarget.includes("skill")) {
        const skillsBlock = document.blocks.find((b) => b.type === "skills");
        if (skillsBlock) {
          const content = skillsBlock.content as SkillsContent;
          setBlockContent(skillsBlock.id, { items: [...(content.items || []), s.value!] });
        }
      } else if (lowerTarget.includes("bullet") || lowerTarget.includes("experience")) {
        const expBlock = document.blocks.find((b) => b.type === "experience");
        const targetItem = targetExperienceId
          ? expBlock?.children?.find((x) => x.id === targetExperienceId)
          : expBlock?.children?.[0];
        if (targetItem?.type === "experience_item") {
          const children = targetItem.children || [];
          const newBullet: ResumeBlock = {
            id: createBlockId(),
            type: "bullet",
            content: { text: s.value },
            order: children.length,
          };
          setDocument({
            ...document,
            blocks: updateBlock(targetItem.id, (b) => ({
              ...b,
              children: [...(b.children || []), newBullet],
            })),
          });
        }
      }
    } else if (s.type === "replace" && s.value) {
      const lowerTarget = (s.target || "").toLowerCase();
      if (lowerTarget.includes("summary")) {
        const summaryBlock = document.blocks.find((b) => b.type === "summary");
        if (summaryBlock) setBlockContent(summaryBlock.id, { text: s.value });
      } else if ((lowerTarget.includes("bullet") || lowerTarget.includes("experience")) && targetExperienceId && ti && Number.isFinite(ti.bulletIndex)) {
        const idx = ti.bulletIndex as number;
        setDocument({
          ...document,
          blocks: updateBlock(targetExperienceId, (b) => {
            const kids = (b.children || []).slice();
            const bulletKids = kids.filter((k) => k.type === "bullet");
            const targetBullet = bulletKids[idx];
            if (!targetBullet) return b;
            return {
              ...b,
              children: kids.map((k) => (k.id === targetBullet.id ? { ...k, content: { text: s.value } as BulletContent } : k)),
            };
          }),
        });
      }
    } else if (s.type === "remove") {
      const lowerTarget = (s.target || "").toLowerCase();
      if ((lowerTarget.includes("bullet") || lowerTarget.includes("experience")) && targetExperienceId && ti && Number.isFinite(ti.bulletIndex)) {
        const idx = ti.bulletIndex as number;
        setDocument({
          ...document,
          blocks: updateBlock(targetExperienceId, (b) => {
            const kids = (b.children || []).slice();
            const bulletKids = kids.filter((k) => k.type === "bullet");
            const targetBullet = bulletKids[idx];
            if (!targetBullet) return b;
            return { ...b, children: kids.filter((k) => k.id !== targetBullet.id) };
          }),
        });
      }
    }

    // advance
    setSuggestionIdx((p) => Math.min((suggestions?.length ?? 1) - 1, p + 1));
  }

  function denySuggestion(index: number) {
    setSuggestionStatus((p) => ({ ...p, [index]: "denied" }));
    setSuggestionIdx((p) => Math.min((suggestions?.length ?? 1) - 1, p + 1));
  }

  async function confirmAndScore() {
    if (!document || !resumeId) return;
    setError(null);
    try {
      const plain = documentToPlainText(document);
      const ai = getAiSettings();
      const kind = selectedResume?.kind as "master" | "resume" | "generated" | undefined;
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          // Always send the tailored plain text; this allows scoring Master or Generated
          // resumes without requiring a backing Resume row.
          resumeText: plain,
          resumeKind: kind,
          apiKey: ai.provider === "gemini" ? ai.apiKey : undefined,
        }),
      });
      const data = await fetchJson<any>(res);
      if (!res.ok) throw new Error(data?.error || "Score failed");
      const result = data?.result ?? data;
      const score = typeof result?.overallScore === "number" ? result.overallScore : null;
      setConfirmScore(score);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Score failed");
    }
  }

  async function prefillFromGeminiOnce() {
    const ai = getAiSettings();
    if (ai.provider !== "gemini" || !ai.apiKey) return;
    if (!selectedResume?.id || !selectedResume?.content) return;
    const cacheKey = `jtp_resume_struct_${selectedResume.id}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        applyStructuredProfile(parsed);
        return;
      }
    } catch {}

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gemini",
          apiKey: ai.apiKey,
          task: "profile_autofill",
          input: { text: selectedResume.content },
        }),
      });
      const body = await fetchJson<any>(res);
      if (!res.ok || body?.ok === false) return;
      try {
        localStorage.setItem(cacheKey, JSON.stringify(body.data));
      } catch {}
      applyStructuredProfile(body.data);
    } catch {}
  }

  function applyStructuredProfile(data: any) {
    if (!document || !data) return;
    const profile = data?.profile || {};
    const skills = data?.skills || {};
    const exps = Array.isArray(data?.experiences) ? data.experiences : [];

    // Header
    const header = document.blocks.find((b) => b.type === "header");
    if (header) {
      const prev = header.content as HeaderContent;
      setBlockContent(header.id, {
        ...prev,
        name: profile.fullName || prev.name,
        email: profile.email || prev.email,
        phone: profile.phone || prev.phone,
        address: [profile.city, profile.region, profile.country].filter(Boolean).join(", ") || prev.address,
        subtitle: profile.headline || prev.subtitle,
      });
    }

    // Skills
    const skillsBlock = document.blocks.find((b) => b.type === "skills");
    const skillItems = Array.from(
      new Set([...(skills.hard || []), ...(skills.tools || []), ...(skills.soft || [])])
    ).slice(0, 30);
    if (skillsBlock && skillItems.length) {
      setBlockContent(skillsBlock.id, { items: skillItems } as SkillsContent);
    }

    // Experience: only replace if we currently have a single placeholder experience
    const expBlock = document.blocks.find((b) => b.type === "experience");
    const hasPlaceholder =
      expBlock?.children?.length === 1 &&
      (expBlock.children?.[0]?.content as any)?.organization?.toLowerCase?.().includes("edit");
    if (expBlock && hasPlaceholder && exps.length) {
      const nextChildren: ResumeBlock[] = exps.slice(0, 6).map((e: any, idx: number) => ({
        id: createBlockId(),
        type: "experience_item",
        order: idx,
        content: {
          organization: String(e.organization || ""),
          title: String(e.title || ""),
          location: e.location ? String(e.location) : undefined,
          startDate: e.startDate ? String(e.startDate) : undefined,
          endDate: e.endDate ? String(e.endDate) : undefined,
          current: Boolean(e.current),
        } as ExperienceItemContent,
        children: (Array.isArray(e.bullets) ? e.bullets : []).slice(0, 10).map((t: any, i: number) => ({
          id: createBlockId(),
          type: "bullet",
          order: i,
          content: { text: String(t || "") } as BulletContent,
        })),
      }));
      setDocument({ ...document, blocks: updateBlock(expBlock.id, (b) => ({ ...b, children: nextChildren })) });
    }
  }

  useEffect(() => {
    // Run once per resume after the document is loaded.
    if (!document || !selectedResume?.id) return;
    prefillFromGeminiOnce().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document?.version, selectedResume?.id]);

  async function exportDocument() {
    if (!document || !resumeId) return;
    setExporting(true);
    setError(null);
    try {
      const payload = documentToExportPayload(document, {
        targetRole: jobTitle,
        company: jobCompany,
      });
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          resumeId,
          document: document,
          exportFormat,
          templateName,
          theme,
          fontFamily,
          fontSize,
          name: payload.name,
          summaryLines: payload.summaryLines,
          skills: payload.skills,
          highlightsBullets: payload.highlightsBullets,
          template: "classic",
          sectionIds: sections,
        }),
      });
      if (!res.ok) {
        const body = await fetchJson<any>(res);
        throw new Error(body?.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = globalThis.document.createElement("a");
      a.href = url;
      a.download = `tailored-resume.${exportFormat}`;
      globalThis.document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (!document && !loading) {
    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
        <p className="text-slate-400">Select a resume and we’ll build your tailored document.</p>
        <div className="mt-3 flex gap-2">
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
            onClick={loadDocument}
            disabled={!resumeId || loading}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            {loading ? "Loading…" : "Build tailored resume"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-4 items-start">
      {/* Left rail: template/style (step 3) + actions */}
      <aside className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-3 lg:sticky lg:top-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Template</p>
          <select
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
          >
            {templates.length === 0 ? (
              <option value={templateName}>{templateName}</option>
            ) : (
              templates.map((t) => (
                <option key={t.templateName} value={t.templateName}>
                  {t.templateName}
                </option>
              ))
            )}
          </select>

          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-2">Theme</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "classicBlue", primaryColor: "#0f172a", accentColor: "#2563eb", backgroundColor: "#ffffff" },
              { id: "emerald", primaryColor: "#064e3b", accentColor: "#10b981", backgroundColor: "#ffffff" },
              { id: "graphite", primaryColor: "#111827", accentColor: "#6b7280", backgroundColor: "#ffffff" },
              { id: "plum", primaryColor: "#3b0764", accentColor: "#a855f7", backgroundColor: "#ffffff" },
              { id: "sand", primaryColor: "#1f2937", accentColor: "#b45309", backgroundColor: "#fff7ed" },
              { id: "slateDark", primaryColor: "#e2e8f0", accentColor: "#38bdf8", backgroundColor: "#0b1220" },
            ].map((p) => {
              const active =
                theme.primaryColor === p.primaryColor &&
                theme.accentColor === p.accentColor &&
                theme.backgroundColor === p.backgroundColor;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTheme({ primaryColor: p.primaryColor, accentColor: p.accentColor, backgroundColor: p.backgroundColor })}
                  className={[
                    "h-9 rounded-lg border flex items-center justify-center",
                    active ? "border-emerald-500" : "border-slate-700/60 hover:border-slate-500",
                  ].join(" ")}
                  title={p.id}
                >
                  <span
                    className="w-5 h-5 rounded-full"
                    style={{ background: `linear-gradient(135deg, ${p.accentColor}, ${p.primaryColor})` }}
                  />
                </button>
              );
            })}
          </div>

          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-2">Font</p>
          <select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
          >
            {["Helvetica", "Georgia", "Times New Roman", "Arial"].map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mt-2">
            Font size
          </label>
          <input
            type="range"
            min={9}
            max={14}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="w-full"
          />

          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-2">Insert</p>
          <select
            value={insertValue}
            onChange={(e) => {
              const v = e.target.value as any;
              setInsertValue("");
              if (!v) return;
              insertBlock(v);
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
              if (!sections.includes(s)) return null;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSections((prev) => prev.filter((x) => x !== s))}
                  className="px-2 py-1 rounded-full border border-slate-300/20 bg-white/5 text-xs text-slate-200 hover:bg-white/10"
                  title={`Hide ${s}`}
                >
                  <span className="capitalize">{s}</span> <span className="text-slate-300">×</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Resume</p>
          <select
            value={resumeId}
            onChange={(e) => setResumeId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
          >
            {resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadDocument}
            disabled={loading}
            className="w-full px-3 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 text-sm"
          >
            {loading ? "Loading…" : "Reload resume"}
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Actions</p>
          <button
            type="button"
            onClick={refineWithAi}
            disabled={!document || aiLoading}
            className="w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            {aiLoading ? "Refining…" : "Refine with AI"}
          </button>
          <button
            type="button"
            onClick={confirmAndScore}
            disabled={!document}
            className="w-full px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            Confirm & recalc score
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Export</p>
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as "pdf" | "docx")}
            className="w-full px-2 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
          >
            <option value="pdf">PDF</option>
            <option value="docx">DOCX</option>
          </select>
          <button
            type="button"
            onClick={exportDocument}
            disabled={!document || exporting}
            className="w-full px-4 py-2 rounded-lg bg-slate-100 text-slate-900 hover:bg-white disabled:opacity-50 text-sm font-medium"
          >
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {confirmScore != null && <p className="text-sm text-emerald-300">New score: {confirmScore}/100</p>}
      </aside>

      {/* Center: resume canvas */}
      <main className="min-w-0">
        {document && (
          <>
            <div className="flex items-center justify-end gap-2 mb-3">
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
                highlightId={highlightId}
              />
            )}
          </>
        )}
      </main>

      {/* Right rail: AI coach (step 5 will make this one-at-a-time) */}
      <aside className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-3 lg:sticky lg:top-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">AI coach</p>
          <p className="text-[11px] text-slate-500">{jobCompany ? `${jobCompany}` : "Job-scoped"}</p>
        </div>

        {suggestions.length === 0 ? (
          <p className="text-sm text-slate-400">
            Click <span className="text-slate-200 font-medium">Refine with AI</span> to get targeted edits for this job.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                Suggestion {Math.min(suggestionIdx + 1, suggestions.length)} / {suggestions.length}
              </span>
              <button
                type="button"
                onClick={() => setSuggestionIdx((p) => Math.min(suggestions.length - 1, p + 1))}
                className="text-slate-300 hover:text-white"
              >
                Next →
              </button>
            </div>

            {(() => {
              const i = Math.min(suggestionIdx, suggestions.length - 1);
              const s = suggestions[i];
              const status = suggestionStatus[i];
              return (
                <div
                  className={`rounded-lg border p-3 text-sm ${
                    status === "accepted"
                      ? "border-emerald-600/50 bg-emerald-950/20"
                      : status === "denied"
                        ? "border-slate-700/50 bg-slate-900/30 opacity-60"
                        : "border-slate-700/50 bg-slate-800/30"
                  }`}
                >
                  <p className="text-slate-200">
                    <span className="font-medium capitalize">{s.type}</span>: {s.target}
                  </p>
                  {s.value && <p className="text-slate-300 mt-1">“{s.value}”</p>}
                  <p className="text-slate-400 text-xs mt-1">{s.reason}</p>

                  {s.targetInfo?.company && (
                    <p className="text-[11px] text-slate-500 mt-2">
                      Target: {s.targetInfo.section || "section"}
                      {s.targetInfo.company ? ` · ${s.targetInfo.company}` : ""}
                      {Number.isFinite(s.targetInfo.bulletIndex) ? ` · bullet #${(s.targetInfo.bulletIndex as number) + 1}` : ""}
                    </p>
                  )}

                  {status === "accepted" || status === "denied" ? (
                    <span className="text-xs text-slate-500 mt-2 block">
                      {status === "accepted" ? "Applied" : "Skipped"}
                    </span>
                  ) : (
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => applySuggestion(i)}
                        className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs"
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={() => denySuggestion(i)}
                        className="px-3 py-1.5 rounded border border-slate-600 text-slate-300 text-xs"
                      >
                        Skip
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </aside>
    </div>
  );
}

type BlockContent =
  | HeaderContent
  | SummaryContent
  | SkillsContent
  | ExperienceItemContent
  | ProjectItemContent
  | EducationItemContent
  | BulletContent
  | { title?: string; text?: string };

function ResumePaper({
  document,
  setDocument,
  updateBlock,
  setBlockContent,
  setBlocks,
  reorderBlocks,
  addChildBlock,
  removeBlock,
  findBlock,
  draggingId,
  setDraggingId,
  dropTargetId,
  setDropTargetId,
  theme,
  fontFamily,
  fontSize,
  highlightId,
  sections,
}: {
  document: ResumeDocument;
  setDocument: (d: ResumeDocument) => void;
  updateBlock: (id: string, fn: (b: ResumeBlock) => ResumeBlock, blocks?: ResumeBlock[]) => ResumeBlock[];
  setBlockContent: (id: string, content: BlockContent) => void;
  setBlocks: (blocks: ResumeBlock[]) => void;
  reorderBlocks: (parentBlocks: ResumeBlock[], fromId: string, toId: string, parentId?: string) => void;
  addChildBlock: (parentId: string, type: "bullet" | "experience_item", afterId?: string) => void;
  removeBlock: (blockId: string, parentId?: string) => void;
  findBlock: (blocks: ResumeBlock[], id: string) => ResumeBlock | null;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  dropTargetId: string | null;
  setDropTargetId: (id: string | null) => void;
  theme: { primaryColor: string; accentColor: string; backgroundColor: string };
  fontFamily: string;
  fontSize: number;
  highlightId: string | null;
  sections: SectionId[];
}) {
  const visibleBlocks = document.blocks.filter((b) => {
    if (b.type === "summary") return true; // always visible for now
    if (b.type === "header") return sections.includes("header");
    if (b.type === "skills") return sections.includes("skills");
    if (b.type === "experience") return sections.includes("experience");
    if (b.type === "projects") return sections.includes("projects");
    if (b.type === "education") return sections.includes("education");
    return true;
  });
  return (
    <div
      className="rounded-xl border border-slate-700/50 shadow-lg max-w-3xl mx-auto"
      style={{
        background: theme?.backgroundColor || "#ffffff",
        color: theme?.primaryColor || "#0f172a",
        fontFamily: fontFamily || "Helvetica",
        fontSize: `${Math.max(9, Math.min(16, fontSize || 11))}px`,
      }}
    >
      <div className="p-8 min-h-[80vh]">
        {visibleBlocks.map((block, idx) => (
          <BlockRow
            key={block.id}
            block={block}
            parentBlocks={visibleBlocks}
            parentId={undefined}
            index={idx}
            setDocument={setDocument}
            updateBlock={updateBlock}
            setBlockContent={setBlockContent}
            setBlocks={setBlocks}
            reorderBlocks={reorderBlocks}
            addChildBlock={addChildBlock}
            removeBlock={removeBlock}
            findBlock={findBlock}
            draggingId={draggingId}
            setDraggingId={setDraggingId}
            dropTargetId={dropTargetId}
            setDropTargetId={setDropTargetId}
            highlightId={highlightId}
          />
        ))}
      </div>
    </div>
  );
}

function BlockRow({
  block,
  parentBlocks,
  parentId,
  index,
  setDocument,
  updateBlock,
  setBlockContent,
  setBlocks,
  reorderBlocks,
  addChildBlock,
  removeBlock,
  findBlock,
  draggingId,
  setDraggingId,
  dropTargetId,
  setDropTargetId,
  highlightId,
}: {
  block: ResumeBlock;
  parentBlocks: ResumeBlock[];
  parentId: string | undefined;
  index: number;
  setDocument: (d: ResumeDocument) => void;
  updateBlock: (id: string, fn: (b: ResumeBlock) => ResumeBlock, blocks?: ResumeBlock[]) => ResumeBlock[];
  setBlockContent: (id: string, content: BlockContent) => void;
  setBlocks: (blocks: ResumeBlock[]) => void;
  reorderBlocks: (parentBlocks: ResumeBlock[], fromId: string, toId: string, parentId?: string) => void;
  addChildBlock: (parentId: string, type: "bullet" | "experience_item", afterId?: string) => void;
  removeBlock: (blockId: string, parentId?: string) => void;
  findBlock: (blocks: ResumeBlock[], id: string) => ResumeBlock | null;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  dropTargetId: string | null;
  setDropTargetId: (id: string | null) => void;
  highlightId: string | null;
}) {
  const isDrag = draggingId === block.id;
  const isDrop = dropTargetId === block.id;
  const isHighlight = highlightId === block.id;

  const handleDragStart = (e: React.DragEvent) => {
    setDraggingId(block.id);
    e.dataTransfer.setData("text/plain", block.id);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggingId && draggingId !== block.id) setDropTargetId(block.id);
  };
  const handleDragLeave = () => setDropTargetId(null);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetId(null);
    const fromId = e.dataTransfer.getData("text/plain");
    if (fromId && fromId !== block.id) reorderBlocks(parentBlocks, fromId, block.id, parentId);
    setDraggingId(null);
  };

  return (
    <div
      data-block-id={block.id}
      className={[
        "group relative transition-shadow",
        isDrag ? "opacity-50" : "",
        isDrop ? "ring-2 ring-emerald-500 rounded" : "",
        isHighlight ? "ring-2 ring-indigo-500 rounded shadow-[0_0_0_6px_rgba(99,102,241,0.15)]" : "",
      ].join(" ")}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-start gap-2">
        <div
          draggable
          onDragStart={handleDragStart}
          onDragEnd={() => setDraggingId(null)}
          className="cursor-grab active:cursor-grabbing mt-1.5 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          title="Drag to reorder"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 6h2v2H8V6zm6 0h2v2h-2V6zm-6 6h2v2H8v-2zm6 0h2v2h-2v-2zm-6 6h2v2H8v-2zm6 0h2v2h-2v-2z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          {block.type === "header" && (
            <HeaderEditor
              content={block.content as HeaderContent}
              onChange={(c) => setBlockContent(block.id, c)}
            />
          )}
          {block.type === "summary" && (
            <SummaryEditor
              content={block.content as SummaryContent}
              onChange={(c) => setBlockContent(block.id, c)}
            />
          )}
          {block.type === "skills" && (
            <SkillsEditor
              content={block.content as SkillsContent}
              onChange={(c) => setBlockContent(block.id, c)}
            />
          )}
          {block.type === "experience" && (
            <ExperienceSectionEditor
              block={block}
              setBlockContent={setBlockContent}
              updateBlock={updateBlock}
              reorderBlocks={reorderBlocks}
              addChildBlock={addChildBlock}
              removeBlock={removeBlock}
              findBlock={findBlock}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
              dropTargetId={dropTargetId}
              setDropTargetId={setDropTargetId}
            />
          )}
          {block.type === "projects" && (
            <ProjectsSectionEditor
              block={block}
              setBlockContent={setBlockContent}
              updateBlock={updateBlock}
              addChildBlock={(parentId) => {
                // Add project item
                const parent = findBlock(parentBlocks, parentId);
                if (!parent) return;
                const item: ResumeBlock = {
                  id: createBlockId(),
                  type: "project_item",
                  order: (parent.children?.length ?? 0),
                  content: { name: "Project (edit)", dateRange: "" } as ProjectItemContent,
                  children: [
                    { id: createBlockId(), type: "bullet", order: 0, content: { text: "Describe what you built and impact." } as BulletContent },
                  ],
                };
                const nextKids = [...(parent.children || []), item];
                setBlockContent(parentId, { ...(parent.content as any) });
                // Use updateBlock on parentId
                (setBlocks as any)(
                  updateBlock(parentId, (b) => ({ ...b, children: nextKids }), parentBlocks)
                );
              }}
            />
          )}
          {block.type === "education" && (
            <EducationSectionEditor
              block={block}
              setBlockContent={setBlockContent}
              updateBlock={updateBlock}
              addChildBlock={(parentId) => {
                const parent = findBlock(parentBlocks, parentId);
                if (!parent) return;
                const item: ResumeBlock = {
                  id: createBlockId(),
                  type: "education_item",
                  order: (parent.children?.length ?? 0),
                  content: { school: "School (edit)", degree: "", location: "", dateRange: "" } as EducationItemContent,
                  children: [
                    { id: createBlockId(), type: "bullet", order: 0, content: { text: "Coursework, honors, thesis, etc." } as BulletContent },
                  ],
                };
                const nextKids = [...(parent.children || []), item];
                (setBlocks as any)(
                  updateBlock(parentId, (b) => ({ ...b, children: nextKids }), parentBlocks)
                );
              }}
            />
          )}
          {block.type === "experience_item" && (
            <ExperienceItemEditor
              block={block}
              setBlockContent={setBlockContent}
              updateBlock={updateBlock}
              reorderBlocks={reorderBlocks}
              addChildBlock={addChildBlock}
              removeBlock={removeBlock}
              findBlock={findBlock}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
              dropTargetId={dropTargetId}
              setDropTargetId={setDropTargetId}
            />
          )}
          {block.type === "project_item" && (
            <ProjectItemEditor
              block={block}
              setBlockContent={setBlockContent}
              addBullet={() => addChildBlock(block.id, "bullet")}
            />
          )}
          {block.type === "education_item" && (
            <EducationItemEditor
              block={block}
              setBlockContent={setBlockContent}
              addBullet={() => addChildBlock(block.id, "bullet")}
            />
          )}
          {block.type === "bullet" && (
            <BulletEditor
              content={block.content as BulletContent}
              onChange={(c) => setBlockContent(block.id, c)}
              onRemove={() => removeBlock(block.id, parentId)}
            />
          )}
        </div>
        {block.type !== "header" && block.type !== "experience" && (
          <button
            type="button"
            onClick={() => removeBlock(block.id, parentId)}
            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 text-xs p-1"
            title="Remove block"
          >
            ×
          </button>
        )}
      </div>
      {block.type === "experience" && block.children?.length ? (
        <div className="ml-6 mt-2 space-y-4 pl-4 border-l-2 border-slate-200">
          {block.children.map((child, i) => (
            <BlockRow
              key={child.id}
              block={child}
              parentBlocks={block.children!}
              parentId={block.id}
              index={i}
              setDocument={setDocument}
              updateBlock={updateBlock}
              setBlockContent={setBlockContent}
              setBlocks={setBlocks}
              reorderBlocks={reorderBlocks}
              addChildBlock={addChildBlock}
              removeBlock={removeBlock}
              findBlock={findBlock}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
              dropTargetId={dropTargetId}
              setDropTargetId={setDropTargetId}
              highlightId={highlightId}
            />
          ))}
          <button
            type="button"
            onClick={() => addChildBlock(block.id, "experience_item")}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            + Add experience
          </button>
        </div>
      ) : block.type === "experience" ? (
        <div className="ml-6 mt-2">
          <button
            type="button"
            onClick={() => addChildBlock(block.id, "experience_item")}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            + Add experience
          </button>
        </div>
      ) : null}
    </div>
  );
}

function HeaderEditor({
  content,
  onChange,
}: {
  content: HeaderContent;
  onChange: (c: HeaderContent) => void;
}) {
  return (
    <div className="mb-4">
      <input
        type="text"
        value={content.name}
        onChange={(e) => onChange({ ...content, name: e.target.value })}
        className="text-2xl font-bold w-full border-0 border-b border-transparent hover:border-slate-300 focus:border-slate-500 focus:ring-0 bg-transparent"
        placeholder="Your name"
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-slate-600">
        <input
          type="text"
          value={content.email ?? ""}
          onChange={(e) => onChange({ ...content, email: e.target.value })}
          className="flex-1 min-w-[120px] border-0 border-b border-transparent hover:border-slate-300 focus:border-slate-500 bg-transparent"
          placeholder="Email"
        />
        <input
          type="text"
          value={content.phone ?? ""}
          onChange={(e) => onChange({ ...content, phone: e.target.value })}
          className="min-w-[100px] border-0 border-b border-transparent hover:border-slate-300 focus:border-slate-500 bg-transparent"
          placeholder="Phone"
        />
        <input
          type="text"
          value={content.address ?? ""}
          onChange={(e) => onChange({ ...content, address: e.target.value })}
          className="flex-1 min-w-[140px] border-0 border-b border-transparent hover:border-slate-300 focus:border-slate-500 bg-transparent"
          placeholder="Address"
        />
      </div>
      {content.subtitle && (
        <input
          type="text"
          value={content.subtitle}
          onChange={(e) => onChange({ ...content, subtitle: e.target.value })}
          className="text-sm text-slate-500 w-full mt-1 border-0 border-b border-transparent hover:border-slate-300 focus:border-slate-500 bg-transparent"
          placeholder="Headline"
        />
      )}
    </div>
  );
}

function SummaryEditor({
  content,
  onChange,
}: {
  content: SummaryContent;
  onChange: (c: SummaryContent) => void;
}) {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Summary</h3>
      <textarea
        value={content.text}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={3}
        className="w-full text-sm border border-slate-200 rounded focus:ring-1 focus:ring-slate-400 focus:border-slate-400"
        placeholder="Professional summary…"
      />
    </div>
  );
}

function SkillsEditor({
  content,
  onChange,
}: {
  content: SkillsContent;
  onChange: (c: SkillsContent) => void;
}) {
  const items = content.items || [];
  const addOne = () => onChange({ items: [...items, ""] });
  const setOne = (i: number, v: string) => {
    const next = items.slice();
    next[i] = v;
    onChange({ items: next });
  };
  const removeOne = (i: number) => {
    const next = items.filter((_, idx) => idx !== i);
    onChange({ items: next });
  };
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Skills</h3>
      <div className="flex flex-wrap gap-2">
        {items.map((s, i) => (
          <span key={i} className="flex items-center gap-1">
            <input
              type="text"
              value={s}
              onChange={(e) => setOne(i, e.target.value)}
              className="w-24 px-2 py-0.5 text-sm border border-slate-200 rounded focus:ring-1 focus:ring-slate-400"
            />
            <button type="button" onClick={() => removeOne(i)} className="text-slate-400 hover:text-red-500 text-xs">
              ×
            </button>
          </span>
        ))}
        <button type="button" onClick={addOne} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-0.5 border border-dashed border-slate-300 rounded">
          + Skill
        </button>
      </div>
    </div>
  );
}

function ExperienceSectionEditor({
  block,
  setBlockContent,
  updateBlock,
  reorderBlocks,
  addChildBlock,
  removeBlock,
  findBlock,
  draggingId,
  setDraggingId,
  dropTargetId,
  setDropTargetId,
}: {
  block: ResumeBlock;
  setBlockContent: (id: string, content: BlockContent) => void;
  updateBlock: (id: string, fn: (b: ResumeBlock) => ResumeBlock, blocks?: ResumeBlock[]) => ResumeBlock[];
  reorderBlocks: (parentBlocks: ResumeBlock[], fromId: string, toId: string, parentId?: string) => void;
  addChildBlock: (parentId: string, type: "bullet" | "experience_item", afterId?: string) => void;
  removeBlock: (blockId: string, parentId?: string) => void;
  findBlock: (blocks: ResumeBlock[], id: string) => ResumeBlock | null;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  dropTargetId: string | null;
  setDropTargetId: (id: string | null) => void;
}) {
  return (
    <div className="mb-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {(block.content as { title?: string }).title || "Experience"}
      </h3>
    </div>
  );
}

function ProjectsSectionEditor({
  block,
  setBlockContent,
  updateBlock,
  addChildBlock,
}: {
  block: ResumeBlock;
  setBlockContent: (id: string, content: BlockContent) => void;
  updateBlock: (id: string, fn: (b: ResumeBlock) => ResumeBlock, blocks?: ResumeBlock[]) => ResumeBlock[];
  addChildBlock: (parentId: string) => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {(block.content as { title?: string }).title || "Projects"}
      </h3>
      <button type="button" onClick={() => addChildBlock(block.id)} className="text-xs text-slate-500 hover:text-slate-700">
        + Project
      </button>
    </div>
  );
}

function EducationSectionEditor({
  block,
  setBlockContent,
  updateBlock,
  addChildBlock,
}: {
  block: ResumeBlock;
  setBlockContent: (id: string, content: BlockContent) => void;
  updateBlock: (id: string, fn: (b: ResumeBlock) => ResumeBlock, blocks?: ResumeBlock[]) => ResumeBlock[];
  addChildBlock: (parentId: string) => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {(block.content as { title?: string }).title || "Education"}
      </h3>
      <button type="button" onClick={() => addChildBlock(block.id)} className="text-xs text-slate-500 hover:text-slate-700">
        + School
      </button>
    </div>
  );
}

function ExperienceItemEditor({
  block,
  setBlockContent,
  updateBlock,
  reorderBlocks,
  addChildBlock,
  removeBlock,
  findBlock,
  draggingId,
  setDraggingId,
  dropTargetId,
  setDropTargetId,
}: {
  block: ResumeBlock;
  setBlockContent: (id: string, content: BlockContent) => void;
  updateBlock: (id: string, fn: (b: ResumeBlock) => ResumeBlock, blocks?: ResumeBlock[]) => ResumeBlock[];
  reorderBlocks: (parentBlocks: ResumeBlock[], fromId: string, toId: string, parentId?: string) => void;
  addChildBlock: (parentId: string, type: "bullet" | "experience_item", afterId?: string) => void;
  removeBlock: (blockId: string, parentId?: string) => void;
  findBlock: (blocks: ResumeBlock[], id: string) => ResumeBlock | null;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  dropTargetId: string | null;
  setDropTargetId: (id: string | null) => void;
}) {
  const c = block.content as ExperienceItemContent;
  return (
    <div className="mb-3">
      <div className="grid grid-cols-2 gap-2 text-sm min-w-0">
        <input
          type="text"
          value={c.title}
          onChange={(e) => setBlockContent(block.id, { ...c, title: e.target.value })}
          className="font-semibold border border-slate-200 rounded px-2 py-1 w-full min-w-0"
          placeholder="Job title"
        />
        <input
          type="text"
          value={c.organization}
          onChange={(e) => setBlockContent(block.id, { ...c, organization: e.target.value })}
          className="border border-slate-200 rounded px-2 py-1 w-full min-w-0"
          placeholder="Company"
        />
        <input
          type="text"
          value={c.location ?? ""}
          onChange={(e) => setBlockContent(block.id, { ...c, location: e.target.value })}
          className="border border-slate-200 rounded px-2 py-1 w-full min-w-0"
          placeholder="Location"
        />
        <div className="flex gap-2 min-w-0">
          <input
            type="text"
            value={c.startDate ?? ""}
            onChange={(e) => setBlockContent(block.id, { ...c, startDate: e.target.value })}
            className="border border-slate-200 rounded px-2 py-1 w-full min-w-0"
            placeholder="Start"
          />
          <input
            type="text"
            value={c.endDate ?? ""}
            onChange={(e) => setBlockContent(block.id, { ...c, endDate: e.target.value })}
            className="border border-slate-200 rounded px-2 py-1 w-full min-w-0"
            placeholder="End"
          />
        </div>
      </div>
      {block.children?.length ? (
        <ul className="mt-2 space-y-1 list-disc pl-5">
          {block.children.map((child, i) =>
            child.type === "bullet" ? (
              <BlockRow
                key={child.id}
                block={child}
                parentBlocks={block.children!}
                parentId={block.id}
                index={i}
                setDocument={() => {}}
                updateBlock={updateBlock}
                setBlockContent={setBlockContent}
                setBlocks={() => {}}
                reorderBlocks={reorderBlocks}
                addChildBlock={addChildBlock}
                removeBlock={removeBlock}
                findBlock={findBlock}
                draggingId={draggingId}
                setDraggingId={setDraggingId}
                dropTargetId={dropTargetId}
                setDropTargetId={setDropTargetId}
                highlightId={null}
              />
            ) : null
          )}
        </ul>
      ) : null}
      <button
        type="button"
        onClick={() => addChildBlock(block.id, "bullet")}
        className="text-xs text-slate-500 hover:text-slate-700 mt-1"
      >
        + Bullet
      </button>
    </div>
  );
}

function ProjectItemEditor({
  block,
  setBlockContent,
  addBullet,
}: {
  block: ResumeBlock;
  setBlockContent: (id: string, content: BlockContent) => void;
  addBullet: () => void;
}) {
  const c = block.content as ProjectItemContent;
  return (
    <div className="mb-3">
      <div className="grid grid-cols-2 gap-2 text-sm min-w-0">
        <input
          type="text"
          value={c.name || ""}
          onChange={(e) => setBlockContent(block.id, { ...c, name: e.target.value })}
          className="font-semibold border border-slate-200 rounded px-2 py-1 w-full min-w-0"
          placeholder="Project name"
        />
        <input
          type="text"
          value={c.dateRange ?? ""}
          onChange={(e) => setBlockContent(block.id, { ...c, dateRange: e.target.value })}
          className="border border-slate-200 rounded px-2 py-1 w-full min-w-0"
          placeholder="Date range"
        />
        <input
          type="text"
          value={c.link ?? ""}
          onChange={(e) => setBlockContent(block.id, { ...c, link: e.target.value })}
          className="border border-slate-200 rounded px-2 py-1 w-full min-w-0 col-span-2"
          placeholder="Link (optional)"
        />
      </div>
      <button type="button" onClick={addBullet} className="text-xs text-slate-500 hover:text-slate-700 mt-1">
        + Bullet
      </button>
    </div>
  );
}

function EducationItemEditor({
  block,
  setBlockContent,
  addBullet,
}: {
  block: ResumeBlock;
  setBlockContent: (id: string, content: BlockContent) => void;
  addBullet: () => void;
}) {
  const c = block.content as EducationItemContent;
  return (
    <div className="mb-3">
      <div className="grid grid-cols-2 gap-2 text-sm min-w-0">
        <input
          type="text"
          value={c.school || ""}
          onChange={(e) => setBlockContent(block.id, { ...c, school: e.target.value })}
          className="font-semibold border border-slate-200 rounded px-2 py-1 w-full min-w-0"
          placeholder="School"
        />
        <input
          type="text"
          value={c.degree ?? ""}
          onChange={(e) => setBlockContent(block.id, { ...c, degree: e.target.value })}
          className="border border-slate-200 rounded px-2 py-1 w-full min-w-0"
          placeholder="Degree"
        />
        <input
          type="text"
          value={c.location ?? ""}
          onChange={(e) => setBlockContent(block.id, { ...c, location: e.target.value })}
          className="border border-slate-200 rounded px-2 py-1 w-full min-w-0"
          placeholder="Location"
        />
        <input
          type="text"
          value={c.dateRange ?? ""}
          onChange={(e) => setBlockContent(block.id, { ...c, dateRange: e.target.value })}
          className="border border-slate-200 rounded px-2 py-1 w-full min-w-0"
          placeholder="Date range"
        />
      </div>
      <button type="button" onClick={addBullet} className="text-xs text-slate-500 hover:text-slate-700 mt-1">
        + Detail
      </button>
    </div>
  );
}

function BulletEditor({
  content,
  onChange,
  onRemove,
}: {
  content: BulletContent;
  onChange: (c: BulletContent) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-2 items-start">
      <span className="text-slate-400 mt-0.5">•</span>
      <input
        type="text"
        value={content.text}
        onChange={(e) => onChange({ text: e.target.value })}
        className="flex-1 text-sm border border-slate-200 rounded px-2 py-1"
        placeholder="Achievement or responsibility…"
      />
      <button type="button" onClick={onRemove} className="text-slate-400 hover:text-red-500 text-xs">
        ×
      </button>
    </div>
  );
}
