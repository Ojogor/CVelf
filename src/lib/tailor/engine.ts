import type { JobParsed, ResumeParsed } from "@/lib/ats/types";
import { localTextSimilarity } from "@/lib/ats/semantic";
import { extractSkills } from "@/lib/ats/skills";

export type TailorBulletSuggestion = {
  original: string;
  confidence: "strong" | "moderate" | "weak";
  matchedRequirement?: string;
  matchedCategory?: "hard_skills" | "responsibilities" | "domain_context" | "soft_skills";
  why: string;
  suggestion?: string;
  scoreBand: "Strong" | "Moderate" | "Weak";
};

export type TailorResult = {
  warning?: string;
  fastWins: string[];
  tailoredSummaries: string[];
  suggestedSkillOrder: string[];
  jobKeywordsToMirror: string[];
  bulletSuggestions: TailorBulletSuggestion[];
  extracted: {
    jobRequiredSkills: string[];
    jobPreferredSkills: string[];
    jobSoftSkills: string[];
    jobDomainContext: string[];
    resumeSkills: string[];
  };
};

type CandidateLine = {
  line: string;
  category: "hard_skills" | "responsibilities" | "domain_context" | "soft_skills";
  weight: number;
};

export function buildTailor(job: JobParsed, resume: ResumeParsed): TailorResult {
  const resumeSkillSet = new Set(resume.skills);
  const missingReq = job.skillsRequired.filter((s) => !resumeSkillSet.has(s));
  const missingPref = job.skillsPreferred.filter((s) => !resumeSkillSet.has(s));
  const matchedReq = job.skillsRequired.filter((s) => resumeSkillSet.has(s));
  const matchedPref = job.skillsPreferred.filter((s) => resumeSkillSet.has(s));

  const fastWins: string[] = [];
  if (missingReq.length) fastWins.push(`Missing required keywords (only include if true): ${missingReq.slice(0, 8).join(", ")}.`);
  if (missingPref.length) fastWins.push(`Nice-to-have keywords to mirror if relevant: ${missingPref.slice(0, 8).join(", ")}.`);
  if (!resume.summary) fastWins.push("Add a 2–3 line summary tailored to the target role and stack.");
  if ((resume.experienceBullets.length + resume.projectBullets.length) < 4) fastWins.push("Add more impact bullets (action + tech + scope + result).");
  if (!job.skillsRequired.length && !job.skillsPreferred.length) fastWins.push("Paste the Requirements/Qualifications section for better extraction.");

  const topSkills = [...matchedReq, ...matchedPref].slice(0, 10);
  const role = sanitizeRole(job.title, job.cleaned) || "Software Developer";
  const stack = topSkills.slice(0, 6);
  const workType = inferWorkTypeFromResume(resume.cleaned);
  const tailoredSummaries = buildHumanSummary(role, stack, workType);

  const suggestedSkillOrder = Array.from(new Set([...matchedReq, ...matchedPref, ...resume.skills])).slice(0, 24);
  const jobKeywordsToMirror = job.keywords.slice(0, 20);

  const jobParts = categorizeJob(job.cleaned, job.requiredLines, job.preferredLines, job.responsibilities, job.skillsRequired, job.skillsPreferred);
  const candidates = jobParts.candidates;

  const bullets = [...resume.experienceBullets, ...resume.projectBullets].slice(0, 18);
  const bulletSuggestions: TailorBulletSuggestion[] = bullets.map((b) => {
    const best = bestRequirementForBullet(b, candidates, resume.skills);
    if (!best || best.confidence === "weak") {
      return {
        original: b,
        confidence: "weak",
        matchedRequirement: best?.line,
        matchedCategory: best?.category,
        why: best?.why || "No strong requirement match found. Original bullet is already acceptable.",
        suggestion: undefined,
        scoreBand: "Weak",
      };
    }

    const suggestion = rewriteBulletHuman(b);
    return {
      original: b,
      confidence: best.confidence,
      matchedRequirement: best.line,
      matchedCategory: best.category,
      why: best.why,
      suggestion,
      scoreBand: best.confidence === "strong" ? "Strong" : "Moderate",
    };
  });

  const warning = buildPartialJobWarning(job.cleaned, jobParts);

  return {
    warning,
    fastWins: fastWins.slice(0, 8),
    tailoredSummaries,
    suggestedSkillOrder,
    jobKeywordsToMirror,
    bulletSuggestions,
    extracted: {
      jobRequiredSkills: job.skillsRequired,
      jobPreferredSkills: job.skillsPreferred,
      jobSoftSkills: jobParts.softSkills,
      jobDomainContext: jobParts.domainContext,
      resumeSkills: resume.skills,
    },
  };
}

function sanitizeRole(role: string | undefined, jobText: string) {
  const r = (role || "").trim();
  if (!r) return inferRoleFromJobText(jobText);

  const lowered = r.toLowerCase();
  const looksGeneric =
    lowered.includes("indeed") ||
    lowered.includes("job search") ||
    lowered.includes("jobs in") ||
    lowered.includes("hiring") ||
    lowered.includes("search results");

  if (!looksGeneric) return r.replace(/\s+\|\s+Indeed$/i, "").trim();

  return inferRoleFromJobText(jobText) || r.replace(/\s+\|\s+Indeed$/i, "").trim();
}

function inferRoleFromJobText(jobText: string) {
  const t = (jobText || "").replace(/\r\n/g, "\n");
  const firstLines = t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 80);

  // Common pattern: "we're looking for a Software Developer who..."
  const joined = firstLines.join(" ");
  const m = joined.match(/\blooking for (?:an?|the)\s+([A-Z][A-Za-z/&+\- ]{2,50}?)(?:\s+who|\s+to|\s+at|\s+in)\b/);
  if (m?.[1]) return m[1].trim();

  // Headline-like line: contains Developer/Engineer/etc
  const roleWords = ["developer", "engineer", "analyst", "designer", "manager", "architect", "administrator"];
  for (const line of firstLines) {
    const ll = line.toLowerCase();
    if (roleWords.some((w) => ll.includes(w)) && line.length <= 80) {
      return line.replace(/^now,?\s+we'?re\s+looking\s+for\s+(?:an?|the)\s+/i, "").trim();
    }
  }

  return undefined;
}

function categorizeJob(
  cleaned: string,
  requiredLines: string[],
  preferredLines: string[],
  responsibilities: string[],
  skillsRequired: string[],
  skillsPreferred: string[]
) {
  const hardSkills = Array.from(new Set([...skillsRequired, ...skillsPreferred]));
  const softSkills = extractSoftSkills(cleaned);
  const domainContext = extractDomainContext(cleaned);

  const rawCandidates: CandidateLine[] = [];
  const addLines = (lines: string[], category: CandidateLine["category"], weight: number) => {
    for (const l of lines) {
      const line = l.trim();
      if (line.length < 12) continue;
      rawCandidates.push({ line, category, weight });
    }
  };

  addLines(requiredLines, "hard_skills", 1.15);
  addLines(preferredLines, "hard_skills", 1.05);
  addLines(responsibilities, "responsibilities", 1.1);
  addLines(domainContext, "domain_context", 0.9);
  addLines(softSkills, "soft_skills", 0.6);

  const bestByLine = new Map<string, CandidateLine>();
  for (const c of rawCandidates) {
    const key = c.line.toLowerCase();
    const prev = bestByLine.get(key);
    if (!prev || c.weight > prev.weight) bestByLine.set(key, c);
  }

  const candidates = Array.from(bestByLine.values()).slice(0, 80);
  return { hardSkills, softSkills, domainContext, candidates };
}

function bestRequirementForBullet(bullet: string, candidates: CandidateLine[], resumeSkills: string[]) {
  const bulletSkills = extractSkills(bullet);
  const resumeSkillSet = new Set(resumeSkills);

  let best:
    | (CandidateLine & {
        score: number;
        confidence: "strong" | "moderate" | "weak";
        why: string;
        overlapSkills: string[];
        overlapWork: string[];
        overlapDomain: string[];
      })
    | null = null;

  for (const c of candidates) {
    const reqSkills = extractSkills(c.line);
    const techOverlap = intersect(bulletSkills, reqSkills);

    const reqWork = extractWorkSignals(c.line);
    const bulletWork = extractWorkSignals(bullet);
    const workOverlap = intersect(bulletWork, reqWork);

    const domainOverlap = intersect(extractDomainSignals(bullet), extractDomainSignals(c.line));

    const softOnly =
      c.category === "soft_skills" &&
      techOverlap.length === 0 &&
      workOverlap.length === 0 &&
      domainOverlap.length === 0;
    if (softOnly) continue;

    const softPenalty = c.category === "soft_skills" ? 0.4 : 1;
    const sim = localTextSimilarity(bullet, c.line);
    const techScore = Math.min(1, techOverlap.length / 2);
    const workScore = Math.min(1, workOverlap.length / 2);
    const domainScore = Math.min(1, domainOverlap.length / 1);

    const hasMeaningfulOverlap = techOverlap.length > 0 || workOverlap.length > 0 || domainOverlap.length > 0;
    if (!hasMeaningfulOverlap && sim < 0.12) continue;

    const score =
      c.weight * softPenalty * (techScore * 0.55 + workScore * 0.3 + domainScore * 0.1 + Math.min(0.25, sim) * 0.2);

    if (!best || score > best.score) {
      const confidence = score >= 0.62 ? "strong" : score >= 0.38 ? "moderate" : "weak";
      const why = buildWhyLine(techOverlap, workOverlap, domainOverlap, resumeSkillSet);
      best = { ...c, score, confidence, why, overlapSkills: techOverlap, overlapWork: workOverlap, overlapDomain: domainOverlap };
    }
  }

  if (!best) return null;
  if (best.confidence === "weak") {
    return { line: best.line, category: best.category, confidence: "weak" as const, why: "No strong requirement match found. Original bullet is already acceptable." };
  }
  return { line: best.line, category: best.category, confidence: best.confidence, why: best.why };
}

function rewriteBulletHuman(original: string) {
  let out = normalizeBullet(original);
  out = out.replace(/\butilize\b/gi, "use").replace(/\bleverage\b/gi, "use");
  out = out.replace(/\bunit\/integration\b/gi, "unit and integration");
  out = out.replace(/\s+,/g, ",").replace(/\s+\./g, ".");
  out = toOneSentence(out);
  out = out.replace(/\s{2,}/g, " ").trim();
  if (!/[.!?]$/.test(out)) out += ".";
  return out;
}

function buildHumanSummary(role: string, stack: string[], workType: string[]) {
  const roleClean = role.trim() || "Software Developer";
  const tech = stack.length ? stack.join(", ") : "";
  const work = workType.length ? workType.join(", ") : "web applications";

  const l1 = tech.length > 0 ? `${roleClean} with experience building ${work} using ${tech}.` : `${roleClean} with experience building ${work}.`;
  const l2 = "Strong background delivering feature enhancements, maintenance work, and tested production improvements in collaborative teams.";
  return [l1, l2];
}

function inferWorkTypeFromResume(text: string) {
  const t = (text || "").toLowerCase();
  const out: string[] = [];
  if (/(user[- ]facing|customer[- ]facing|public[- ]facing)/.test(t)) out.push("user-facing");
  if (/(internal tools|admin|dashboard|back office)/.test(t)) out.push("internal");
  if (/(api|rest|graphql)/.test(t)) out.push("API-driven");
  if (/(wordpress|cms)/.test(t)) out.push("WordPress/CMS");
  if (!out.length) out.push("web");
  return out;
}

function buildPartialJobWarning(cleaned: string, parts: { hardSkills: string[]; candidates: CandidateLine[] }) {
  const looksShort = (cleaned || "").trim().length < 800;
  const hasStructured = parts.hardSkills.length >= 4 || parts.candidates.filter((c) => c.category === "hard_skills").length >= 4;
  if (looksShort && !hasStructured) {
    return "It looks like you pasted only a partial job description (missing Requirements/Qualifications). Tailoring quality may be limited—paste more of the job description for better matching.";
  }
  return undefined;
}

function extractSoftSkills(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const softHints = ["collaborat", "communication", "ownership", "mentor", "curiosity", "initiative", "stakeholder", "adapt"];
  const soft: string[] = [];
  for (const l of lines) if (softHints.some((h) => l.toLowerCase().includes(h))) soft.push(l.replace(/^\-\s+/, ""));
  return Array.from(new Set(soft)).slice(0, 20);
}

function extractDomainContext(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const ctxHints = ["user-facing", "customer-facing", "internal tools", "saas", "platform", "data-rich", "high-traffic", "reporting", "dashboards", "workflows"];
  const out: string[] = [];
  for (const l of lines) if (ctxHints.some((h) => l.toLowerCase().includes(h))) out.push(l.replace(/^\-\s+/, ""));
  return Array.from(new Set(out)).slice(0, 20);
}

function extractWorkSignals(text: string) {
  const t = text.toLowerCase();
  const signals = [
    ["build", "build"],
    ["develop", "develop"],
    ["implement", "implement"],
    ["maintain", "maintain"],
    ["debug", "debug"],
    ["test", "test"],
    ["refactor", "refactor"],
    ["optimize", "optimize"],
    ["integrat", "integrate"],
    ["deploy", "deploy"],
    ["design", "design"],
    ["document", "document"],
    ["support", "support"],
    ["report", "reporting"],
  ] as const;
  const out: string[] = [];
  for (const [needle, label] of signals) if (t.includes(needle)) out.push(label);
  return out;
}

function extractDomainSignals(text: string) {
  const t = text.toLowerCase();
  const signals = [
    ["user-facing", "user-facing"],
    ["customer-facing", "user-facing"],
    ["public-facing", "user-facing"],
    ["internal", "internal"],
    ["dashboard", "dashboards"],
    ["report", "reporting"],
    ["workflow", "workflows"],
    ["saas", "SaaS"],
    ["platform", "platform"],
    ["data", "data"],
  ] as const;
  const out: string[] = [];
  for (const [needle, label] of signals) if (t.includes(needle)) out.push(label);
  return out;
}

function buildWhyLine(skills: string[], work: string[], domain: string[], resumeSkillSet: Set<string>) {
  const parts: string[] = [];
  const tech = skills.filter((s) => resumeSkillSet.has(s)).slice(0, 3);
  if (tech.length) parts.push(`Matched on ${tech.join(" + ")}`);
  if (work.length) parts.push(work.slice(0, 2).join(" + "));
  if (domain.length) parts.push(domain.slice(0, 1).join(""));
  if (!parts.length) return "Matched on similar work phrasing.";
  return parts.join(" + ");
}

function intersect(a: string[], b: string[]) {
  const setB = new Set(b);
  return Array.from(new Set(a.filter((x) => setB.has(x))));
}

function normalizeBullet(s: string) {
  return s.replace(/\s+/g, " ").trim().replace(/^[a-z]/, (c) => c.toUpperCase());
}

function toOneSentence(s: string) {
  const trimmed = s.trim();
  const parts = trimmed.split(/(?<=[.!?])\s+/);
  return (parts[0] || trimmed).replace(/[.!?]+$/g, "");
}

