import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const resumes = await prisma.resume.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json(resumes);
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch resumes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, content } = body || {};
    const resume = await prisma.resume.create({
      data: {
        name: (name || "Untitled resume").trim(),
        content: content || null,
      },
    });
    return NextResponse.json(resume, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "Failed to create resume" }, { status: 500 });
  }
}

