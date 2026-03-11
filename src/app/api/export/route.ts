import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJob, parseResume } from "@/lib/ats/parse";
import { buildTailor } from "@/lib/tailor/engine";
import PDFDocument from "pdfkit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, resumeId, chosenSummary, acceptedBullets, template, sectionsOrder } = body || {};
    if (!jobId || !resumeId) {
      return NextResponse.json({ error: "jobId and resumeId are required" }, { status: 400 });
    }

    const [job, resume] = await Promise.all([
      prisma.job.findUnique({ where: { id: String(jobId) } }),
      prisma.resume.findUnique({ where: { id: String(resumeId) } }),
    ]);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (!resume) return NextResponse.json({ error: "Resume not found" }, { status: 404 });

    const parsedJob = parseJob(job.description || "", { title: job.title || undefined, company: job.company || undefined });
    const parsedResume = parseResume(resume.content || "");
    const tailor = buildTailor(parsedJob, parsedResume);

    const summaryLines =
      typeof chosenSummary === "string" && chosenSummary.trim()
        ? [chosenSummary.trim()]
        : tailor.tailoredSummaries;

    const bullets: string[] = Array.isArray(acceptedBullets)
      ? acceptedBullets.filter((b) => typeof b === "string" && b.trim()).map((b) => b.trim())
      : tailor.bulletSuggestions
          .filter((b) => b.suggestion && (b.confidence === "strong" || b.confidence === "moderate"))
          .slice(0, 10)
          .map((b) => b.suggestion as string);

    const skills = tailor.suggestedSkillOrder.slice(0, 24);

    const pdfBytes = await renderPdf({
      name: resume.name,
      targetRole: job.title,
      company: job.company,
      summaryLines: summaryLines.slice(0, 2),
      skills,
      bullets,
      template: template === "compact" ? "compact" : "classic",
      sectionsOrder:
        Array.isArray(sectionsOrder) && sectionsOrder.length
          ? (sectionsOrder.filter((s: string) =>
              s === "summary" || s === "skills" || s === "highlights",
            ) as Array<"summary" | "skills" | "highlights">)
          : ["summary", "skills", "highlights"],
    });

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="tailored-resume.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

async function renderPdf(input: {
  name: string;
  targetRole: string;
  company: string;
  summaryLines: string[];
  skills: string[];
  bullets: string[];
  template: "classic" | "compact";
  sectionsOrder: Array<"summary" | "skills" | "highlights">;
}): Promise<ArrayBuffer> {
  const doc = new PDFDocument({
    size: "LETTER",
    margins:
      input.template === "compact"
        ? { top: 40, bottom: 40, left: 40, right: 40 }
        : { top: 54, bottom: 54, left: 54, right: 54 },
    info: { Title: "Tailored Resume" },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (d) => chunks.push(Buffer.from(d)));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.font("Helvetica");

  // Header
  const headingSize = input.template === "compact" ? 16 : 18;
  const subtitleSize = input.template === "compact" ? 9 : 10;

  doc.fontSize(headingSize).text(input.name || "Resume", { align: "left" });
  doc.moveDown(0.2);
  doc
    .fontSize(subtitleSize)
    .fillColor("#444")
    .text(`Target: ${input.targetRole} — ${input.company}`, { align: "left" });
  doc.fillColor("#000");
  doc.moveDown(0.8);

  const drawSummary = () => {
    sectionTitle(doc, "SUMMARY");
    doc.fontSize(11);
    for (const l of input.summaryLines) doc.text(l, { lineGap: 2 });
    doc.moveDown(0.6);
  };

  const drawSkills = () => {
    sectionTitle(doc, "SKILLS");
    doc.fontSize(10).text(input.skills.join(" • "), { lineGap: 2 });
    doc.moveDown(0.6);
  };

  const drawHighlights = () => {
    sectionTitle(doc, "HIGHLIGHTS");
    doc.fontSize(11);
    for (const b of input.bullets.slice(0, 12)) {
      doc.text(`• ${stripTrailingPunct(b)}`, { lineGap: 2 });
    }
  };

  const visited = new Set<string>();
  for (const key of input.sectionsOrder) {
    if (visited.has(key)) continue;
    visited.add(key);
    if (key === "summary") drawSummary();
    else if (key === "skills") drawSkills();
    else if (key === "highlights") drawHighlights();
  }

  doc.end();
  const pdf = await done;
  // NextResponse expects a web BodyInit; copy into an ArrayBuffer (not SharedArrayBuffer).
  const bytes = Uint8Array.from(pdf);
  return bytes.buffer;
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.font("Helvetica-Bold").fontSize(10).text(title);
  doc.font("Helvetica").moveDown(0.2);
}

function stripTrailingPunct(s: string) {
  return (s || "").trim().replace(/[.]+$/g, "");
}

