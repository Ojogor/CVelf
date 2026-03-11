import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const resume = await prisma.resume.findUnique({ where: { id: params.id } });
    if (!resume) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }
    return NextResponse.json(resume);
  } catch {
    return NextResponse.json({ error: "Failed to fetch resume" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json().catch(() => ({}));
    const data: any = {};
    if (body.name !== undefined) data.name = String(body.name || "Untitled resume").trim();
    if (body.content !== undefined) data.content = body.content || null;

    const updated = await prisma.resume.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to update resume" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await prisma.resume.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete resume" }, { status: 500 });
  }
}

