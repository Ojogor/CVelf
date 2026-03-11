import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { experienceId, text, tags, tools, metrics, position } = body || {};

    if (!experienceId || typeof experienceId !== "string") {
      return NextResponse.json({ error: "experienceId is required" }, { status: 400 });
    }
    const cleanText = typeof text === "string" ? text.trim() : "";
    if (!cleanText) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const last = await prisma.experienceBullet.findFirst({
      where: { experienceId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const created = await prisma.experienceBullet.create({
      data: {
        experienceId,
        text: cleanText,
        tags: typeof tags === "string" ? tags : tags ? String(tags) : null,
        tools: typeof tools === "string" ? tools : tools ? String(tools) : null,
        metrics: typeof metrics === "string" ? metrics : metrics ? String(metrics) : null,
        position: Number.isFinite(position) ? Number(position) : (last?.position ?? 0) + 1,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create bullet" }, { status: 500 });
  }
}

