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
  linkedin?: string;
  github?: string;
  website?: string;
};

export type SummaryContent = {
  /** Plain-text summary used for search/scoring. */
  text: string;
  /** Optional rich-text HTML version (bold/italic/size). */
  richText?: string;
};

export type SkillsContent = {
  title?: string;
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

export type ProjectItemContent = {
  name: string;
  dateRange?: string;
  link?: string;
};

export type EducationItemContent = {
  school: string;
  degree?: string;
  location?: string;
  dateRange?: string;
};

export type BulletContent = {
  /** Plain-text bullet used for search/scoring. */
  text: string;
  /** Optional rich-text HTML version (bold/italic/size). */
  richText?: string;
};

export type BlockType =
  | "header"
  | "summary"
  | "skills"
  | "experience"
  | "experience_item"
  | "projects"
  | "project_item"
  | "education"
  | "education_item"
  | "bullet"
  | "section"; // generic section with title + children

export type BlockContent =
  | HeaderContent
  | SummaryContent
  | SkillsContent
  | ExperienceItemContent
  | ProjectItemContent
  | EducationItemContent
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
function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<\/(p|div|li|br)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
          if (h.github) parts.push(h.github);
          if (h.linkedin) parts.push(h.linkedin);
          if (h.website) parts.push(h.website);
          break;
        }
        case "summary": {
          const s = b.content as SummaryContent;
          const txt = s.richText ? stripHtml(s.richText) : s.text;
          if (txt) parts.push(txt);
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
        case "projects":
        case "education":
          if (b.children?.length) walk(b.children, indent);
          break;
        case "project_item": {
          const p = b.content as ProjectItemContent;
          parts.push(p.name || "");
          if (p.dateRange) parts.push(p.dateRange);
          if (p.link) parts.push(p.link);
          if (b.children?.length) walk(b.children, indent + "  ");
          break;
        }
        case "education_item": {
          const e = b.content as EducationItemContent;
          parts.push(e.school || "");
          if (e.degree) parts.push(e.degree);
          if (e.location) parts.push(e.location);
          if (e.dateRange) parts.push(e.dateRange);
          if (b.children?.length) walk(b.children, indent + "  ");
          break;
        }
        case "bullet": {
          const u = b.content as BulletContent;
          const txt = u.richText ? stripHtml(u.richText) : u.text;
          if (txt) parts.push(`• ${txt}`);
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
  contactLine?: string;
  summaryLines: string[];
  skills: string[];
  highlightsBullets: string[];
  experiences: Array<{ title: string; organization: string; location?: string; dateRange: string; bullets: string[] }>;
  projects: Array<{ name: string; dateRange?: string; link?: string; bullets: string[] }>;
  education: Array<{ school: string; degree?: string; location?: string; dateRange?: string; details: string[] }>;
} {
  let name = "";
  let contactLine: string | undefined = undefined;
  const summaryLines: string[] = [];
  const skills: string[] = [];
  const highlightsBullets: string[] = [];
  const experiences: Array<{ title: string; organization: string; location?: string; dateRange: string; bullets: string[] }> = [];
  const projects: Array<{ name: string; dateRange?: string; link?: string; bullets: string[] }> = [];
  const education: Array<{ school: string; degree?: string; location?: string; dateRange?: string; details: string[] }> = [];

  for (const b of doc.blocks) {
    if (b.type === "header") {
      const h = b.content as HeaderContent;
      name = h.name || "";
      const contacts = [h.email, h.phone, h.address, h.github, h.linkedin, h.website]
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean);
      contactLine = contacts.length ? contacts.join(" • ") : undefined;
    } else if (b.type === "summary") {
      const s = b.content as SummaryContent;
      const raw = s.richText ? stripHtml(s.richText) : s.text;
      if (raw) summaryLines.push(raw);
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
      }
    } else if (b.type === "projects" && b.children?.length) {
      for (const it of b.children) {
        if (it.type !== "project_item") continue;
        const p = it.content as ProjectItemContent;
        const childBullets = (it.children || [])
          .filter((c) => c.type === "bullet")
          .map((c) => (c.content as BulletContent).text)
          .filter(Boolean);
        projects.push({
          name: p.name,
          dateRange: p.dateRange,
          link: p.link,
          bullets: childBullets,
        });
      }
    } else if (b.type === "education" && b.children?.length) {
      for (const it of b.children) {
        if (it.type !== "education_item") continue;
        const e = it.content as EducationItemContent;
        const details = (it.children || [])
          .filter((c) => c.type === "bullet")
          .map((c) => (c.content as BulletContent).text)
          .filter(Boolean);
        education.push({
          school: e.school,
          degree: e.degree,
          location: e.location,
          dateRange: e.dateRange,
          details,
        });
      }
    } else if (b.type === "section") {
      const s = b.content as { title?: string; text?: string };
      const title = (s.title || "").trim().toLowerCase();
      if (title === "highlights") {
        const childBullets = (b.children || [])
          .filter((c) => c.type === "bullet")
          .map((c) => (c.content as BulletContent).text)
          .filter(Boolean);
        highlightsBullets.push(...childBullets);
      }
    }
  }

  return { name, contactLine, summaryLines, skills, highlightsBullets, experiences, projects, education };
}

export function createBlockId(): string {
  if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
    return (crypto as any).randomUUID();
  }
  return `b_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
