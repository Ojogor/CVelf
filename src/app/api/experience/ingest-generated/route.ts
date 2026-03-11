import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingestGeneratedResumeToMasterExperience } from "@/lib/experience/ingestGenerated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const generatedResumeId = typeof body?.generatedResumeId === "string" ? body.generatedResumeId.trim() : "";
    const ingestAll = Boolean(body?.ingestAll);
    const rebuild = Boolean(body?.rebuild);

    if (!generatedResumeId && !ingestAll && !rebuild) {
      return NextResponse.json({ error: "Provide generatedResumeId, ingestAll=true, or rebuild=true" }, { status: 400 });
    }

    if (rebuild) {
      // Full regeneration: clear existing MasterExperience/ExperienceBullet rows
      // and then re-ingest from all GeneratedResumes.
      await prisma.experienceBullet.deleteMany({});
      await prisma.masterExperience.deleteMany({});
      const all = await prisma.generatedResume.findMany({ select: { id: true } });
      const results: any[] = [];
      for (const g of all) {
        try {
          const r = await ingestGeneratedResumeToMasterExperience(prisma, g.id);
          results.push({ id: g.id, ...r });
        } catch (e) {
          results.push({ id: g.id, ok: false, error: e instanceof Error ? e.message : "Ingest failed" });
        }
      }
      return NextResponse.json({ ok: true, mode: "rebuild", results });
    }

    if (ingestAll) {
      const all = await prisma.generatedResume.findMany({ select: { id: true } });
      const results: any[] = [];
      for (const g of all) {
        try {
          const r = await ingestGeneratedResumeToMasterExperience(prisma, g.id);
          results.push({ id: g.id, ...r });
        } catch (e) {
          results.push({ id: g.id, ok: false, error: e instanceof Error ? e.message : "Ingest failed" });
        }
      }
      return NextResponse.json({ ok: true, results });
    }

    const r = await ingestGeneratedResumeToMasterExperience(prisma, generatedResumeId);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ingest failed" }, { status: 500 });
  }
}

