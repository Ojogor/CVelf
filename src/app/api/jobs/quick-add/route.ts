import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const jobs = Array.isArray(body) ? body : [body];

    const created = [];
    for (const job of jobs) {
      const { title, company, url, platform, description, status = "pending" } = job || {};
      const createdJob = await prisma.job.create({
        data: {
          title: title?.trim() || "Untitled",
          company: company?.trim() || "Unknown",
          url: url?.trim() || null,
          platform: platform?.trim() || null,
          description: description?.trim() || null,
          status,
        },
      });
      created.push(createdJob);
    }

    return NextResponse.json(
      jobs.length === 1 ? created[0] : { added: created.length, jobs: created },
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (e) {
    return NextResponse.json({ error: "Failed to save job(s)" }, { status: 500, headers: CORS_HEADERS });
  }
}

