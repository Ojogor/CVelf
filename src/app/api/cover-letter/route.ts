import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJob, parseResume } from "@/lib/ats/parse";
import { buildCoverLetter } from "@/lib/coverLetter/engine";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, resumeId, jobText, resumeText } = body || {};

    let jobRaw: string | null = jobText || null;
    let resumeRaw: string | null = resumeText || null;
    let jobMeta: { title?: string; company?: string } | undefined;

    if (jobId) {
      const job = await prisma.job.findUnique({ where: { id: String(jobId) } });
      if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
      jobRaw = job.description || "";
      jobMeta = { title: job.title || undefined, company: job.company || undefined };
      if (job.parsedRequirements && job.parsedRequirements.trim().length) {
        jobRaw = `${jobRaw}\n\nRequirements/Qualifications (pasted):\n${job.parsedRequirements}`;
      }
    }

    if (resumeId) {
      const resume = await prisma.resume.findUnique({ where: { id: String(resumeId) } });
      if (!resume) return NextResponse.json({ error: "Resume not found" }, { status: 404 });
      resumeRaw = resume.content || "";
    }

    if (!jobRaw || !resumeRaw) {
      return NextResponse.json(
        { error: "Provide jobId/resumeId or jobText/resumeText" },
        { status: 400 }
      );
    }

    const job = parseJob(jobRaw, jobMeta);
    const resume = parseResume(resumeRaw);
    const result = buildCoverLetter(job, resume);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Cover letter failed" }, { status: 500 });
  }
}

