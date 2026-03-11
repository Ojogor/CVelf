import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const runtime = "nodejs";

function cleanJobTitle(raw: string | undefined | null) {
  let t = (raw || "").trim();
  if (!t) return "Untitled";

  const suffixes = [
    /\s*[-–—]\s*job\s*post(ing)?$/i,
    /\s*[-–—]\s*job\s*description$/i,
    /\s*[-–—]\s*careers?\b.*$/i,
    /\s*\|\s*indeed.*$/i,
    /\s*\|\s*linkedin.*$/i,
    /\s*\|\s*glassdoor.*$/i,
  ];

  for (const rx of suffixes) {
    t = t.replace(rx, "").trim();
  }

  return t || "Untitled";
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const jobs = Array.isArray(body) ? body : [body];

    const created = [];
    for (const job of jobs) {
      const { title, company, url, platform, description, status = "interested" } = job || {};
      const createdJob = await prisma.job.create({
        data: {
          title: cleanJobTitle(title),
          company: company?.trim() || "Unknown",
          url: url?.trim() || null,
          platform: platform?.trim() || null,
          description: description?.trim() || null,
          status: (typeof status === "string" && status.trim()) ? status.trim() : "interested",
        },
      });
      created.push(createdJob);
    }

    return NextResponse.json(
      jobs.length === 1 ? created[0] : { added: created.length, jobs: created },
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to save job(s)", detail: message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

