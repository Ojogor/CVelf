import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJob, parseResume } from "@/lib/ats/parse";
import { scoreHybrid } from "@/lib/ats/score";
import { extractSkills } from "@/lib/ats/skills";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, resumeId, jobText, resumeText } = body || {};

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

    const parsedJob = parseJob(combinedJobText, jobMeta);
    const parsedResume = parseResume(resumeRaw);
    const analysis = computeAnalysisStatus(parsedJob.cleaned, parsedJob, parsedResume);

    if (analysis.status === "insufficient") {
      return NextResponse.json({
        analysis,
        extracted: {
          detectedSkills: analysis.detectedSkills,
          requiredSkills: parsedJob.skillsRequired,
          preferredSkills: parsedJob.skillsPreferred,
          responsibilities: parsedJob.responsibilities.slice(0, 8),
        },
      });
    }

    if (analysis.status === "partial") {
      return NextResponse.json({
        analysis,
        extracted: {
          detectedSkills: analysis.detectedSkills,
          possibleOverlapSkills: analysis.overlapSkills,
          responsibilities: parsedJob.responsibilities.slice(0, 8),
        },
      });
    }

    const result = scoreHybrid(parsedJob, parsedResume);
    return NextResponse.json({ analysis, result });
  } catch (e) {
    return NextResponse.json({ error: "Scoring failed" }, { status: 500 });
  }
}

type AnalysisStatus =
  | {
      status: "full";
      note?: string;
      evidence: Evidence;
      detectedSkills: string[];
    }
  | {
      status: "partial";
      note: string;
      evidence: Evidence;
      detectedSkills: string[];
      overlapSkills: string[];
      preliminaryFit: "Good" | "Maybe" | "Unclear";
    }
  | {
      status: "insufficient";
      note: string;
      evidence: Evidence;
      detectedSkills: string[];
    };

type Evidence = {
  jobTextLength: number;
  requiredSkills: number;
  preferredSkills: number;
  requirementLines: number;
  responsibilities: number;
  domainSignals: number;
};

function computeAnalysisStatus(jobText: string, parsedJob: any, parsedResume: any): AnalysisStatus {
  const detectedSkills = extractSkills(jobText);
  const overlapSkills = detectedSkills.filter((s) => (parsedResume.skills || []).includes(s));

  const evidence: Evidence = {
    jobTextLength: (jobText || "").trim().length,
    requiredSkills: (parsedJob.skillsRequired || []).length,
    preferredSkills: (parsedJob.skillsPreferred || []).length,
    requirementLines: (parsedJob.requiredLines || []).length + (parsedJob.preferredLines || []).length,
    responsibilities: (parsedJob.responsibilities || []).length,
    domainSignals: countDomainSignals(jobText),
  };

  // Tightened thresholds:
  // Only show a numeric score when we have meaningful, structured evidence.
  // (This prevents "47/100" when we effectively extracted nothing.)
  const hasStructuredReq =
    evidence.requiredSkills + evidence.preferredSkills >= 4 ||
    evidence.requirementLines >= 6 ||
    (evidence.requirementLines >= 4 && (evidence.requiredSkills + evidence.preferredSkills) >= 2) ||
    (evidence.responsibilities >= 6 && detectedSkills.length >= 3) ||
    evidence.requiredSkills >= 3;

  const hasSomeSignals =
    detectedSkills.length >= 3 ||
    overlapSkills.length >= 1 ||
    evidence.responsibilities >= 3 ||
    evidence.domainSignals >= 1 ||
    evidence.jobTextLength >= 700;

  if (hasStructuredReq) {
    return {
      status: "full",
      evidence,
      detectedSkills,
    };
  }

  if (hasSomeSignals) {
    const fit =
      overlapSkills.length >= 4 ? "Good" : overlapSkills.length >= 2 ? "Maybe" : "Unclear";
    return {
      status: "partial",
      note:
        "Limited analysis available. We found some technical signals, but could not clearly separate required vs preferred qualifications.",
      evidence,
      detectedSkills,
      overlapSkills,
      preliminaryFit: fit,
    };
  }

  return {
    status: "insufficient",
    note:
      "Could not extract enough job requirements from this posting. Paste the Requirements/Qualifications section for a better analysis, or continue with manual review.",
    evidence,
    detectedSkills,
  };
}

function countDomainSignals(text: string) {
  const t = (text || "").toLowerCase();
  const hints = [
    "user-facing",
    "customer-facing",
    "public-facing",
    "internal tools",
    "saas",
    "platform",
    "data-rich",
    "high-traffic",
    "reporting",
    "dashboards",
    "workflows",
  ];
  let c = 0;
  for (const h of hints) if (t.includes(h)) c += 1;
  return c;
}

