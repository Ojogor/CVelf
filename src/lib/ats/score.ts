import type { JobParsed, ResumeParsed, ScoreResult } from "./types";
import { scoreSemanticAlignmentLocal } from "./semantic";

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function scoreOverlap(have: string[], want: string[]) {
  if (want.length === 0) return { ratio: 0, matched: [], missing: [] };
  const haveSet = new Set(have);
  const matched = want.filter((s) => haveSet.has(s));
  const missing = want.filter((s) => !haveSet.has(s));
  return { ratio: matched.length / want.length, matched, missing };
}

export function scoreHybrid(job: JobParsed, resume: ResumeParsed): ScoreResult {
  const required = scoreOverlap(resume.skills, job.skillsRequired);
  const preferred = scoreOverlap(resume.skills, job.skillsPreferred);

  const requiredSkillsScore = job.skillsRequired.length ? Math.round(required.ratio * 45) : 10;
  const preferredSkillsScore = job.skillsPreferred.length ? Math.round(preferred.ratio * 15) : 5;

  const titleScore = (() => {
    const jt = (job.title || "").toLowerCase();
    const rt = (resume.headline || "").toLowerCase();
    if (!jt || !rt) return 6;
    const hit =
      jt.includes("frontend") && (rt.includes("frontend") || rt.includes("react")) ||
      jt.includes("full") && rt.includes("full") ||
      jt.includes("backend") && rt.includes("backend");
    return hit ? 10 : 6;
  })();

  const expSignal = resume.experienceBullets.length + resume.projectBullets.length;
  const experienceScore = expSignal >= 8 ? 12 : expSignal >= 4 ? 9 : expSignal >= 2 ? 6 : 3;

  const { score: semanticScore } = scoreSemanticAlignmentLocal(job.cleaned, resume.cleaned);
  const semanticScaled = Math.round(clamp01(semanticScore / 100) * 18);

  const penalties = (() => {
    let p = 0;
    if (job.skillsRequired.length >= 4 && required.matched.length === 0) p += 10;
    if (resume.cleaned.length < 200) p += 8;
    if (job.cleaned.length < 200) p += 8;
    return p;
  })();

  const overallRaw = requiredSkillsScore + preferredSkillsScore + titleScore + experienceScore + semanticScaled - penalties;
  const overallScore = Math.max(0, Math.min(100, overallRaw));

  const suggestions = buildSuggestions(job, resume, required.missing, preferred.missing);

  return {
    overallScore,
    breakdown: {
      requiredSkillsScore,
      preferredSkillsScore,
      experienceScore,
      titleScore,
      semanticScore: semanticScaled,
      penalties,
      overallScore,
      requiredSkillsMatched: required.matched.length,
      requiredSkillsTotal: job.skillsRequired.length,
      preferredSkillsMatched: preferred.matched.length,
      preferredSkillsTotal: job.skillsPreferred.length,
    },
    matchedRequiredSkills: required.matched,
    missingRequiredSkills: required.missing,
    matchedPreferredSkills: preferred.matched,
    missingPreferredSkills: preferred.missing,
    suggestions,
    parsed: { job, resume },
  };
}

function buildSuggestions(job: JobParsed, resume: ResumeParsed, missingReq: string[], missingPref: string[]) {
  const out: string[] = [];

  if (job.cleaned.length < 200) {
    out.push("Job description looks short. If this came from a blocked site, paste the full job description for better scoring.");
  }
  if (resume.cleaned.length < 200) {
    out.push("Resume text looks short. If you uploaded a PDF, try re-uploading or paste your resume text.");
  }

  if (missingReq.length) {
    out.push(`Add/reflect required keywords (truthfully) where applicable: ${missingReq.slice(0, 8).join(", ")}.`);
  }
  if (missingPref.length) {
    out.push(`Nice-to-have keywords to mirror if relevant: ${missingPref.slice(0, 8).join(", ")}.`);
  }

  if (!resume.summary) {
    out.push("Add a 2–3 line summary tailored to the target role and tech stack.");
  }

  if ((resume.experienceBullets.length + resume.projectBullets.length) < 4) {
    out.push("Add more impact bullets (actions + tech + scope + result).");
  }

  if (!job.skillsRequired.length && !job.skillsPreferred.length) {
    out.push("Could not extract clear skill requirements from this job. Consider pasting the requirements section explicitly.");
  }

  return out.slice(0, 10);
}

