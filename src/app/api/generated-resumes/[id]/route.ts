import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingestGeneratedResumeToMasterExperience } from "@/lib/experience/ingestGenerated";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const item = await prisma.generatedResume.findUnique({ where: { id: params.id } });
    if (!item) return NextResponse.json({ error: "Generated resume not found" }, { status: 404 });
    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ error: "Failed to fetch generated resume" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    const data: any = {};
    if (body.name !== undefined) data.name = String(body.name || "New resume").trim();
    if (body.template !== undefined) data.template = String(body.template || "resume_elf_modern");
    if (body.assemblyJson !== undefined) data.assemblyJson = String(body.assemblyJson || "{}");
    if (body.targetJobId !== undefined) data.targetJobId = body.targetJobId ? String(body.targetJobId) : null;

    const updated = await prisma.generatedResume.update({ where: { id: params.id }, data });
    // If assemblyJson changed, best-effort ingest to experience bank.
    if (body.assemblyJson !== undefined) {
      ingestGeneratedResumeToMasterExperience(prisma, params.id).catch(() => {});
    }
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to update generated resume" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.generatedResume.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete generated resume" }, { status: 500 });
  }
}

