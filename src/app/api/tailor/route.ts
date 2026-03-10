import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJob, parseResume } from "@/lib/ats/parse";
import { localTextSimilarity } from "@/lib/ats/semantic";

export const runtime = "nodejs";

type TailorResult = {
  fastWins: string[];
  tailoredSummaries: string[];
  suggestedSkillOrder: string[];
  jobKeywordsToMirror: string[];
  bulletSuggestions: Array<{
    original: string;
    matchedJobLine?: string;
    rewrite: string;
    score: number;
  }>;
  extracted: {
    jobRequiredSkills: string[];
    jobPreferredSkills: string[];
    resumeSkills: string[];
  };
};

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

    const result: TailorResult = buildTailor(job, resume);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: "Tailor failed" }, { status: 500 });
  }
}

function buildTailor(job: ReturnType<typeof parseJob>, resume: ReturnType<typeof parseResume>): TailorResult {
  const resumeSkillSet = new Set(resume.skills);
  const missingReq = job.skillsRequired.filter((s) => !resumeSkillSet.has(s));
  const missingPref = job.skillsPreferred.filter((s) => !resumeSkillSet.has(s));
  const matchedReq = job.skillsRequired.filter((s) => resumeSkillSet.has(s));
  const matchedPref = job.skillsPreferred.filter((s) => resumeSkillSet.has(s));

  const fastWins: string[] = [];
  if (missingReq.length) fastWins.push(`Mirror required terms you truly have: ${missingReq.slice(0, 8).join(", ")}.`);
  if (missingPref.length) fastWins.push(`Optional terms to include if relevant: ${missingPref.slice(0, 8).join(", ")}.`);
  if (!resume.summary) fastWins.push("Add a 2–3 line summary aligned to the role + stack.");
  if ((resume.experienceBullets.length + resume.projectBullets.length) < 4) fastWins.push("Add more impact bullets (action + tech + scope + result).");
  if (!job.skillsRequired.length && !job.skillsPreferred.length) fastWins.push("Paste the Requirements/Qualifications section for better extraction.");

  const topSkills = [...matchedReq, ...matchedPref].slice(0, 10);
  const role = job.title || "the role";
  const company = job.company ? ` at ${job.company}` : "";
  const stackPhrase = topSkills.length ? ` (${topSkills.join(", ")})` : "";

  const tailoredSummaries = [
    `Candidate aligned for ${role}${company} with hands-on experience delivering user-facing features and collaborating cross-functionally${stackPhrase}.`,
    `Practical engineer with experience shipping reliable, maintainable work in modern web stacks${stackPhrase}, focused on impact and iteration speed.`,
  ];

  const suggestedSkillOrder = Array.from(new Set([...matchedReq, ...matchedPref, ...resume.skills])).slice(0, 24);
  const jobKeywordsToMirror = job.keywords.slice(0, 20);

  const jobLines = Array.from(
    new Set([...job.requiredLines, ...job.preferredLines, ...job.responsibilities].filter((l) => l.length >= 12))
  ).slice(0, 60);

  const bullets = [...resume.experienceBullets, ...resume.projectBullets].slice(0, 18);
  const bulletSuggestions = bullets.map((b) => {
    const best = bestJobLineForBullet(b, jobLines);
    const rewrite = rewriteBulletRuleBased(b, best?.line, topSkills);
    return {
      original: b,
      matchedJobLine: best?.line,
      rewrite,
      score: best?.score ?? 0,
    };
  });

  return {
    fastWins: fastWins.slice(0, 8),
    tailoredSummaries,
    suggestedSkillOrder,
    jobKeywordsToMirror,
    bulletSuggestions,
    extracted: {
      jobRequiredSkills: job.skillsRequired,
      jobPreferredSkills: job.skillsPreferred,
      resumeSkills: resume.skills,
    },
  };
}

function bestJobLineForBullet(bullet: string, jobLines: string[]) {
  let best: { line: string; score: number } | null = null;
  for (const line of jobLines) {
    const score = localTextSimilarity(bullet, line);
    if (!best || score > best.score) best = { line, score };
  }
  if (!best || best.score < 0.08) return null;
  return { line: best.line, score: Math.round(best.score * 100) };
}

function rewriteBulletRuleBased(original: string, jobLine: string | undefined, topSkills: string[]) {
  const cleaned = original.replace(/\s+/g, " ").trim();
  const hasResult = /\b(increased|reduced|improved|optimized|decreased|boosted|saved)\b/i.test(cleaned);

  const skillHint = topSkills.find((s) => new RegExp(`\\b${escapeRegex(s)}\\b`, "i").test(cleaned))
    ? null
    : topSkills[0];

  const prefix = cleaned.replace(/^[a-z]/, (c) => c.toUpperCase());

  if (!jobLine) {
    return hasResult ? prefix : `${prefix} to support product goals and improve usability.`;
  }

  const emphasis = jobLine.toLowerCase().includes("ui") || jobLine.toLowerCase().includes("ux") ? "with a focus on UI/UX quality" : "";
  const skillAdd = skillHint ? ` using ${skillHint}` : "";
  const tail = hasResult ? "" : " and improving reliability/maintainability.";

  return `${prefix}${skillAdd} aligned to ${stripTrailingPeriod(jobLine)} ${emphasis}`.trim().replace(/\s+/g, " ") + tail;
}

function stripTrailingPeriod(s: string) {
  return s.replace(/[.]+$/g, "");
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

