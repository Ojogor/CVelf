import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJob, parseResume } from "@/lib/ats/parse";
import { analyzeJobSignals, extractSkills } from "@/lib/ats/skills";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { jobId, resumeId } = body || {};
    if (!jobId || !resumeId) {
      return NextResponse.json({ error: "jobId and resumeId are required" }, { status: 400 });
    }

    const job = await prisma.job.findUnique({ where: { id: String(jobId) } });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const resume = await prisma.resume.findUnique({ where: { id: String(resumeId) } });
    if (!resume) return NextResponse.json({ error: "Resume not found" }, { status: 404 });

    const rawJobText =
      job.parsedRequirements && job.parsedRequirements.trim().length
        ? `${job.description || ""}\n\nRequirements/Qualifications:\n${job.parsedRequirements}`
        : job.description || "";

    const parsedJob = parseJob(rawJobText, {
      title: job.title || undefined,
      company: job.company || undefined,
    });
    const signals = analyzeJobSignals(parsedJob.cleaned);

    const coreSkills = parsedJob.skillsRequired;
    const ecosystemSkills = parsedJob.skillsPreferred;
    const responsibilities = parsedJob.responsibilities.slice(0, 40);
    const workflowTerms = signals.domainTerms.slice(0, 12);

    // Pull bullets primarily from the Experience Bank when they are linked
    // to this resume, otherwise fall back to parsed resume bullets.
    // If the Experience Bank tables are not yet migrated, fail gracefully and
    // just use parsed resume bullets so Job Fit still works.
    let expBullets:
      | {
          text: string | null;
          tags: string | null;
        }[] = [];
    try {
      expBullets = await prisma.experienceBullet.findMany({
        where: {
          OR: [{ sourceResumeId: String(resumeId) }],
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { text: true, tags: true },
      });
    } catch {
      expBullets = [];
    }

    const resumeParsed = parseResume(resume.content || "");

    const bullets =
      expBullets.length > 0
        ? expBullets
            .map((b) => (b.text || "").trim())
            .filter(Boolean)
        : [...(resumeParsed.experienceBullets || []), ...(resumeParsed.projectBullets || [])];

    const tagSkills = expBullets
      .map((b) => (b.tags || "").split(",").map((s) => s.trim()).filter(Boolean))
      .flat();
    const textSkills = extractSkills(bullets.join("\n"));
    const allSkills = Array.from(new Set([...(resumeParsed.skills || []), ...tagSkills, ...textSkills]));

    return NextResponse.json({
      job: {
        id: String(jobId),
        title: job.title,
        company: job.company,
        coreSkills,
        ecosystemSkills,
        responsibilities,
        workflowTerms,
      },
      resume: {
        id: String(resumeId),
        name: resume.name,
        bullets: bullets.slice(0, 80),
        skills: allSkills,
      },
    });
  } catch {
    return NextResponse.json({ error: "Job fit preparation failed" }, { status: 500 });
  }
}

