import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJob, parseResume } from "@/lib/ats/parse";
import { scoreHybrid } from "@/lib/ats/score";
import { analyzeJobSignals } from "@/lib/ats/skills";
import type { ScoreResult } from "@/lib/ats/types";
import { getGeminiApiKey, scoreJobFit } from "@/lib/ai/tasks";
import { documentToPlainText } from "@/lib/tailor/document";

export const runtime = "nodejs";

/** Map AI job_fit_score output to ScoreResult for UI compatibility. */
function aiScoreToResult(ai: { score: number; strong: string[]; partial: string[]; missing: string[]; suggestions: string[] }): ScoreResult {
  const raw = Number(ai.score) || 0;
  // AI often returns 0–1; scale to 0–100 when so
  const score = raw <= 1 && raw >= 0 ? Math.round(raw * 100) : Math.round(raw);
  const clamped = Math.max(0, Math.min(100, score));
  return {
    overallScore: clamped,
    breakdown: {
      requiredSkillsScore: 0,
      preferredSkillsScore: 0,
      experienceScore: 0,
      titleScore: 0,
      semanticScore: 0,
      penalties: 0,
      overallScore: clamped,
      requiredSkillsMatched: ai.strong.length,
      requiredSkillsTotal: ai.strong.length + ai.missing.length,
      preferredSkillsMatched: ai.partial.length,
      preferredSkillsTotal: ai.partial.length,
    },
    matchedRequiredSkills: ai.strong,
    missingRequiredSkills: ai.missing,
    matchedPreferredSkills: ai.partial,
    missingPreferredSkills: [],
    suggestions: ai.suggestions.slice(0, 10),
    parsed: { job: null as any, resume: null as any },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, resumeId, jobText, resumeText, apiKey: bodyApiKey, resumeKind } = body || {};
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

    const kind = (resumeKind as "master" | "resume" | "generated" | undefined) || undefined;

    // If explicit resumeText is provided (e.g. tailored document), always prefer it and
    // skip any database lookup so we can score Master/Generated/custom text safely.
    if (resumeText && String(resumeText).trim()) {
      resumeRaw = String(resumeText).trim();
    } else if (kind === "master") {
      // Build Master combined content directly from all resumes + generated resumes.
      const [resumes, generated] = await Promise.all([
        prisma.resume.findMany(),
        prisma.generatedResume.findMany(),
      ]);

      const generatedTexts = generated.map((g) => {
        try {
          const assembly = JSON.parse(g.assemblyJson || "{}");
          if (assembly?.document?.blocks?.length) {
            return documentToPlainText(assembly.document);
          }
        } catch {
          // ignore bad assemblyJson
        }
        return "";
      });

      const masterText = [
        ...resumes.map((r) => (r.content ? String(r.content) : "")),
        ...generatedTexts,
      ]
        .map((s) => String(s || "").trim())
        .filter(Boolean)
        .join("\n\n---\n\n");

      resumeRaw = masterText || null;
    } else if (kind === "generated" && resumeId) {
      // Score directly against a GeneratedResume's structured document.
      const gr = await prisma.generatedResume.findUnique({ where: { id: String(resumeId) } });
      if (!gr) return NextResponse.json({ error: "Generated resume not found" }, { status: 404 });
      try {
        const assembly = JSON.parse(gr.assemblyJson || "{}");
        if (assembly?.document?.blocks?.length) {
          resumeRaw = documentToPlainText(assembly.document);
        }
      } catch {
        // fall through to empty text if parsing fails
      }
    } else if (resumeId) {
      // Legacy/raw resume row.
      const resume = await prisma.resume.findUnique({ where: { id: String(resumeId) } });
      if (!resume) return NextResponse.json({ error: "Resume not found" }, { status: 404 });
      resumeRaw = resume.content ? String(resume.content) : "";
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
      const aiResult = await scoreJobFit(apiKey, combinedJobText, resumeRaw);
      if (aiResult.ok) {
        const analysis = {
          status: "full" as const,
          note: "AI-backed job fit score.",
          evidence: null as any,
          detectedSkills: [...aiResult.data.strong, ...aiResult.data.partial],
          aiExplanation: aiResult.data.explanation,
          aiConfidence: aiResult.data.confidence,
        };
        const result = aiScoreToResult(aiResult.data);
        return NextResponse.json({ analysis, result });
      }
      // Fall through to local scoring on AI failure
    }

    const parsedJob = parseJob(combinedJobText, jobMeta);
    const parsedResume = parseResume(resumeRaw);
    const analysis = computeAnalysisStatus(parsedJob.cleaned, parsedJob, parsedResume);
    if (!apiKey) {
      const a = analysis as { note?: string };
      a.note = (a.note || "") + " Add your Gemini API key in Settings (stored locally) for AI-backed scoring.";
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
      overlapSkills?: string[];
      preliminaryFit?: "Good" | "Maybe" | "Unclear";
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
  recognizedSkills: string[];
  otherTechnicalTerms: string[];
  domainTerms: string[];
  softSkills: string[];
};

function computeAnalysisStatus(jobText: string, parsedJob: any, parsedResume: any): AnalysisStatus {
  const signals = analyzeJobSignals(jobText);
  const detectedSkills = signals.recognizedSkills;
  const overlapSkills = detectedSkills.filter((s) => (parsedResume.skills || []).includes(s));

  const evidence: Evidence = {
    jobTextLength: (jobText || "").trim().length,
    requiredSkills: (parsedJob.skillsRequired || []).length,
    preferredSkills: (parsedJob.skillsPreferred || []).length,
    requirementLines: (parsedJob.requiredLines || []).length + (parsedJob.preferredLines || []).length,
    responsibilities: (parsedJob.responsibilities || []).length,
    domainSignals: countDomainSignals(jobText),
    recognizedSkills: signals.recognizedSkills,
    otherTechnicalTerms: signals.otherTechnicalTerms,
    domainTerms: signals.domainTerms,
    softSkills: signals.softSkills,
  };

  // Main rule: no numeric score unless we extracted structured requirements.
  // Responsibilities/length alone are NOT enough to claim a precise score.
  const hasStructuredReq =
    evidence.requiredSkills + evidence.preferredSkills >= 2 ||
    evidence.requirementLines >= 4;

  const hasSomeSignals =
    detectedSkills.length >= 3 ||
    overlapSkills.length >= 1 ||
    evidence.responsibilities >= 3 ||
    evidence.domainSignals >= 1 ||
    evidence.jobTextLength >= 700;

  if (hasStructuredReq) {
    const fit: "Good" | "Maybe" | "Unclear" =
      overlapSkills.length >= 4 ? "Good" : overlapSkills.length >= 2 ? "Maybe" : "Unclear";
    return {
      status: "full",
      note: "Structured requirements detected. Providing a full numeric score based on skills, bullets, and semantic alignment.",
      evidence,
      detectedSkills,
      overlapSkills,
      preliminaryFit: fit,
    };
  }

  if (hasSomeSignals) {
    const fit: "Good" | "Maybe" | "Unclear" =
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

