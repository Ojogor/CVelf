import type { JobParsed, ResumeParsed } from "@/lib/ats/types";

export type CoverLetterResult = {
  subject: string;
  body: string;
  highlights: string[];
  warnings: string[];
};

function pickTop(items: string[], max = 4) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const t = (it || "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function roleFromTitle(title?: string) {
  const t = (title || "").trim();
  if (!t) return "this role";
  return t.length > 80 ? t.slice(0, 80) : t;
}

export function buildCoverLetter(job: JobParsed, resume: ResumeParsed): CoverLetterResult {
  const company = (job.company || "").trim() || "the team";
  const role = roleFromTitle(job.title);

  const matchedSkills = pickTop(
    job.skillsRequired.filter((s) => resume.skills.includes(s)).concat(
      job.skillsPreferred.filter((s) => resume.skills.includes(s))
    ),
    6
  );

  const focusSkills = matchedSkills.length ? matchedSkills.slice(0, 4) : pickTop(resume.skills, 4);
  const highlights = pickTop(
    [
      ...(resume.experienceBullets || []).slice(0, 3),
      ...(resume.projectBullets || []).slice(0, 2),
    ].map((b) => b.replace(/\s+/g, " ").trim()),
    4
  );

  const warnings: string[] = [];
  if ((job.requiredLines?.length || 0) + (job.preferredLines?.length || 0) < 4) {
    warnings.push("This job posting looks light on structured requirements. Cover letter may be less targeted.");
  }
  if ((resume.cleaned || "").length < 250) {
    warnings.push("Resume text looks short. Cover letter quality improves with a full resume paste/upload.");
  }

  const subject = `Application: ${role} — ${company}`;

  const intro = `Hello ${company} hiring team,`;
  const p1 =
    `I’m applying for the ${role} role at ${company}. ` +
    (focusSkills.length
      ? `My background includes ${focusSkills.join(", ")}, and I enjoy turning messy problems into clear, measurable improvements.`
      : `I’m excited by the chance to contribute to your team with a pragmatic, results-driven approach.`);

  const p2 = highlights.length
    ? `Highlights from my recent work include:\n` + highlights.map((h) => `- ${h.replace(/[.!?]$/g, "")}.`).join("\n")
    : `I’m confident I can contribute quickly by shipping reliable work, communicating clearly, and iterating based on feedback.`;

  const p3 =
    (matchedSkills.length
      ? `From your posting, I noticed an emphasis on ${matchedSkills.slice(0, 4).join(", ")}. `
      : `From your posting, I noticed an emphasis on strong execution and cross-functional collaboration. `) +
    `I’d welcome the opportunity to discuss how my experience maps to your priorities.`;

  const close = `Thank you for your time,\n${(resume.headline || "").split("\n")[0] || "—"}`;

  const body = [intro, "", p1, "", p2, "", p3, "", close].join("\n");

  return { subject, body, highlights, warnings };
}

