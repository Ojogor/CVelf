import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const items = await prisma.generatedResume.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json(items);
  } catch {
    return NextResponse.json({ error: "Failed to fetch generated resumes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name || "New resume").trim();
    const template = String(body?.template || "resume_elf_modern");
    const assemblyJson = typeof body?.assemblyJson === "string" ? body.assemblyJson : JSON.stringify(body?.assembly ?? {});

    const created = await prisma.generatedResume.create({
      data: {
        name,
        template,
        assemblyJson,
        targetJobId: body?.targetJobId ? String(body.targetJobId) : null,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create generated resume" }, { status: 500 });
  }
}

