import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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

    const job = await prisma.job.create({
      data: {
        title: title || "Untitled",
        company: company || "Unknown",
        url: url || null,
        platform: platform || null,
        description: description || null,
        status: status || "pending",
        deadline: deadline ? new Date(deadline) : null,
      },
    });
    return NextResponse.json(job);
  } catch (e) {
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }
}

