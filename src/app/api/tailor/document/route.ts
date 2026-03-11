import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJob, parseResume } from "@/lib/ats/parse";
import { buildTailor } from "@/lib/tailor/engine";
import type {
  ResumeDocument,
  ResumeBlock,
  HeaderContent,
  SummaryContent,
  SkillsContent,
  ExperienceItemContent,
  BulletContent,
} from "@/lib/tailor/document";
import { createBlockId } from "@/lib/tailor/document";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");
    const resumeId = searchParams.get("resumeId");
    if (!resumeId) {
      return NextResponse.json({ error: "resumeId is required" }, { status: 400 });
    }

    const resume = await prisma.resume.findUnique({ where: { id: String(resumeId) } });
    if (!resume) return NextResponse.json({ error: "Resume not found" }, { status: 404 });

    const parsedResume = parseResume(resume.content || "");
    let tailorResult: ReturnType<typeof buildTailor> | null = null;
    if (jobId) {
      const job = await prisma.job.findUnique({ where: { id: String(jobId) } });
      if (job) {
        const combinedJob =
          job.parsedRequirements && job.parsedRequirements.trim().length
            ? `${job.description || ""}\n\nRequirements/Qualifications (pasted):\n${job.parsedRequirements}`
            : (job.description || "");
        const parsedJob = parseJob(combinedJob, {
          title: job.title || undefined,
          company: job.company || undefined,
        });
        tailorResult = buildTailor(parsedJob, parsedResume);
      }
    }

    const experiences = await prisma.masterExperience.findMany({
      orderBy: [{ type: "asc" }, { position: "asc" }, { createdAt: "desc" }],
      include: {
        bullets: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      },
    });

    const document = buildDocumentFromResumeAndTailor({
      resumeName: resume.name,
      parsedResume,
      tailorResult,
      experiences,
    });

    return NextResponse.json({ document });
  } catch (e) {
    return NextResponse.json({ error: "Failed to build document" }, { status: 500 });
  }
}

function buildDocumentFromResumeAndTailor(args: {
  resumeName: string;
  parsedResume: ReturnType<typeof parseResume>;
  tailorResult: ReturnType<typeof buildTailor> | null;
  experiences: Array<{
    id: string;
    type: string;
    organization: string;
    title: string;
    location: string | null;
    startDate: string | null;
    endDate: string | null;
    current: boolean;
    bullets: Array<{ id: string; text: string; position: number }>;
  }>;
}): ResumeDocument {
  const { resumeName, parsedResume, tailorResult, experiences } = args;
  const blocks: ResumeBlock[] = [];

  const headerContent: HeaderContent = {
    name: resumeName || parsedResume.headline || "Your Name",
    subtitle: parsedResume.headline && resumeName !== parsedResume.headline ? parsedResume.headline : undefined,
  };
  blocks.push({
    id: createBlockId(),
    type: "header",
    content: headerContent,
    order: 0,
  });

  const summaryText =
    tailorResult?.tailoredSummaries?.[0] ||
    parsedResume.summary ||
    "Professional summary tailored to the role.";
  blocks.push({
    id: createBlockId(),
    type: "summary",
    content: { text: summaryText } as SummaryContent,
    order: 1,
  });

  const skillItems =
    tailorResult?.suggestedSkillOrder?.slice(0, 24) ||
    parsedResume.skills?.slice(0, 24) ||
    [];
  blocks.push({
    id: createBlockId(),
    type: "skills",
    content: { items: skillItems } as SkillsContent,
    order: 2,
  });

  const experienceBlock: ResumeBlock = {
    id: createBlockId(),
    type: "experience",
    content: { title: "Experience" },
    order: 3,
    children: [],
  };

  if (experiences.length > 0) {
    experienceBlock.children = experiences.map((exp, idx) => {
      const itemContent: ExperienceItemContent = {
        organization: exp.organization,
        title: exp.title,
        location: exp.location || undefined,
        startDate: exp.startDate || undefined,
        endDate: exp.endDate || undefined,
        current: exp.current,
      };
      const bulletBlocks: ResumeBlock[] = (exp.bullets || [])
        .sort((a, b) => a.position - b.position)
        .map((b) => ({
          id: createBlockId(),
          type: "bullet" as const,
          content: { text: b.text } as BulletContent,
          order: b.position,
        }));
      return {
        id: createBlockId(),
        type: "experience_item",
        content: itemContent,
        order: idx,
        children: bulletBlocks,
      };
    });
  } else {
    const bullets = [
      ...(parsedResume.experienceBullets || []),
      ...(parsedResume.projectBullets || []),
    ].slice(0, 12);
    const suggested =
      tailorResult?.bulletSuggestions
        ?.filter((b) => b.suggestion && (b.confidence === "strong" || b.confidence === "moderate"))
        .slice(0, 10)
        .map((b) => (b.suggestion as string).trim())
        .filter(Boolean) || bullets;
    const useBullets = suggested.length ? suggested : bullets.length ? bullets : ["Add your key achievements here."];
    const singleItem: ResumeBlock = {
      id: createBlockId(),
      type: "experience_item",
      content: {
        organization: "Company",
        title: "Job Title",
        startDate: "",
        endDate: "",
      } as ExperienceItemContent,
      order: 0,
      children: useBullets.map((text, i) => ({
        id: createBlockId(),
        type: "bullet" as const,
        content: { text } as BulletContent,
        order: i,
      })),
    };
    experienceBlock.children = [singleItem];
  }

  blocks.push(experienceBlock);

  return { blocks, version: 1 };
}
