import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJob, parseResume } from "@/lib/ats/parse";
import type { JobParsed, ResumeParsed } from "@/lib/ats/types";
import { buildTailor, type TailorResult } from "@/lib/tailor/engine";
import { getGeminiApiKey, extractJobStructure, extractResumeStructure } from "@/lib/ai/tasks";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, resumeId, jobText, resumeText, apiKey: bodyApiKey } = body || {};
    const apiKey = getGeminiApiKey(bodyApiKey);

    let jobRaw: string | null = jobText || null;
    let resumeRaw: string | null = resumeText || null;
    let jobMeta: { title?: string; company?: string } | undefined;
    let jobParsedRequirements: string | null = null;

    if (jobId) {
      const job = await prisma.job.findUnique({ where: { id: String(jobId) } });
      if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
      jobRaw = job.description || "";
      jobParsedRequirements = job.parsedRequirements || null;
      jobMeta = { title: job.title || undefined, company: job.company || undefined };
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

    const combinedJobText =
      jobParsedRequirements && jobParsedRequirements.trim().length
        ? `${jobRaw}\n\nRequirements/Qualifications (pasted):\n${jobParsedRequirements}`
        : jobRaw;

    if (apiKey) {
      const [jobRes, resumeRes] = await Promise.all([
        extractJobStructure(apiKey, combinedJobText),
        extractResumeStructure(apiKey, resumeRaw),
      ]);
      if (jobRes.ok && resumeRes.ok) {
        const j = jobRes.data;
        const r = resumeRes.data;
        const parsedJob: JobParsed = {
          raw: combinedJobText,
          cleaned: combinedJobText.trim(),
          title: jobMeta?.title,
          company: jobMeta?.company,
          requiredLines: j.required,
          preferredLines: j.preferred,
          responsibilities: j.responsibilities,
          skillsRequired: j.required,
          skillsPreferred: j.preferred,
          keywords: j.keySkills,
        };
        const parsedResume: ResumeParsed = {
          raw: resumeRaw,
          cleaned: resumeRaw.trim(),
          summary: r.summary || undefined,
          skills: r.skills,
          certifications: [],
          experienceBullets: r.experienceBullets,
          projectBullets: r.projectBullets,
        };
        const result: TailorResult = buildTailor(parsedJob, parsedResume);
        return NextResponse.json(result);
      }
      // Fall through to local parsing on AI failure
    }

    const job = parseJob(combinedJobText, jobMeta);
    const resume = parseResume(resumeRaw);
    const result: TailorResult = buildTailor(job, resume);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: "Tailor failed" }, { status: 500 });
  }
}

