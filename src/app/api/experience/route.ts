import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const exps = await prisma.masterExperience.findMany({
      orderBy: [{ type: "asc" }, { position: "asc" }, { createdAt: "desc" }],
      include: {
        bullets: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    return NextResponse.json(exps);
  } catch {
    return NextResponse.json({ error: "Failed to load experiences" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      type,
      organization,
      title,
      location,
      organizationUrl,
      startDate,
      endDate,
      current,
      skills,
      sourceResumeIds,
    } = body || {};

    if (!organization || !title) {
      return NextResponse.json({ error: "organization and title are required" }, { status: 400 });
    }

    const normalizedCompany = String(organization).trim().toLowerCase();
    const last = await prisma.masterExperience.findFirst({
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const created = await prisma.masterExperience.create({
      data: {
        type: String(type || "job"),
        organization: String(organization),
        normalizedCompany,
        title: String(title),
        location: location ? String(location) : null,
        organizationUrl: organizationUrl ? String(organizationUrl) : null,
        startDate: startDate ? String(startDate) : null,
        endDate: endDate ? String(endDate) : null,
        current: Boolean(current),
        position: (last?.position ?? 0) + 1,
        skills: skills ? String(skills) : null,
        sourceResumeIds: sourceResumeIds ? String(sourceResumeIds) : null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create experience" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { id, ...rest } = body || {};
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const data: any = {};
    if (rest.type !== undefined) data.type = String(rest.type);
    if (rest.organization !== undefined) {
      data.organization = String(rest.organization);
      data.normalizedCompany = String(rest.organization).trim().toLowerCase();
    }
    if (rest.title !== undefined) data.title = String(rest.title);
    if (rest.location !== undefined) data.location = rest.location ? String(rest.location) : null;
    if (rest.organizationUrl !== undefined)
      data.organizationUrl = rest.organizationUrl ? String(rest.organizationUrl) : null;
    if (rest.startDate !== undefined) data.startDate = rest.startDate ? String(rest.startDate) : null;
    if (rest.endDate !== undefined) data.endDate = rest.endDate ? String(rest.endDate) : null;
    if (rest.current !== undefined) data.current = Boolean(rest.current);
    if (rest.skills !== undefined) data.skills = rest.skills ? String(rest.skills) : null;
    if (rest.sourceResumeIds !== undefined)
      data.sourceResumeIds = rest.sourceResumeIds ? String(rest.sourceResumeIds) : null;
    if (rest.position !== undefined && Number.isFinite(rest.position)) data.position = Number(rest.position);

    const updated = await prisma.masterExperience.update({
      where: { id },
      data,
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to update experience" }, { status: 500 });
  }
}

