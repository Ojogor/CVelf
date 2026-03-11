/**
 * Block-based resume document for the tailored resume editor.
 * Each block is drag-and-droppable, editable, and can have nested children.
 */

export type HeaderContent = {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  subtitle?: string;
};

export type SummaryContent = {
  text: string;
};

export type SkillsContent = {
  items: string[];
};

export type ExperienceItemContent = {
  organization: string;
  title: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
};

export type BulletContent = {
  text: string;
};

export type BlockType =
  | "header"
  | "summary"
  | "skills"
  | "experience"
  | "experience_item"
  | "bullet"
  | "section"; // generic section with title + children

export type BlockContent =
  | HeaderContent
  | SummaryContent
  | SkillsContent
  | ExperienceItemContent
  | BulletContent
  | { title?: string; text?: string };

export interface ResumeBlock {
  id: string;
  type: BlockType;
  content: BlockContent;
  children?: ResumeBlock[];
  order?: number;
}

export type ResumeDocument = {
  blocks: ResumeBlock[];
  version?: number;
};

/** Flatten document to plain text for scoring or export. */
export function documentToPlainText(doc: ResumeDocument): string {
  const parts: string[] = [];

  function walk(blocks: ResumeBlock[], indent = "") {
    for (const b of blocks) {
      switch (b.type) {
        case "header": {
          const h = b.content as HeaderContent;
          parts.push(h.name || "");
          if (h.subtitle) parts.push(h.subtitle);
          if (h.email) parts.push(h.email);
          if (h.phone) parts.push(h.phone);
          if (h.address) parts.push(h.address);
          break;
        }
        case "summary": {
          const s = b.content as SummaryContent;
          if (s.text) parts.push(s.text);
          break;
        }
        case "skills": {
          const s = b.content as SkillsContent;
          if (s.items?.length) parts.push(s.items.join(", "));
          break;
        }
        case "experience":
          if (b.children?.length) walk(b.children, indent);
          break;
        case "experience_item": {
          const e = b.content as ExperienceItemContent;
          parts.push(`${e.title} at ${e.organization}`);
          if (e.location) parts.push(e.location);
          if (e.startDate || e.endDate) parts.push([e.startDate, e.endDate].filter(Boolean).join(" – "));
          if (b.children?.length) walk(b.children, indent + "  ");
          break;
        }
        case "bullet": {
          const u = b.content as BulletContent;
          if (u.text) parts.push(`• ${u.text}`);
          break;
        }
        case "section": {
          const s = b.content as { title?: string; text?: string };
          if (s.title) parts.push(s.title);
          if (s.text) parts.push(s.text);
          if (b.children?.length) walk(b.children, indent);
          break;
        }
        default:
          if (b.children?.length) walk(b.children, indent);
      }
    }
  }

  walk(doc.blocks);
  return parts.filter(Boolean).join("\n\n");
}

/** Extract structured data from document for PDF/DOCX export. */
export function documentToExportPayload(
  doc: ResumeDocument,
  meta?: { targetRole?: string; company?: string }
): {
  name: string;
  summaryLines: string[];
  skills: string[];
  bullets: string[];
  experiences: Array<{ title: string; organization: string; location?: string; dateRange: string; bullets: string[] }>;
} {
  let name = "";
  const summaryLines: string[] = [];
  const skills: string[] = [];
  const bullets: string[] = [];
  const experiences: Array<{ title: string; organization: string; location?: string; dateRange: string; bullets: string[] }> = [];

  for (const b of doc.blocks) {
    if (b.type === "header") {
      const h = b.content as HeaderContent;
      name = h.name || "";
    } else if (b.type === "summary") {
      const s = b.content as SummaryContent;
      if (s.text) summaryLines.push(s.text);
    } else if (b.type === "skills") {
      const s = b.content as SkillsContent;
      if (s.items?.length) skills.push(...s.items);
    } else if (b.type === "experience" && b.children?.length) {
      for (const exp of b.children) {
        if (exp.type !== "experience_item") continue;
        const e = exp.content as ExperienceItemContent;
        const dateRange = [e.startDate, e.endDate].filter(Boolean).join(" – ") || "";
        const childBullets = (exp.children || [])
          .filter((c) => c.type === "bullet")
          .map((c) => (c.content as BulletContent).text)
          .filter(Boolean);
        experiences.push({
          title: e.title,
          organization: e.organization,
          location: e.location,
          dateRange,
          bullets: childBullets,
        });
        bullets.push(...childBullets);
      }
    }
  }

  return { name, summaryLines, skills, bullets, experiences };
}

export function createBlockId(): string {
  if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
    return (crypto as any).randomUUID();
  }
  return `b_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
