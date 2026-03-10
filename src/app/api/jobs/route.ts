import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localTextSimilarity } from "@/lib/ats/semantic";

export async function GET() {
  try {
    const jobs = await prisma.job.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(jobs);
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, company, url, platform, description, status, deadline } = body;

    const normalizedTitle = (title || "Untitled").trim();
    const normalizedCompany = (company || "Unknown").trim();
    const normalizedDesc = (description || "").trim();

    // Basic dedup/merge: if a very similar job already exists, merge into it.
    const candidates = await prisma.job.findMany({
      where: {
        OR: [
          { company: normalizedCompany },
          { title: normalizedTitle },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    let best: { id: string; score: number } | null = null;
    for (const c of candidates) {
      const titleSim = localTextSimilarity(normalizedTitle, c.title);
      const companySim = localTextSimilarity(normalizedCompany, c.company);
      const descSim =
        normalizedDesc && c.description
          ? localTextSimilarity(normalizedDesc.slice(0, 4000), c.description.slice(0, 4000))
          : 0;
      const score = titleSim * 0.55 + companySim * 0.25 + descSim * 0.45;
      if (!best || score > best.score) best = { id: c.id, score };
    }

    if (best && best.score >= 0.72) {
      const existing = await prisma.job.findUnique({ where: { id: best.id } });
      if (!existing) {
        // fall through to create
      } else {
        const mergedDescription =
          (existing.description || "").length >= normalizedDesc.length
            ? existing.description
            : normalizedDesc || existing.description;
        const mergedUrl = existing.url || (url ? String(url).trim() : null);
        const mergedPlatform = existing.platform || (platform ? String(platform).trim() : null);
        const mergedDeadline = existing.deadline || (deadline ? new Date(deadline) : null);

        const updated = await prisma.job.update({
          where: { id: existing.id },
          data: {
            title: existing.title || normalizedTitle,
            company: existing.company || normalizedCompany,
            url: mergedUrl,
            platform: mergedPlatform,
            description: mergedDescription,
            deadline: mergedDeadline,
          },
        });
        return NextResponse.json({ ...updated, merged: true });
      }
    }

    const job = await prisma.job.create({
      data: {
        title: normalizedTitle,
        company: normalizedCompany,
        url: url ? String(url).trim() : null,
        platform: platform ? String(platform).trim() : null,
        description: normalizedDesc || null,
        status: status || "interested",
        deadline: deadline ? new Date(deadline) : null,
      },
    });
    return NextResponse.json(job, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }
}

