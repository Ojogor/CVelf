import { cleanText, toLines } from "./clean";
import { extractSkills } from "./skills";
import type { JobParsed, ResumeParsed } from "./types";

const JOB_REQUIRED_HEADINGS = [
  "requirements",
  "required",
  "qualifications",
  "what you'll bring",
  "what you bring",
  "must have",
  "minimum qualifications",
] as const;

const JOB_PREFERRED_HEADINGS = [
  "preferred",
  "nice to have",
  "bonus",
  "assets",
  "preferred qualifications",
] as const;

const JOB_RESP_HEADINGS = [
  "responsibilities",
  "what you'll do",
  "what you will do",
  "role",
  "about the role",
  "you will",
] as const;

function headingKey(line: string) {
  const l = line.toLowerCase().replace(/[:\-–—]+$/g, "").trim();
  return l;
}

function isHeading(line: string) {
  const l = headingKey(line);
  if (l.length < 3 || l.length > 60) return false;
  return /^[a-z0-9 '&/]+$/.test(l) && (line === line.toUpperCase() || /:$/.test(line));
}

export function parseJob(raw: string, meta?: { title?: string; company?: string }): JobParsed {
  const cleaned = cleanText(raw);
  const lines = toLines(cleaned);

  let section: "required" | "preferred" | "responsibilities" | "other" = "other";
  const requiredLines: string[] = [];
  const preferredLines: string[] = [];
  const responsibilities: string[] = [];

  for (const line of lines) {
    const hk = headingKey(line);
    if (isHeading(line)) {
      if (JOB_REQUIRED_HEADINGS.includes(hk as any)) section = "required";
      else if (JOB_PREFERRED_HEADINGS.includes(hk as any)) section = "preferred";
      else if (JOB_RESP_HEADINGS.includes(hk as any)) section = "responsibilities";
      else section = "other";
      continue;
    }

    const trimmed = line.replace(/^\-\s+/, "").trim();
    if (!trimmed) continue;

    if (section === "required") requiredLines.push(trimmed);
    else if (section === "preferred") preferredLines.push(trimmed);
    else if (section === "responsibilities") responsibilities.push(trimmed);
  }

  // fallback: if nothing extracted, treat bullet-ish lines as responsibilities
  if (requiredLines.length + preferredLines.length + responsibilities.length < 4) {
    for (const line of lines) {
      if (line.startsWith("- ")) responsibilities.push(line.slice(2).trim());
    }
  }

  const skillsAll = extractSkills(cleaned);
  const skillsRequired = extractSkills(requiredLines.join("\n"));
  const skillsPreferred = extractSkills(preferredLines.join("\n"));

  const keywords = buildKeywords(cleaned, skillsAll);

  return {
    raw,
    cleaned,
    title: meta?.title,
    company: meta?.company,
    requiredLines,
    preferredLines,
    responsibilities,
    skillsRequired,
    skillsPreferred,
    keywords,
  };
}

export function parseResume(raw: string): ResumeParsed {
  const cleaned = cleanText(raw);
  const lines = toLines(cleaned);

  // crude bullet extraction
  const bullets = lines
    .filter((l) => /^[-*]\s+/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, "").trim())
    .filter((b) => b.length >= 12);

  // naive split: first half as experience bullets, second half as project bullets
  const midpoint = Math.floor(bullets.length * 0.65);
  const experienceBullets = bullets.slice(0, midpoint);
  const projectBullets = bullets.slice(midpoint);

  // headline: first non-empty line
  const headline = lines[0];

  // summary: first paragraph-ish chunk (until blank line)
  const summaryLines: string[] = [];
  for (const l of cleaned.split("\n")) {
    const t = l.trim();
    if (!t) break;
    if (/^[-*]\s+/.test(t)) break;
    summaryLines.push(t);
    if (summaryLines.join(" ").length > 500) break;
  }
  const summary = summaryLines.length >= 2 ? summaryLines.join(" ") : undefined;

  const skills = extractSkills(cleaned);
  const certifications = extractCerts(cleaned);

  return {
    raw,
    cleaned,
    headline,
    summary,
    skills,
    certifications,
    experienceBullets,
    projectBullets,
  };
}

function extractCerts(text: string) {
  const t = text.toLowerCase();
  const certs = new Set<string>();
  const candidates = [
    "aws certified",
    "azure fundamentals",
    "google cloud",
    "pmp",
    "scrum master",
    "security+",
    "network+",
  ];
  for (const c of candidates) if (t.includes(c)) certs.add(c);
  return Array.from(certs);
}

function buildKeywords(text: string, skills: string[]) {
  const t = text.toLowerCase();
  const words = t
    .replace(/[^a-z0-9\s\-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && w.length <= 24);
  const stop = new Set([
    "with",
    "and",
    "that",
    "this",
    "will",
    "your",
    "youll",
    "from",
    "have",
    "work",
    "team",
    "role",
    "years",
    "year",
    "experience",
    "skills",
    "ability",
    "building",
    "software",
    "develop",
    "developing",
    "engineer",
    "engineering",
  ]);

  const freq = new Map<string, number>();
  for (const w of words) {
    if (stop.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  const ranked = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([w]) => w);

  const combined = Array.from(new Set([...skills, ...ranked]));
  return combined.slice(0, 25);
}

