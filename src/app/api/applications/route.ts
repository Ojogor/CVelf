import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const apps = await prisma.application.findMany({
      include: { job: true, resume: true },
      orderBy: { appliedAt: "desc" },
    });
    return NextResponse.json(apps);
  } catch {
    return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, resumeId, appliedAt, outcome, notes, coverLetter } = body || {};
    if (!jobId || !resumeId) {
      return NextResponse.json({ error: "jobId and resumeId are required" }, { status: 400 });
    }
    const app = await prisma.application.create({
      data: {
        jobId: String(jobId),
        resumeId: String(resumeId),
        appliedAt: appliedAt ? new Date(appliedAt) : new Date(),
        outcome: outcome || "applied",
        notes: notes || null,
        coverLetter: coverLetter || null,
      },
      include: { job: true, resume: true },
    });
    return NextResponse.json(app, { status: 201 });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg.includes("Unique constraint failed") || msg.includes("P2002")) {
      return NextResponse.json(
        { error: "Application already exists for this job + resume." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to create application" }, { status: 500 });
  }
}

