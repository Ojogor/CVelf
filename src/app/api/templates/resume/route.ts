import { NextResponse } from "next/server";
import { getResumeTemplate, listResumeTemplates } from "@/lib/resume/templates";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("templateName");
  if (name) {
    const t = getResumeTemplate(name);
    if (!t) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    return NextResponse.json({ template: t });
  }
  return NextResponse.json({ templates: listResumeTemplates() });
}

