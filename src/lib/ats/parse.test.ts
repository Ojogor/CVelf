import { describe, expect, it } from "vitest";
import { parseJob, parseResume } from "./parse";

describe("parseJob", () => {
  it("extracts required/preferred/responsibilities from headings and bullets", () => {
    const text = `
Frontend Engineer

Requirements:
- React
- TypeScript

Preferred Qualifications:
- Next.js

Responsibilities:
1. Build UI components
2. Improve performance
`;

    const job = parseJob(text, { title: "Frontend Engineer", company: "Acme" });

    expect(job.title).toBe("Frontend Engineer");
    expect(job.company).toBe("Acme");

    expect(job.requiredLines).toEqual(["React", "TypeScript"]);
    expect(job.preferredLines).toEqual(["Next.js"]);
    expect(job.responsibilities).toEqual(["Build UI components", "Improve performance"]);

    expect(Array.isArray(job.skillsRequired)).toBe(true);
    expect(Array.isArray(job.skillsPreferred)).toBe(true);
  });

  it("falls back to bullet-ish lines as responsibilities when extraction is sparse", () => {
    const text = `
We are hiring.
- ship features quickly
- work with stakeholders
- write tests
`;
    const job = parseJob(text);
    expect(job.responsibilities.length).toBeGreaterThanOrEqual(3);
  });
});

describe("parseResume", () => {
  it("extracts bullets and splits experience vs project bullets", () => {
    const text = `
Jane Doe
Frontend Engineer

Summary line one.
Summary line two.

- Built React app for e-commerce with TypeScript and Stripe
- Improved performance by 30% via code splitting
- Created internal tools using Next.js and Prisma
- Led migration from JS to TS across 20k LOC
`;
    const resume = parseResume(text);
    expect(resume.headline).toBe("Jane Doe");
    expect(resume.summary).toBeTruthy();
    expect(resume.experienceBullets.length + resume.projectBullets.length).toBeGreaterThanOrEqual(4);
    expect(Array.isArray(resume.skills)).toBe(true);
  });
});

