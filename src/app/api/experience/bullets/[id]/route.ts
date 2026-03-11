import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const data: any = { text };
    if (body.tags !== undefined) data.tags = body.tags ? String(body.tags) : null;
    if (body.metrics !== undefined) data.metrics = body.metrics ? String(body.metrics) : null;
    if (body.tools !== undefined) data.tools = body.tools ? String(body.tools) : null;
    if (body.position !== undefined && Number.isFinite(body.position)) data.position = Number(body.position);

    const updated = await prisma.experienceBullet.update({
      where: { id },
      data,
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to update bullet" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    await prisma.experienceBullet.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete bullet" }, { status: 500 });
  }
}

