"use client";

import { useCallback, useEffect, useState } from "react";
import type { Resume } from "@prisma/client";
import { fetchJson } from "@/lib/fetchJson";
import { getAiSettings } from "@/lib/ai/clientSettings";
import type {
  ResumeDocument,
  ResumeBlock,
  HeaderContent,
  SummaryContent,
  SkillsContent,
  ExperienceItemContent,
  BulletContent,
} from "@/lib/tailor/document";
import {
  documentToPlainText,
  documentToExportPayload,
  createBlockId,
} from "@/lib/tailor/document";

type RefineSuggestion = {
  type: "remove" | "add" | "replace";
  target: string;
  value?: string;
  reason: string;
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
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeId, setResumeId] = useState("");
  const [document, setDocument] = useState<ResumeDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<RefineSuggestion[]>([]);
  const [suggestionStatus, setSuggestionStatus] = useState<Record<number, "accepted" | "denied" | null>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [confirmScore, setConfirmScore] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<"pdf" | "docx">("pdf");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/resumes");
      const data = await fetchJson<Resume[]>(res);
      setResumes(data);
      setResumeId(data[0]?.id || "");
    })().catch(() => {});
  }, []);

  const loadDocument = useCallback(async () => {
    if (!resumeId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tailor/document?jobId=${encodeURIComponent(jobId)}&resumeId=${encodeURIComponent(resumeId)}`
      );
      const data = await fetchJson<{ document: ResumeDocument }>(res);
      if (!res.ok) throw new Error((data as any).error || "Failed to load document");
      setDocument(data.document);
      setSuggestions([]);
      setSuggestionStatus({});
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
            jobDescription: jobDescription.slice(0, 6000),
            resumePlainText: documentToPlainText(document),
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
        const firstItem = expBlock?.children?.[0];
        if (firstItem?.type === "experience_item") {
          const children = firstItem.children || [];
          const newBullet: ResumeBlock = {
            id: createBlockId(),
            type: "bullet",
            content: { text: s.value },
            order: children.length,
          };
          setDocument({
            ...document,
            blocks: updateBlock(firstItem.id, (b) => ({
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
      }
    }
  }

  function denySuggestion(index: number) {
    setSuggestionStatus((p) => ({ ...p, [index]: "denied" }));
  }

  async function confirmAndScore() {
    if (!document || !resumeId) return;
    setError(null);
    try {
      const plain = documentToPlainText(document);
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, resumeId, resumeText: plain }),
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
          name: payload.name,
          summaryLines: payload.summaryLines,
          skills: payload.skills,
          bullets: payload.bullets,
          template: "classic",
          sectionsOrder: ["summary", "skills", "highlights"],
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
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
          disabled={loading}
          className="px-3 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 text-sm"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={refineWithAi}
          disabled={!document || aiLoading}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium"
        >
          {aiLoading ? "Refining…" : "Refine with AI"}
        </button>
        <button
          type="button"
          onClick={confirmAndScore}
          disabled={!document}
          className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium"
        >
          Confirm & recalc score
        </button>
        <select
          value={exportFormat}
          onChange={(e) => setExportFormat(e.target.value as "pdf" | "docx")}
          className="px-2 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
        >
          <option value="pdf">PDF</option>
          <option value="docx">DOCX</option>
        </select>
        <button
          type="button"
          onClick={exportDocument}
          disabled={!document || exporting}
          className="px-4 py-2 rounded-lg bg-slate-100 text-slate-900 hover:bg-white disabled:opacity-50 text-sm font-medium"
        >
          {exporting ? "Exporting…" : "Export"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {confirmScore != null && (
        <p className="text-sm text-emerald-300">New score: {confirmScore}/100</p>
      )}

      {suggestions.length > 0 && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
          <h3 className="font-semibold text-slate-200 mb-2">AI suggestions</h3>
          <ul className="space-y-2">
            {suggestions.map((s, i) => (
              <li
                key={i}
                className={`rounded-lg border p-3 text-sm ${
                  suggestionStatus[i] === "accepted"
                    ? "border-emerald-600/50 bg-emerald-950/20"
                    : suggestionStatus[i] === "denied"
                      ? "border-slate-700/50 bg-slate-900/30 opacity-60"
                      : "border-slate-700/50 bg-slate-800/30"
                }`}
              >
                <p className="text-slate-200">
                  <span className="font-medium capitalize">{s.type}</span>: {s.target}
                </p>
                {s.value && <p className="text-slate-300 mt-1">“{s.value}”</p>}
                <p className="text-slate-400 text-xs mt-1">{s.reason}</p>
                {(suggestionStatus[i] === "accepted" || suggestionStatus[i] === "denied") ? (
                  <span className="text-xs text-slate-500 mt-2 block">
                    {suggestionStatus[i] === "accepted" ? "Accepted" : "Denied"}
                  </span>
                ) : (
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => applySuggestion(i)}
                      className="px-2 py-1 rounded bg-emerald-600 text-white text-xs"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => denySuggestion(i)}
                      className="px-2 py-1 rounded border border-slate-600 text-slate-300 text-xs"
                    >
                      Deny
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {document && (
        <ResumePaper
          document={document}
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
        />
      )}
    </div>
  );
}

type BlockContent = HeaderContent | SummaryContent | SkillsContent | ExperienceItemContent | BulletContent | { title?: string; text?: string };

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
}) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-white text-slate-900 shadow-lg max-w-3xl mx-auto">
      <div className="p-8 min-h-[80vh]">
        {document.blocks.map((block, idx) => (
          <BlockRow
            key={block.id}
            block={block}
            parentBlocks={document.blocks}
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
}) {
  const isDrag = draggingId === block.id;
  const isDrop = dropTargetId === block.id;

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
      className={`group relative ${isDrag ? "opacity-50" : ""} ${isDrop ? "ring-2 ring-emerald-500 rounded" : ""}`}
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
      <div className="grid grid-cols-2 gap-2 text-sm">
        <input
          type="text"
          value={c.title}
          onChange={(e) => setBlockContent(block.id, { ...c, title: e.target.value })}
          className="font-semibold border border-slate-200 rounded px-2 py-1"
          placeholder="Job title"
        />
        <input
          type="text"
          value={c.organization}
          onChange={(e) => setBlockContent(block.id, { ...c, organization: e.target.value })}
          className="border border-slate-200 rounded px-2 py-1"
          placeholder="Company"
        />
        <input
          type="text"
          value={c.location ?? ""}
          onChange={(e) => setBlockContent(block.id, { ...c, location: e.target.value })}
          className="border border-slate-200 rounded px-2 py-1"
          placeholder="Location"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={c.startDate ?? ""}
            onChange={(e) => setBlockContent(block.id, { ...c, startDate: e.target.value })}
            className="border border-slate-200 rounded px-2 py-1"
            placeholder="Start"
          />
          <input
            type="text"
            value={c.endDate ?? ""}
            onChange={(e) => setBlockContent(block.id, { ...c, endDate: e.target.value })}
            className="border border-slate-200 rounded px-2 py-1"
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
