"use client";

import { useRef, useState } from "react";
import type { SectionId } from "@/lib/resume/types";
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

type BlockContent =
  | HeaderContent
  | SummaryContent
  | SkillsContent
  | ExperienceItemContent
  | ProjectItemContent
  | EducationItemContent
  | BulletContent
  | { title?: string; text?: string };

export function ResumeBlocksEditor({
  document,
  onChange,
  sections,
  theme,
  fontFamily,
  fontSize,
  highlightId,
}: {
  document: ResumeDocument;
  onChange: (doc: ResumeDocument) => void;
  sections: SectionId[];
  theme: { primaryColor: string; accentColor: string; backgroundColor: string };
  fontFamily: string;
  fontSize: number;
  highlightId?: string | null;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  function updateBlock(blockId: string, updater: (b: ResumeBlock) => ResumeBlock, blocks?: ResumeBlock[]): ResumeBlock[] {
    const list = blocks ?? document.blocks ?? [];
    return list.map((b) => {
      if (b.id === blockId) return updater(b);
      if (b.children?.length) return { ...b, children: updateBlock(blockId, updater, b.children) };
      return b;
    });
  }

  function setBlockContent(blockId: string, content: BlockContent) {
    onChange({ ...document, blocks: updateBlock(blockId, (b) => ({ ...b, content })) });
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

  function reorderBlocks(parentBlocks: ResumeBlock[], fromId: string, toId: string, parentId?: string) {
    const list = parentId ? findBlockChildren(document.blocks, parentId) : document.blocks;
    if (!list) return;
    const fromIdx = list.findIndex((b) => b.id === fromId);
    const toIdx = list.findIndex((b) => b.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = list.slice();
    const [removed] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, removed);
    if (parentId) onChange({ ...document, blocks: updateBlock(parentId, (b) => ({ ...b, children: next })) });
    else onChange({ ...document, blocks: next });
  }

  function removeBlock(blockId: string, parentId?: string) {
    if (parentId) {
      const parent = findBlock(document.blocks, parentId);
      if (!parent?.children) return;
      const next = parent.children.filter((b) => b.id !== blockId);
      onChange({ ...document, blocks: updateBlock(parentId, () => ({ ...parent, children: next })) });
      return;
    }
    onChange({ ...document, blocks: document.blocks.filter((b) => b.id !== blockId) });
  }

  function addChildBlock(parentId: string, type: "bullet" | "experience_item" | "project_item" | "education_item") {
    const parent = findBlock(document.blocks, parentId);
    if (!parent) return;
    const siblings = parent.children ?? [];
    const order = siblings.length;
    const newBlock: ResumeBlock =
      type === "bullet"
        ? { id: createBlockId(), type: "bullet", content: { text: "" } as BulletContent, order }
        : type === "experience_item"
          ? {
              id: createBlockId(),
              type: "experience_item",
              content: { organization: "", title: "", startDate: "", endDate: "" } as ExperienceItemContent,
              order,
              children: [],
            }
          : type === "project_item"
            ? {
                id: createBlockId(),
                type: "project_item",
                content: { name: "Project (edit)", dateRange: "", link: "" } as ProjectItemContent,
                order,
                children: [{ id: createBlockId(), type: "bullet", order: 0, content: { text: "" } as BulletContent }],
              }
            : {
                id: createBlockId(),
                type: "education_item",
                content: { school: "School (edit)", degree: "", location: "", dateRange: "" } as EducationItemContent,
                order,
                children: [{ id: createBlockId(), type: "bullet", order: 0, content: { text: "" } as BulletContent }],
              };
    const next = [...siblings, newBlock];
    onChange({ ...document, blocks: updateBlock(parentId, () => ({ ...parent, children: next })) });
  }

  const visibleBlocks = document.blocks.filter((b) => {
    if (b.type === "summary") return true;
    if (b.type === "header") return sections.includes("header");
    if (b.type === "skills") return sections.includes("skills");
    if (b.type === "experience") return sections.includes("experience");
    if (b.type === "projects") return sections.includes("projects");
    if (b.type === "education") return sections.includes("education");
    return true;
  });

  return (
    <div className="space-y-3">
      <div
        className="rounded-xl border border-slate-700/50 shadow-lg max-w-3xl mx-auto"
        style={{
          background: theme?.backgroundColor || "#ffffff",
          color: theme?.primaryColor || "#0f172a",
          fontFamily: fontFamily || "Helvetica",
          fontSize: `${Math.max(9, Math.min(16, fontSize || 11))}px`,
        }}
      >
        <div className="p-8 min-h-[80vh] space-y-5">
          {visibleBlocks.map((block) => (
            <BlockRow
              key={block.id}
              block={block}
              parentBlocks={visibleBlocks}
              parentId={undefined}
              reorderBlocks={reorderBlocks}
              removeBlock={removeBlock}
              addChildBlock={addChildBlock}
              setBlockContent={setBlockContent}
              updateBlock={updateBlock}
              findBlock={findBlock}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
              dropTargetId={dropTargetId}
              setDropTargetId={setDropTargetId}
              highlightId={highlightId || null}
            />
          ))}
        </div>
      </div>

      {/* Canvas-level insert bar to keep editing intuitive and less cluttered */}
      <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-center gap-2 text-xs">
        <span className="text-slate-500 mr-2">Add section</span>
        <button
          type="button"
          onClick={() => addChildBlock(createOrEnsureSection("experience"), "experience_item")}
          className="px-3 py-1.5 rounded-full border border-slate-300/40 bg-slate-900/40 text-slate-100 hover:bg-slate-800/80"
        >
          + Experience
        </button>
        <button
          type="button"
          onClick={() => addChildBlock(createOrEnsureSection("projects"), "project_item")}
          className="px-3 py-1.5 rounded-full border border-slate-300/40 bg-slate-900/40 text-slate-100 hover:bg-slate-800/80"
        >
          + Projects
        </button>
        <button
          type="button"
          onClick={() => addChildBlock(createOrEnsureSection("education"), "education_item")}
          className="px-3 py-1.5 rounded-full border border-slate-300/40 bg-slate-900/40 text-slate-100 hover:bg-slate-800/80"
        >
          + Education
        </button>
        <button
          type="button"
          onClick={() => {
            const id = createOrEnsureCustomSection();
            addChildBlock(id, "bullet");
          }}
          className="px-3 py-1.5 rounded-full border border-slate-300/40 bg-slate-900/40 text-slate-100 hover:bg-slate-800/80"
        >
          + Custom section
        </button>
      </div>
    </div>
  );

  function createOrEnsureSection(section: "experience" | "projects" | "education"): string {
    const existing = document.blocks.find((b) => b.type === section);
    if (existing) return existing.id;
    const order = document.blocks.length;
    if (section === "experience") {
      const block: ResumeBlock = {
        id: createBlockId(),
        type: "experience",
        order,
        content: { title: "Experience" },
        children: [],
      };
      onChange({ ...document, blocks: [...document.blocks, block] });
      return block.id;
    }
    if (section === "projects") {
      const block: ResumeBlock = {
        id: createBlockId(),
        type: "projects",
        order,
        content: { title: "Projects" },
        children: [],
      };
      onChange({ ...document, blocks: [...document.blocks, block] });
      return block.id;
    }
    const block: ResumeBlock = {
      id: createBlockId(),
      type: "education",
      order,
      content: { title: "Education" },
      children: [],
    };
    onChange({ ...document, blocks: [...document.blocks, block] });
    return block.id;
  }

  function createOrEnsureCustomSection(): string {
    const existing = document.blocks.find((b) => b.type === "section");
    if (existing) return existing.id;
    const order = document.blocks.length;
    const block: ResumeBlock = {
      id: createBlockId(),
      type: "section",
      order,
      content: { title: "Custom section", text: "" },
      children: [],
    };
    onChange({ ...document, blocks: [...document.blocks, block] });
    return block.id;
  }
}

function BlockRow({
  block,
  parentBlocks,
  parentId,
  reorderBlocks,
  removeBlock,
  addChildBlock,
  setBlockContent,
  updateBlock,
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
  reorderBlocks: (parentBlocks: ResumeBlock[], fromId: string, toId: string, parentId?: string) => void;
  removeBlock: (blockId: string, parentId?: string) => void;
  addChildBlock: (parentId: string, type: "bullet" | "experience_item" | "project_item" | "education_item") => void;
  setBlockContent: (id: string, c: BlockContent) => void;
  updateBlock: (id: string, fn: (b: ResumeBlock) => ResumeBlock, blocks?: ResumeBlock[]) => ResumeBlock[];
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

  const children = block.children || [];
  const isContainer = block.type === "experience" || block.type === "projects" || block.type === "education" || block.type === "section";
  const isItem = block.type === "experience_item" || block.type === "project_item" || block.type === "education_item";

  const [collapsed, setCollapsed] = useState(false);

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
          <span className="text-xs">⋮⋮</span>
        </div>

        <div className="flex-1 min-w-0">
          {block.type === "header" && (
            <HeaderEditor content={block.content as HeaderContent} onChange={(c) => setBlockContent(block.id, c)} />
          )}
          {block.type === "summary" && (
            <SummaryEditor content={block.content as SummaryContent} onChange={(c) => setBlockContent(block.id, c)} />
          )}
          {block.type === "skills" && (
            <>
              <SectionTitleEditor
                title={(block.content as any)?.title || "Skills"}
                onChange={(t) => setBlockContent(block.id, { ...(block.content as any), title: t })}
              />
              <SkillsEditor content={block.content as SkillsContent} onChange={(c) => setBlockContent(block.id, c)} />
            </>
          )}
          {(block.type === "experience" || block.type === "projects" || block.type === "education") && (
            <div className="flex items-center justify-between">
              <SectionTitleEditor
                title={(block.content as any)?.title || (block.type === "experience" ? "Experience" : block.type === "projects" ? "Projects" : "Education")}
                onChange={(t) => setBlockContent(block.id, { ...(block.content as any), title: t })}
              />
              <button
                type="button"
                onClick={() => setCollapsed((v) => !v)}
                className="ml-2 text-xs text-slate-400 hover:text-slate-100 flex items-center gap-1"
              >
                <span>{collapsed ? "Expand" : "Collapse"}</span>
                <span className={collapsed ? "" : "rotate-90"}>▸</span>
                {children.length > 0 && (
                  <span className="text-[11px] text-slate-500 ml-1">
                    {children.length} {block.type === "experience" ? "roles" : block.type === "projects" ? "projects" : "schools"}
                  </span>
                )}
              </button>
            </div>
          )}
          {block.type === "section" && (
            <CustomSectionEditor
              title={(block.content as any)?.title || "Section"}
              text={(block.content as any)?.text || ""}
              onChange={(next) => setBlockContent(block.id, next)}
            />
          )}
          {block.type === "experience_item" && (
            <ExperienceItemEditor content={block.content as ExperienceItemContent} onChange={(c) => setBlockContent(block.id, c)} />
          )}
          {block.type === "project_item" && (
            <ProjectItemEditor content={block.content as ProjectItemContent} onChange={(c) => setBlockContent(block.id, c)} />
          )}
          {block.type === "education_item" && (
            <EducationItemEditor content={block.content as EducationItemContent} onChange={(c) => setBlockContent(block.id, c)} />
          )}
          {block.type === "bullet" && (
            <BulletEditor content={block.content as BulletContent} onChange={(c) => setBlockContent(block.id, c)} />
          )}

          {isContainer && !collapsed && (
            <div className="mt-2 pl-4 border-l border-slate-200/20 space-y-3">
              {children.map((child) => (
                <BlockRow
                  key={child.id}
                  block={child}
                  parentBlocks={children}
                  parentId={block.id}
                  reorderBlocks={reorderBlocks}
                  removeBlock={removeBlock}
                  addChildBlock={addChildBlock}
                  setBlockContent={setBlockContent}
                  updateBlock={updateBlock}
                  findBlock={findBlock}
                  draggingId={draggingId}
                  setDraggingId={setDraggingId}
                  dropTargetId={dropTargetId}
                  setDropTargetId={setDropTargetId}
                  highlightId={highlightId}
                />
              ))}
              <div className="flex gap-2 py-2">
                {block.type === "section" ? (
                  <button
                    type="button"
                    onClick={() => addChildBlock(block.id, "bullet")}
                    className="px-3 py-1.5 rounded border border-slate-300/30 text-slate-200 text-xs hover:bg-white/5"
                  >
                    Add bullet
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      addChildBlock(
                        block.id,
                        block.type === "experience"
                          ? "experience_item"
                          : block.type === "projects"
                            ? "project_item"
                            : "education_item"
                      )
                    }
                    className="px-3 py-1.5 rounded border border-slate-300/30 text-slate-200 text-xs hover:bg-white/5"
                  >
                    Add item
                  </button>
                )}
              </div>
            </div>
          )}

          {isItem && (
            <div className="mt-2 pl-4">
              {children.map((child) => (
                <BlockRow
                  key={child.id}
                  block={child}
                  parentBlocks={children}
                  parentId={block.id}
                  reorderBlocks={reorderBlocks}
                  removeBlock={removeBlock}
                  addChildBlock={addChildBlock}
                  setBlockContent={setBlockContent}
                  updateBlock={updateBlock}
                  findBlock={findBlock}
                  draggingId={draggingId}
                  setDraggingId={setDraggingId}
                  dropTargetId={dropTargetId}
                  setDropTargetId={setDropTargetId}
                  highlightId={highlightId}
                />
              ))}
              <div className="flex gap-2 py-2">
                <button
                  type="button"
                  onClick={() => addChildBlock(block.id, "bullet")}
                  className="px-3 py-1.5 rounded border border-slate-300/30 text-slate-200 text-xs hover:bg-white/5"
                >
                  Add bullet
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => removeBlock(block.id, parentId)}
          className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 px-2 py-1 rounded bg-slate-100/80 text-slate-700 text-xs"
          title="Delete block"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function HeaderEditor({ content, onChange }: { content: HeaderContent; onChange: (c: HeaderContent) => void }) {
  const chips = ([
    { key: "email", label: "Email", value: content.email || "" },
    { key: "phone", label: "Phone", value: content.phone || "" },
    { key: "address", label: "Location", value: content.address || "" },
    { key: "github", label: "GitHub", value: content.github || "" },
    { key: "linkedin", label: "LinkedIn", value: content.linkedin || "" },
    { key: "website", label: "Website", value: content.website || "" },
  ] as const).filter((c) => c.value.trim().length > 0);

  return (
    <div className="space-y-2">
      <input value={content.name || ""} onChange={(e) => onChange({ ...content, name: e.target.value })} className="w-full bg-transparent text-2xl font-bold outline-none" />
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={String(c.key)}
              type="button"
              onClick={() => onChange({ ...content, [c.key]: "" })}
              className="inline-flex items-center gap-2 px-2 py-1 rounded-full border border-slate-300/20 bg-white/5 text-xs text-slate-200 hover:bg-white/10"
              title={`Remove ${c.label}`}
            >
              <span className="text-slate-400">{c.label}</span>
              <span className="truncate max-w-[220px]">{c.value}</span>
              <span className="text-slate-300">×</span>
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
        <input value={content.email || ""} onChange={(e) => onChange({ ...content, email: e.target.value })} placeholder="Email" className="w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none" />
        <input value={content.phone || ""} onChange={(e) => onChange({ ...content, phone: e.target.value })} placeholder="Phone" className="w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none" />
        <input value={content.address || ""} onChange={(e) => onChange({ ...content, address: e.target.value })} placeholder="Location" className="w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none" />
        <input value={content.subtitle || ""} onChange={(e) => onChange({ ...content, subtitle: e.target.value })} placeholder="Headline" className="w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none" />
        <input value={content.github || ""} onChange={(e) => onChange({ ...content, github: e.target.value })} placeholder="GitHub (optional)" className="w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none" />
        <input value={content.linkedin || ""} onChange={(e) => onChange({ ...content, linkedin: e.target.value })} placeholder="LinkedIn (optional)" className="w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none" />
        <input value={content.website || ""} onChange={(e) => onChange({ ...content, website: e.target.value })} placeholder="Website (optional)" className="w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none md:col-span-2" />
      </div>
    </div>
  );
}

function CustomSectionEditor({
  title,
  text,
  onChange,
}: {
  title: string;
  text: string;
  onChange: (next: { title: string; text?: string }) => void;
}) {
  return (
    <div className="mt-4 mb-1">
      <SectionTitleEditor title={title} onChange={(t) => onChange({ title: t, text })} />
      <textarea
        value={text}
        onChange={(e) => onChange({ title, text: e.target.value })}
        rows={2}
        placeholder="Optional section text…"
        className="mt-2 w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none text-sm resize-y"
      />
    </div>
  );
}

function SummaryEditor({ content, onChange }: { content: SummaryContent; onChange: (c: SummaryContent) => void }) {
  const plain = content.text || "";
  return (
    <div>
      <h3 className="font-semibold tracking-wide text-sm">Summary</h3>
      <RichTextField
        value={content.richText || plain}
        placeholder="Write a 2–3 line summary…"
        onChange={(html, text) => onChange({ ...content, richText: html, text })}
      />
    </div>
  );
}

function SkillsEditor({ content, onChange }: { content: SkillsContent; onChange: (c: SkillsContent) => void }) {
  const text = (content.items || []).join(", ");
  return (
    <div>
      <input
        value={text}
        onChange={(e) =>
          onChange({
            ...content,
            items: e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
        className="mt-2 w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none text-sm"
      />
      <p className="mt-1 text-xs text-slate-400">Comma-separated.</p>
    </div>
  );
}

function SectionTitleEditor({ title, onChange }: { title: string; onChange: (t: string) => void }) {
  return (
    <div className="mt-4 mb-1">
      <input value={title} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent text-sm font-semibold tracking-wide uppercase outline-none" />
      <div className="h-px bg-slate-300/20 mt-1" />
    </div>
  );
}

function ExperienceItemEditor({ content, onChange }: { content: ExperienceItemContent; onChange: (c: ExperienceItemContent) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_120px_120px] gap-2">
      <input value={content.title || ""} onChange={(e) => onChange({ ...content, title: e.target.value })} placeholder="Role" className="w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none text-sm min-w-0" />
      <input value={content.organization || ""} onChange={(e) => onChange({ ...content, organization: e.target.value })} placeholder="Company" className="w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none text-sm min-w-0" />
      <input
        type="month"
        value={content.startDate || ""}
        onChange={(e) => onChange({ ...content, startDate: e.target.value })}
        placeholder="Start"
        className="w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none text-sm min-w-0"
      />
      <input
        type="month"
        value={content.endDate || ""}
        onChange={(e) => onChange({ ...content, endDate: e.target.value })}
        placeholder="End"
        className="w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none text-sm min-w-0"
      />
    </div>
  );
}

function ProjectItemEditor({ content, onChange }: { content: ProjectItemContent; onChange: (c: ProjectItemContent) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_1fr] gap-2">
      <input value={content.name || ""} onChange={(e) => onChange({ ...content, name: e.target.value })} placeholder="Project name" className="w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none text-sm min-w-0" />
      <input value={content.dateRange || ""} onChange={(e) => onChange({ ...content, dateRange: e.target.value })} placeholder="Dates" className="w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none text-sm min-w-0" />
      <input value={content.link || ""} onChange={(e) => onChange({ ...content, link: e.target.value })} placeholder="Link (optional)" className="w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none text-sm min-w-0" />
    </div>
  );
}

function EducationItemEditor({ content, onChange }: { content: EducationItemContent; onChange: (c: EducationItemContent) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_160px] gap-2">
      <input value={content.school || ""} onChange={(e) => onChange({ ...content, school: e.target.value })} placeholder="School" className="w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none text-sm min-w-0" />
      <input value={content.degree || ""} onChange={(e) => onChange({ ...content, degree: e.target.value })} placeholder="Degree" className="w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none text-sm min-w-0" />
      <input
        type="month"
        value={content.dateRange || ""}
        onChange={(e) => onChange({ ...content, dateRange: e.target.value })}
        placeholder="Date"
        className="w-full px-2 py-1 rounded bg-white/5 border border-slate-300/20 outline-none text-sm min-w-0"
      />
    </div>
  );
}

function BulletEditor({ content, onChange }: { content: BulletContent; onChange: (c: BulletContent) => void }) {
  return (
    <div className="flex gap-2 items-start">
      <span className="mt-1 text-slate-300">•</span>
      <RichTextField
        value={content.richText || content.text || ""}
        placeholder="Describe an impact-focused accomplishment…"
        onChange={(html, text) => onChange({ ...content, richText: html, text })}
        small
      />
    </div>
  );
}

type RichTextFieldProps = {
  value: string;
  placeholder?: string;
  small?: boolean;
  onChange: (html: string, plainText: string) => void;
};

function sanitizeHtml(html: string): string {
  const allowedTags = ["strong", "b", "em", "i", "span", "br"];
  if (typeof document === "undefined") return html;
  const div = document.createElement("div");
  div.innerHTML = html;

  const walk = (node: ChildNode) => {
    if (node.nodeType === 1) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (!allowedTags.includes(tag)) {
        const parent = el.parentNode;
        while (el.firstChild) parent?.insertBefore(el.firstChild, el);
        parent?.removeChild(el);
        return;
      }
      if (tag === "span") {
        const size = el.style.fontSize;
        el.removeAttribute("style");
        if (size) el.style.fontSize = size;
      } else {
        el.removeAttribute("style");
      }
      Array.from(el.childNodes).forEach(walk);
    }
  };

  Array.from(div.childNodes).forEach(walk);
  return div.innerHTML;
}

function plainFromHtml(html: string): string {
  if (typeof document === "undefined") return html;
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent?.trim() || "";
}

function RichTextField({ value, placeholder, small, onChange }: RichTextFieldProps) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const [internal, setInternal] = useState<string>(value || "");
  const debounceRef = useRef<number | null>(null);

  // Keep internal HTML in sync when the parent changes the value (e.g. switching resumes)
  if (value !== internal) {
    // Lightweight sync without forcing sanitize on every keystroke
    setInternal(value || "");
  }

  const scheduleChange = (rawHtml: string) => {
    if (typeof window === "undefined") {
      const safe = sanitizeHtml(rawHtml);
      onChange(safe, plainFromHtml(safe));
      return;
    }
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      const safe = sanitizeHtml(rawHtml);
      onChange(safe, plainFromHtml(safe));
      debounceRef.current = null;
    }, 120);
  };

  const apply = (cmd: "bold" | "italic" | "larger" | "smaller") => {
    if (!divRef.current || typeof document === "undefined" || typeof window === "undefined") return;
    divRef.current.focus();
    if (cmd === "larger" || cmd === "smaller") {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) return;
      const span = document.createElement("span");
      span.style.fontSize = cmd === "larger" ? "1.04em" : "0.96em";
      range.surroundContents(span);
    } else {
      document.execCommand(cmd === "bold" ? "bold" : "italic", false);
    }
    const html = divRef.current.innerHTML;
    setInternal(html);
    scheduleChange(html);
  };

  const handleInput = () => {
    if (!divRef.current) return;
    const html = divRef.current.innerHTML;
    // Update local view immediately so typing feels instant; heavy sanitize + parent update are debounced.
    setInternal(html);
    scheduleChange(html);
  };

  const base =
    "mt-2 w-full px-2 py-1 rounded border border-slate-300/20 outline-none bg-white/5 text-sm min-h-[60px]";

  return (
    <div className="w-full">
      <div className="flex gap-1 justify-end text-[11px] text-slate-400">
        <button type="button" onClick={() => apply("bold")} className="px-1.5 py-0.5 rounded hover:bg-white/10 font-semibold">
          B
        </button>
        <button type="button" onClick={() => apply("italic")} className="px-1.5 py-0.5 rounded hover:bg-white/10 italic">
          I
        </button>
        <button type="button" onClick={() => apply("larger")} className="px-1.5 py-0.5 rounded hover:bg-white/10">
          A+
        </button>
        <button type="button" onClick={() => apply("smaller")} className="px-1.5 py-0.5 rounded hover:bg-white/10">
          A-
        </button>
      </div>
      <div
        ref={divRef}
        className={base + (small ? " min-h-[40px]" : "")}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || ""}
        onInput={handleInput}
        onBlur={handleInput}
        dangerouslySetInnerHTML={{ __html: internal || "" }}
        style={{ whiteSpace: "pre-wrap" }}
      />
    </div>
  );
}

