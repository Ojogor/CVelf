import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildJsonOnlyPrompt, callGeminiWithSchema } from "@/lib/ai/gemini";
import { createBlockId } from "@/lib/tailor/document";
import { parseResume } from "@/lib/ats/parse";
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
import type { SectionId } from "@/lib/resume/types";
import { defaultResumeTemplate, getResumeTemplate } from "@/lib/resume/templates";
import { ingestGeneratedResumeToMasterExperience } from "@/lib/experience/ingestGenerated";

export const runtime = "nodejs";

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function mapProfileOut(obj: any) {
  const toStr = (v: any) => (typeof v === "string" ? v.trim() : "");
  const arr = (v: any) => (Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : []);

  const profileRaw = obj?.profile ?? {};
  const skillsRaw = obj?.skills ?? {};
  const expsRaw = Array.isArray(obj?.experiences) ? obj.experiences : [];

  const profile = {
    fullName: toStr(profileRaw.fullName ?? profileRaw.name),
    email: toStr(profileRaw.email),
    phone: toStr(profileRaw.phone),
    city: toStr(profileRaw.city),
    region: toStr(profileRaw.region),
    country: toStr(profileRaw.country),
    headline: toStr(profileRaw.headline ?? profileRaw.title),
    linkedin: toStr(profileRaw.linkedin),
    github: toStr(profileRaw.github),
    website: toStr(profileRaw.website),
  };

  const skills = {
    hard: arr(skillsRaw.hard),
    soft: arr(skillsRaw.soft),
    tools: arr(skillsRaw.tools),
  };

  const experiences = expsRaw
    .map((e: any) => ({
      type: toStr(e.type || "job"),
      organization: toStr(e.organization),
      title: toStr(e.title),
      location: toStr(e.location),
      startDate: toStr(e.startDate),
      endDate: toStr(e.endDate),
      current: Boolean(e.current),
      bullets: arr(e.bullets),
      skills: arr(e.skills),
    }))
    .filter((e: any) => e.organization || e.title || e.bullets.length);

  return { profile, skills, experiences };
}

function buildDocumentFromProfile(input: ReturnType<typeof mapProfileOut>, opts: { sections: SectionId[] }): ResumeDocument {
  const blocks: ResumeBlock[] = [];

  const header: ResumeBlock = {
    id: createBlockId(),
    type: "header",
    order: 0,
    content: {
      name: input.profile.fullName || "Your Name",
      email: input.profile.email || undefined,
      phone: input.profile.phone || undefined,
      address: [input.profile.city, input.profile.region, input.profile.country].filter(Boolean).join(", ") || undefined,
      subtitle: input.profile.headline || undefined,
    } as HeaderContent,
  };
  blocks.push(header);

  // Skills
  const skillItems = Array.from(new Set([...(input.skills.hard || []), ...(input.skills.tools || []), ...(input.skills.soft || [])]))
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
  if (opts.sections.includes("skills")) {
    blocks.push({
      id: createBlockId(),
      type: "skills",
      order: blocks.length,
      content: { items: skillItems } as SkillsContent,
    });
  }

  const exps: Array<{
    type: string;
    organization: string;
    title: string;
    location: string;
    startDate: string;
    endDate: string;
    current: boolean;
    bullets: string[];
    skills: string[];
  }> = input.experiences || [];
  const toLower = (s: string) => s.toLowerCase();
  const isProject = (t: string) => toLower(t).includes("project");
  const isEdu = (t: string) => toLower(t).includes("education") || toLower(t).includes("cert") || toLower(t).includes("course");

  const expItems = exps.filter((e: (typeof exps)[number]) => !isProject(e.type) && !isEdu(e.type));
  const projItems = exps.filter((e: (typeof exps)[number]) => isProject(e.type));
  const eduItems = exps.filter((e: (typeof exps)[number]) => isEdu(e.type));

  if (opts.sections.includes("experience")) {
    blocks.push({
      id: createBlockId(),
      type: "experience",
      order: blocks.length,
      content: { title: "Experience" },
      children: expItems.slice(0, 8).map((e, idx) => ({
        id: createBlockId(),
        type: "experience_item",
        order: idx,
        content: {
          organization: e.organization,
          title: e.title,
          location: e.location || undefined,
          startDate: e.startDate || undefined,
          endDate: e.current ? "Present" : e.endDate || undefined,
          current: Boolean(e.current),
        } as ExperienceItemContent,
        children: (e.bullets || []).slice(0, 10).map((t, i) => ({
          id: createBlockId(),
          type: "bullet",
          order: i,
          content: { text: t } as BulletContent,
        })),
      })),
    });
  }

  if (opts.sections.includes("projects") && projItems.length) {
    blocks.push({
      id: createBlockId(),
      type: "projects",
      order: blocks.length,
      content: { title: "Projects" },
      children: projItems.slice(0, 6).map((p, idx) => ({
        id: createBlockId(),
        type: "project_item",
        order: idx,
        content: { name: p.organization || p.title || "Project", dateRange: "" } as ProjectItemContent,
        children: (p.bullets || []).slice(0, 8).map((t, i) => ({
          id: createBlockId(),
          type: "bullet",
          order: i,
          content: { text: t } as BulletContent,
        })),
      })),
    });
  }

  if (opts.sections.includes("education") && eduItems.length) {
    blocks.push({
      id: createBlockId(),
      type: "education",
      order: blocks.length,
      content: { title: "Education" },
      children: eduItems.slice(0, 6).map((e, idx) => ({
        id: createBlockId(),
        type: "education_item",
        order: idx,
        content: { school: e.organization || "School", degree: e.title || "", location: e.location || "", dateRange: "" } as EducationItemContent,
        children: (e.bullets || []).slice(0, 6).map((t, i) => ({
          id: createBlockId(),
          type: "bullet",
          order: i,
          content: { text: t } as BulletContent,
        })),
      })),
    });
  }

  return { version: 1, blocks };
}

function buildDocumentFromLocalParsed(
  parsed: ReturnType<typeof parseResume>,
  opts: { sections: SectionId[] }
): ResumeDocument {
  const blocks: ResumeBlock[] = [];
  const header: ResumeBlock = {
    id: createBlockId(),
    type: "header",
    order: 0,
    content: { name: parsed.headline || "Your Name" } as HeaderContent,
  };
  blocks.push(header);

  if (parsed.summary) {
    blocks.push({
      id: createBlockId(),
      type: "summary",
      order: blocks.length,
      content: { text: parsed.summary } as SummaryContent,
    });
  } else {
    blocks.push({
      id: createBlockId(),
      type: "summary",
      order: blocks.length,
      content: { text: "" } as SummaryContent,
    });
  }

  if (opts.sections.includes("skills")) {
    blocks.push({
      id: createBlockId(),
      type: "skills",
      order: blocks.length,
      content: { items: (parsed.skills || []).slice(0, 40) } as SkillsContent,
    });
  }

  if (opts.sections.includes("experience")) {
    const expItem: ResumeBlock = {
      id: createBlockId(),
      type: "experience_item",
      order: 0,
      content: { organization: "", title: "", startDate: "", endDate: "" } as ExperienceItemContent,
      children: (parsed.experienceBullets || []).slice(0, 12).map((t, i) => ({
        id: createBlockId(),
        type: "bullet",
        order: i,
        content: { text: t } as BulletContent,
      })),
    };
    blocks.push({
      id: createBlockId(),
      type: "experience",
      order: blocks.length,
      content: { title: "Experience" },
      children: [expItem],
    });
  }

  if (opts.sections.includes("projects") && (parsed.projectBullets || []).length) {
    const projItem: ResumeBlock = {
      id: createBlockId(),
      type: "project_item",
      order: 0,
      content: { name: "Project", dateRange: "", link: "" } as ProjectItemContent,
      children: (parsed.projectBullets || []).slice(0, 10).map((t, i) => ({
        id: createBlockId(),
        type: "bullet",
        order: i,
        content: { text: t } as BulletContent,
      })),
    };
    blocks.push({
      id: createBlockId(),
      type: "projects",
      order: blocks.length,
      content: { title: "Projects" },
      children: [projItem],
    });
  }

  return { version: 1, blocks };
}

function buildProfileAutofillPrompt(text: string) {
  return buildJsonOnlyPrompt(
    [
      "Extract a career profile from the input text into JSON.",
      "Return exactly one JSON object with top-level keys: profile, skills, experiences.",
      "profile object:",
      "{",
      '  "fullName": string,',
      '  "email": string,',
      '  "phone": string,',
      '  "city": string,',
      '  "region": string,',
      '  "country": string,',
      '  "headline": string,',
      '  "linkedin": string,',
      '  "github": string,',
      '  "website": string',
      "}",
      "skills object:",
      "{",
      '  "hard": [string],',
      '  "soft": [string],',
      '  "tools": [string]',
      "}",
      "experiences array of objects:",
      "{",
      '  "type": string,',
      '  "organization": string,',
      '  "title": string,',
      '  "location": string,',
      '  "startDate": string,',
      '  "endDate": string,',
      '  "current": boolean,',
      '  "bullets": [string],',
      '  "skills": [string]',
      "}",
      "type examples: job, internship, volunteering, project, education, certification, course.",
      "Dates should be short strings like '2021-03' or 'Present'.",
      "Bullets must come only from the input; do not invent technologies or achievements.",
      "Keep strings concise; no markdown; no extra top-level keys.",
    ].join("\n"),
    { t: asString(text).slice(0, 12000) }
  );
}

async function findExistingGeneratedBySourceResumeId(sourceResumeId: string) {
  const existing = await prisma.generatedResume.findMany({ select: { id: true, assemblyJson: true } });
  for (const gr of existing) {
    try {
      const parsed = JSON.parse(gr.assemblyJson || "{}");
      if (parsed?.source?.resumeId === sourceResumeId) return gr.id;
    } catch {}
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const apiKey = asString(body?.apiKey).trim();
    const resumeId = body?.resumeId ? String(body.resumeId) : null;
    const templateName = String(body?.templateName || defaultResumeTemplate().templateName);
    const template = getResumeTemplate(templateName) || defaultResumeTemplate();
    const sections = (template.layout.sections || []) as SectionId[];

    const resumes = resumeId
      ? await prisma.resume.findMany({ where: { id: resumeId } })
      : await prisma.resume.findMany({ orderBy: { createdAt: "desc" } });

    const results: Array<{ resumeId: string; ok: boolean; generatedResumeId?: string; error?: string }> = [];

    for (const r of resumes) {
      if (!r.content || !String(r.content).trim()) {
        results.push({ resumeId: r.id, ok: false, error: "Resume has no content" });
        continue;
      }
      const already = await findExistingGeneratedBySourceResumeId(r.id);
      if (already) {
        results.push({ resumeId: r.id, ok: true, generatedResumeId: already });
        continue;
      }

      let document: ResumeDocument;
      let used: "gemini" | "local" = "local";

      if (apiKey) {
        const prompt = buildProfileAutofillPrompt(String(r.content));
        const ai = await callGeminiWithSchema(apiKey, prompt, mapProfileOut, {
          maxOutputTokens: 900,
          model: "models/gemini-2.5-flash-lite",
          seedJson: true,
          validate: (v) => {
            const exp = (v.experiences || []).length;
            if (exp === 0) return "AI returned no experiences.";
            return null;
          },
        });
        if (!ai.ok) {
          // fallback to local parsing if Gemini fails
          const parsed = parseResume(String(r.content));
          document = buildDocumentFromLocalParsed(parsed, { sections });
          used = "local";
        } else {
          document = buildDocumentFromProfile(ai.data, { sections });
          used = "gemini";
        }
      } else {
        const parsed = parseResume(String(r.content));
        document = buildDocumentFromLocalParsed(parsed, { sections });
        used = "local";
      }

      const assembly = {
        version: 1,
        source: { resumeId: r.id, name: r.name },
        normalizedWith: used,
        templateName: template.templateName,
        sections,
        theme: template.layout.theme,
        fontFamily: template.layout.page.fontFamily,
        fontSize: template.layout.page.fontSize,
        document,
      };

      const created = await prisma.generatedResume.create({
        data: {
          name: `${r.name} (Created)`,
          template: template.templateName,
          assemblyJson: JSON.stringify(assembly),
        },
      });
      // Best-effort: keep MasterExperience bank in sync.
      ingestGeneratedResumeToMasterExperience(prisma, created.id).catch(() => {});
      results.push({ resumeId: r.id, ok: true, generatedResumeId: created.id });
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Normalize failed" }, { status: 500 });
  }
}

