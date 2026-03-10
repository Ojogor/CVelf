import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJob } from "@/lib/ats/parse";

export const runtime = "nodejs";

function inferLocation(text: string) {
  const t = (text || "").toLowerCase();
  if (/\bremote\b/.test(t)) return "Remote";
  if (/\bhybrid\b/.test(t)) return "Hybrid";
  // very light heuristic; can be improved later
  const m = (text || "").match(/\b(Location|Work Location)\s*:\s*(.+)$/im);
  if (m?.[2]) return m[2].trim().slice(0, 80);
  return undefined;
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
    const location = inferLocation(job.description || "");
    const mission = inferMission(job.description || "");

    const keySkills = Array.from(new Set([...parsed.skillsRequired, ...parsed.skillsPreferred])).slice(0, 18);

    return NextResponse.json({
      overview: {
        title: job.title,
        company: job.company,
        location,
        platform: job.platform,
        url: job.url,
        mission,
      },
      keySkills,
      responsibilities: groupBySubheadings(parsed.responsibilities),
      requirements: parsed.requiredLines,
      niceToHave: parsed.preferredLines,
      raw: { description: job.description, parsedRequirements: job.parsedRequirements || null },
    });
  } catch {
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}

