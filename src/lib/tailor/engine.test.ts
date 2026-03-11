import { describe, expect, it } from "vitest";
import { buildTailor } from "./engine";
import type { JobParsed, ResumeParsed } from "@/lib/ats/types";

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

describe("buildTailor", () => {
  it("produces fastWins and bullet suggestions", () => {
    const job = makeJob({
      cleaned: "We need React, TypeScript and performance optimization.",
      title: "Frontend Engineer",
      requiredLines: ["React", "TypeScript"],
      preferredLines: ["Vitest"],
      responsibilities: ["Build UI components", "Improve performance"],
      skillsRequired: ["react", "typescript"],
      skillsPreferred: ["vitest"],
      keywords: ["react", "typescript", "performance"],
    });
    const resume = makeResume({
      cleaned: "Built React apps and improved performance by 30%.",
      headline: "Frontend Engineer",
      skills: ["react", "typescript"],
      experienceBullets: ["Built React app with TypeScript and improved performance by 30%."],
      projectBullets: ["Wrote tests with Jest."],
    });

    const out = buildTailor(job, resume);
    expect(out.fastWins.length).toBeGreaterThan(0);
    expect(out.tailoredSummaries.length).toBeGreaterThan(0);
    expect(out.bulletSuggestions.length).toBeGreaterThan(0);
    expect(out.extracted.jobRequiredSkills).toEqual(job.skillsRequired);
    expect(out.extracted.resumeSkills).toEqual(resume.skills);
  });
});

