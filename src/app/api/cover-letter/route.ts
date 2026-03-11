import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJob, parseResume } from "@/lib/ats/parse";
import { buildCoverLetter } from "@/lib/coverLetter/engine";
import { documentToPlainText } from "@/lib/tailor/document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, resumeId, resumeKind, jobText, resumeText } = body || {};

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
      const kind = String(resumeKind || "resume");
      if (kind === "generated") {
        const gr = await prisma.generatedResume.findUnique({ where: { id: String(resumeId) } });
        if (!gr) return NextResponse.json({ error: "Generated resume not found" }, { status: 404 });
        try {
          const assembly = JSON.parse(gr.assemblyJson || "{}");
          if (assembly?.document?.blocks?.length) resumeRaw = documentToPlainText(assembly.document);
          else resumeRaw = gr.assemblyJson || "";
        } catch {
          resumeRaw = gr.assemblyJson || "";
        }
      } else if (kind === "master") {
        const [resumes, generated] = await Promise.all([
          prisma.resume.findMany({ orderBy: { updatedAt: "desc" } }),
          prisma.generatedResume.findMany({ orderBy: { updatedAt: "desc" } }),
        ]);
        const parts: string[] = [];
        for (const r of resumes) if (r.content) parts.push(String(r.content));
        for (const g of generated) {
          try {
            const assembly = JSON.parse(g.assemblyJson || "{}");
            if (assembly?.document?.blocks?.length) parts.push(documentToPlainText(assembly.document));
          } catch {}
        }
        resumeRaw = parts.map((s) => s.trim()).filter(Boolean).join("\n\n---\n\n");
      } else {
        const resume = await prisma.resume.findUnique({ where: { id: String(resumeId) } });
        if (!resume) return NextResponse.json({ error: "Resume not found" }, { status: 404 });
        resumeRaw = resume.content || "";
      }
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

