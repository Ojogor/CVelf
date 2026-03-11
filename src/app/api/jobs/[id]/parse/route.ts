import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJob } from "@/lib/ats/parse";
import { cleanJobTitle } from "@/lib/jobTitle";

export const runtime = "nodejs";

function inferLocation(text: string) {
  const t = (text || "").toLowerCase();
  if (/\bremote\b/.test(t)) return "Remote";
  if (/\bhybrid\b/.test(t)) return "Hybrid";
  const m = (text || "").match(/\b(Location|Work Location)\s*:\s*(.+)$/im);
  if (m?.[2]) return m[2].trim().slice(0, 80);
  return undefined;
}

function inferSalary(text: string): string | undefined {
  const raw = text || "";
  const range = raw.match(/(?:Pay|Salary|Compensation)\s*:\s*\$?\s*([\d,.]+)\s*[-–—]\s*\$?\s*([\d,.]+)\s*(?:per year|annually|\/year)?/i);
  if (range?.[1] && range?.[2]) return `$${range[1].trim()}–${range[2].trim()} per year`;
  const single = raw.match(/(?:Pay|Salary)\s*:\s*(\$[\d,.]+(?:\s*per year| annually)?)/i);
  if (single?.[1]) return single[1].trim();
  return undefined;
}

function inferEmploymentType(text: string): string | undefined {
  const t = (text || "").toLowerCase();
  if (/\bfull[- ]?time\b/.test(t)) return "Full-time";
  if (/\bpart[- ]?time\b/.test(t)) return "Part-time";
  if (/\bcontract\b/.test(t)) return "Contract";
  if (/\binternship\b/.test(t)) return "Internship";
  if (/\btemporary\b|\btemp\b/.test(t)) return "Temporary";
  if (/\bfreelance\b/.test(t)) return "Freelance";
  return undefined;
}

/** Exclude lines that are salary, employment type, single tech, location, or EOE from responsibility list. */
function filterResponsibilityItems(lines: string[]): string[] {
  return lines.filter((line) => {
    const t = line.trim().toLowerCase();
    if (!t) return false;
    if (/^(pay|salary|compensation)\s*:/i.test(t) || /\$[\d,]+/.test(t)) return false;
    if (/^(full-time|part-time|contract|internship|temporary|freelance)\s*job$/i.test(t)) return false;
    if (/^remote position\b/i.test(t) || /^applicants located in/i.test(t)) return false;
    if (/^equal opportunity\b/i.test(t) || /accommodation available for recruitment/i.test(t)) return false;
    if (/^commitment to fostering/i.test(t)) return false;
    if (t.length <= 3) return false;
    if (/\bcss attacks\b/i.test(t)) return false;
    if (/^[A-Za-z0-9#+-]+(\s*\([^)]+\))?\s*$/.test(t) && t.length < 90) return false;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length === 1 && /^[a-z0-9#+-]+$/i.test(words[0])) return false;
    if (words.length <= 2 && /^(typescript|javascript|redux|aws|css|html|node\.?js|react|vue|angular|python|java|sql|rds|ecs)$/i.test(words[0])) return false;
    return true;
  });
}

function inferMission(jobText: string) {
  const cleaned = (jobText || "").replace(/\r\n/g, "\n").trim();
  if (!cleaned) return undefined;
  const paras = cleaned.split(/\n{2,}/g).map((p) => p.trim()).filter(Boolean);
  // pick first paragraph that is not a heading and not too long
  for (const p of paras) {
    if (p.length < 60) continue;
    if (p.length > 260) continue;
    if (/^(you will|you bring|bonus points|responsibilities|requirements|qualifications)\b/i.test(p)) continue;
    return p.replace(/\s+/g, " ").trim();
  }
  // fallback: first non-trivial paragraph
  return paras.find((p) => p.length > 60)?.slice(0, 260);
}

function groupBySubheadings(lines: string[]) {
  // Heuristic: treat short non-bullet-ish lines as subheadings.
  const groups: Array<{ title: string; items: string[] }> = [];
  let current: { title: string; items: string[] } = { title: "Overview", items: [] };

  const isSubheading = (l: string) =>
    l.length <= 40 &&
    /^[A-Za-z0-9 &/]+$/.test(l) &&
    !l.toLowerCase().includes("http");

  for (const l of lines) {
    const t = l.trim();
    if (!t) continue;
    if (isSubheading(t)) {
      if (current.items.length) groups.push(current);
      current = { title: t, items: [] };
      continue;
    }
    current.items.push(t);
  }
  if (current.items.length) groups.push(current);
  return groups;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const combined =
      job.parsedRequirements && job.parsedRequirements.trim().length
        ? `${job.description || ""}\n\nRequirements/Qualifications (pasted):\n${job.parsedRequirements}`
        : job.description || "";

    const parsed = parseJob(combined, { title: job.title, company: job.company });
    const location = inferLocation(combined);
    const mission = inferMission(job.description || "");
    const salaryLabel =
      job.salaryMin != null && job.salaryMax != null
        ? `$${job.salaryMin.toLocaleString()}–${job.salaryMax.toLocaleString()} per year`
        : inferSalary(combined);
    const employmentType = inferEmploymentType(combined);
    const filteredResponsibilities = filterResponsibilityItems(parsed.responsibilities);

    const keySkills = Array.from(new Set([...parsed.skillsRequired, ...parsed.skillsPreferred])).slice(0, 18);

    return NextResponse.json({
      overview: {
        title: cleanJobTitle(job.title),
        company: job.company,
        location,
        platform: job.platform,
        url: job.url,
        mission,
        salary: salaryLabel ?? undefined,
        employmentType: employmentType ?? undefined,
      },
      keySkills,
      responsibilities: groupBySubheadings(filteredResponsibilities),
      requirements: parsed.requiredLines,
      niceToHave: parsed.preferredLines,
      raw: { description: job.description, parsedRequirements: job.parsedRequirements || null },
    });
  } catch {
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}

