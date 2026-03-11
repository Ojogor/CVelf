import type { ResumeData, ResumeExperienceItem, ResumeSkillCategory, ResumeTemplate } from "./types";
import type {
  ResumeBlock,
  ResumeDocument,
  HeaderContent,
  SummaryContent,
  SkillsContent,
  ExperienceItemContent,
  BulletContent,
} from "@/lib/tailor/document";
import { createBlockId } from "@/lib/tailor/document";

export function documentToResumeData(doc: ResumeDocument): ResumeData {
  const profile: any = { fullName: "" };
  let summary: string | undefined;
  const experiences: ResumeExperienceItem[] = [];
  let skills: string[] = [];

  for (const b of doc.blocks) {
    if (b.type === "header") {
      const h = b.content as HeaderContent;
      profile.fullName = h.name || "";
      profile.email = h.email;
      profile.phone = h.phone;
      profile.location = h.address;
      profile.headline = h.subtitle;
    }
    if (b.type === "summary") {
      const s = b.content as SummaryContent;
      summary = (s.text || "").trim() || undefined;
    }
    if (b.type === "skills") {
      const s = b.content as SkillsContent;
      skills = Array.isArray(s.items) ? s.items : [];
    }
    if (b.type === "experience" && b.children?.length) {
      for (const exp of b.children) {
        if (exp.type !== "experience_item") continue;
        const e = exp.content as ExperienceItemContent;
        const bullets = (exp.children || [])
          .filter((c) => c.type === "bullet")
          .map((c) => (c.content as BulletContent).text)
          .filter(Boolean);
        experiences.push({
          id: exp.id,
          company: e.organization || "",
          role: e.title || "",
          location: e.location,
          startDate: e.startDate,
          endDate: e.endDate,
          current: e.current,
          bullets,
        });
      }
    }
  }

  return {
    profile,
    summary,
    experiences,
    skills,
  };
}

export function resumeDataToDocument(resumeData: ResumeData, template?: ResumeTemplate): ResumeDocument {
  const blocks: ResumeBlock[] = [];
  blocks.push({
    id: createBlockId(),
    type: "header",
    content: {
      name: resumeData.profile.fullName || "Your Name",
      email: resumeData.profile.email,
      phone: resumeData.profile.phone,
      address: resumeData.profile.location,
      subtitle: resumeData.profile.headline,
    } satisfies HeaderContent,
    order: 0,
  });

  if (resumeData.summary) {
    blocks.push({
      id: createBlockId(),
      type: "summary",
      content: { text: resumeData.summary } satisfies SummaryContent,
      order: 1,
    });
  }

  const flatSkills = Array.isArray(resumeData.skills)
    ? typeof resumeData.skills[0] === "string"
      ? (resumeData.skills as string[])
      : (resumeData.skills as ResumeSkillCategory[]).flatMap((c) => c.items)
    : [];

  blocks.push({
    id: createBlockId(),
    type: "skills",
    content: { items: flatSkills } satisfies SkillsContent,
    order: 2,
  });

  const expBlock: ResumeBlock = {
    id: createBlockId(),
    type: "experience",
    content: { title: "Experience" },
    order: 3,
    children: [],
  };

  expBlock.children = (resumeData.experiences || []).map((e, idx) => ({
    id: createBlockId(),
    type: "experience_item",
    order: idx,
    content: {
      organization: e.company,
      title: e.role,
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate,
      current: Boolean(e.current),
    } satisfies ExperienceItemContent,
    children: (e.bullets || []).map((t, i) => ({
      id: createBlockId(),
      type: "bullet",
      order: i,
      content: { text: t } satisfies BulletContent,
    })),
  }));

  blocks.push(expBlock);

  return { blocks, version: 1 };
}

