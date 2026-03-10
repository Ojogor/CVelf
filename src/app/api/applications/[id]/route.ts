import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const app = await prisma.application.update({
      where: { id },
      data: {
        outcome: body.outcome ?? undefined,
        notes: body.notes ?? undefined,
        coverLetter: body.coverLetter ?? undefined,
        appliedAt: body.appliedAt ? new Date(body.appliedAt) : undefined,
      },
      include: { job: true, resume: true },
    });
    return NextResponse.json(app);
  } catch {
    return NextResponse.json({ error: "Failed to update application" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.application.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete application" }, { status: 500 });
  }
}

