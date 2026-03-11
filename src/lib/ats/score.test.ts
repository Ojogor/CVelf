import { describe, expect, it } from "vitest";
import { scoreHybrid } from "./score";
import type { JobParsed, ResumeParsed } from "./types";

function makeJob(p: Partial<JobParsed>): JobParsed {
  return {
    raw: p.raw ?? "",
    cleaned: p.cleaned ?? "",
    title: p.title,
    company: p.company,
    requiredLines: p.requiredLines ?? [],
    preferredLines: p.preferredLines ?? [],
    responsibilities: p.responsibilities ?? [],
    skillsRequired: p.skillsRequired ?? [],
    skillsPreferred: p.skillsPreferred ?? [],
    keywords: p.keywords ?? [],
  };
}

function makeResume(p: Partial<ResumeParsed>): ResumeParsed {
  return {
    raw: p.raw ?? "",
    cleaned: p.cleaned ?? "",
    headline: p.headline,
    summary: p.summary,
    skills: p.skills ?? [],
    certifications: p.certifications ?? [],
    experienceBullets: p.experienceBullets ?? [],
    projectBullets: p.projectBullets ?? [],
  };
}

describe("scoreHybrid", () => {
  it("returns stable ScoreResult shape and clamps score to 0..100", () => {
    const job = makeJob({
      cleaned: "React TypeScript Next.js responsibilities...",
      title: "Frontend Engineer",
      skillsRequired: ["react", "typescript", "next.js"],
      skillsPreferred: ["vitest"],
    });
    const resume = makeResume({
      cleaned: "Built React apps with TypeScript.",
      headline: "Frontend Engineer",
      skills: ["react", "typescript"],
      experienceBullets: ["Built React app with TypeScript and improved performance by 30%."],
      projectBullets: ["Created Next.js side project."],
    });

    const result = scoreHybrid(job, resume);
    expect(result).toHaveProperty("overallScore");
    expect(result).toHaveProperty("breakdown");
    expect(result).toHaveProperty("suggestions");
    expect(result.parsed.job).toBeTruthy();
    expect(result.parsed.resume).toBeTruthy();
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it("handles empty skills gracefully", () => {
    const job = makeJob({ cleaned: "Job", skillsRequired: [], skillsPreferred: [] });
    const resume = makeResume({ cleaned: "Resume", skills: [] });
    const result = scoreHybrid(job, resume);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});

