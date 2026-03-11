import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJob, parseResume } from "@/lib/ats/parse";
import { buildTailor } from "@/lib/tailor/engine";
import { documentToExportPayload } from "@/lib/tailor/document";
import { renderResumeHtmlFromDocument, renderResumeHtmlFromPayload } from "@/lib/render/resumeHtml";
import { htmlToPdfBuffer } from "@/lib/render/htmlToPdf";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Tab,
  ExternalHyperlink,
  TabStopType,
} from "docx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportPayload = {
  name: string;
  targetRole?: string;
  company?: string;
  contactLine?: string;
  summaryLines: string[];
  skills: string[];
  highlightsBullets: string[];
  experiences?: Array<{ title: string; organization: string; location?: string; dateRange: string; bullets: string[] }>;
  projects?: Array<{ name: string; dateRange?: string; link?: string; bullets: string[] }>;
  education?: Array<{ school: string; degree?: string; location?: string; dateRange?: string; details: string[] }>;
  theme?: { primaryColor: string; accentColor: string; backgroundColor: string };
  fontFamily?: string;
  fontSize?: number;
  template: "classic" | "compact";
  sectionIds?: Array<"header" | "summary" | "highlights" | "experience" | "projects" | "education" | "skills">;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      jobId,
      resumeId,
      document: documentBody,
      exportFormat,
      theme,
      fontFamily,
      fontSize,
      chosenSummary,
      acceptedBullets,
      template,
      sectionIds,
      name: nameOverride,
      summaryLines: summaryLinesOverride,
      skills: skillsOverride,
      highlightsBullets: highlightsBulletsOverride,
    } = body || {};

    if (!jobId || !resumeId) {
      return NextResponse.json({ error: "jobId and resumeId are required" }, { status: 400 });
    }

    const [job, resume] = await Promise.all([
      prisma.job.findUnique({ where: { id: String(jobId) } }),
      prisma.resume.findUnique({ where: { id: String(resumeId) } }),
    ]);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (!resume) return NextResponse.json({ error: "Resume not found" }, { status: 404 });

    let payload: ExportPayload;

    if (documentBody && typeof documentBody === "object" && Array.isArray(documentBody.blocks)) {
      const fromDoc = documentToExportPayload(documentBody, {
        targetRole: job.title || undefined,
        company: job.company || undefined,
      });
      payload = {
        name: nameOverride ?? fromDoc.name,
        contactLine: fromDoc.contactLine,
        targetRole: job.title || undefined,
        company: job.company || undefined,
        summaryLines: summaryLinesOverride ?? fromDoc.summaryLines,
        skills: skillsOverride ?? fromDoc.skills,
        highlightsBullets: highlightsBulletsOverride ?? fromDoc.highlightsBullets,
        experiences: fromDoc.experiences,
        projects: fromDoc.projects,
        education: fromDoc.education,
        theme: theme && typeof theme === "object" ? theme : undefined,
        fontFamily: typeof fontFamily === "string" ? fontFamily : undefined,
        fontSize: typeof fontSize === "number" ? fontSize : undefined,
        template: template === "compact" ? "compact" : "classic",
        sectionIds:
          Array.isArray(sectionIds) && sectionIds.length
            ? (sectionIds.filter((s: string) =>
                s === "header" ||
                s === "summary" ||
                s === "highlights" ||
                s === "experience" ||
                s === "projects" ||
                s === "education" ||
                s === "skills"
              ) as ExportPayload["sectionIds"])
            : undefined,
      };
    } else {
      const parsedJob = parseJob(job.description || "", {
        title: job.title || undefined,
        company: job.company || undefined,
      });
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
      payload = {
        name: resume.name,
        targetRole: job.title || undefined,
        company: job.company || undefined,
        summaryLines: summaryLines.slice(0, 2),
        skills,
        highlightsBullets: bullets,
        experiences: [],
        projects: [],
        education: [],
        theme: theme && typeof theme === "object" ? theme : undefined,
        fontFamily: typeof fontFamily === "string" ? fontFamily : undefined,
        fontSize: typeof fontSize === "number" ? fontSize : undefined,
        template: template === "compact" ? "compact" : "classic",
        sectionIds:
          Array.isArray(sectionIds) && sectionIds.length
            ? (sectionIds.filter((s: string) =>
                s === "header" ||
                s === "summary" ||
                s === "highlights" ||
                s === "experience" ||
                s === "projects" ||
                s === "education" ||
                s === "skills"
              ) as ExportPayload["sectionIds"])
            : undefined,
      };
    }

    if (exportFormat === "docx") {
      const docxBuffer = await renderDocx(payload);
      return new NextResponse(new Uint8Array(docxBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="tailored-resume.docx"`,
        },
      });
    }

    if (documentBody && typeof documentBody === "object" && Array.isArray(documentBody.blocks)) {
      const html = renderResumeHtmlFromDocument(documentBody, {
        theme: payload.theme,
        fontFamily: payload.fontFamily,
        fontSize: payload.fontSize,
        templateName: typeof body?.templateName === "string" ? body.templateName : undefined,
      });
      const bytes = await htmlToPdfBuffer(html, { format: "Letter" });
      return new NextResponse(Buffer.from(bytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="tailored-resume.pdf"`,
        },
      });
    }

    const html = renderResumeHtmlFromPayload(
      {
        name: payload.name,
        contactLine: payload.contactLine,
        summaryLines: payload.summaryLines,
        skills: payload.skills,
        highlightsBullets: payload.highlightsBullets,
        experiences: payload.experiences,
        projects: payload.projects,
        education: payload.education,
      },
      { theme: payload.theme, fontFamily: payload.fontFamily, fontSize: payload.fontSize }
    );
    const bytes = await htmlToPdfBuffer(html, { format: "Letter" });
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="tailored-resume.pdf"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Export failed";
    console.error("Export failed:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function stripTrailingPunct(s: string) {
  return (s || "").trim().replace(/[.]+$/g, "");
}

async function renderDocx(input: ExportPayload): Promise<Buffer> {
  const children: Paragraph[] = [];
  const rightTabTwips = 9360; // ~6.5 inches, works on letter

  children.push(
    new Paragraph({
      children: [new TextRun({ text: input.name || "Resume", bold: true, size: 32 })],
      heading: HeadingLevel.TITLE,
    })
  );
  const subtitle = [input.targetRole, input.company].filter(Boolean).join(" — ");
  if (subtitle) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Target: ${subtitle}`, size: 20, color: "444444" })],
      })
    );
  }
  children.push(new Paragraph({ text: "" }));

  // Summary first (not part of template section list yet)
  if (input.summaryLines?.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "SUMMARY", bold: true, size: 22 })],
        heading: HeadingLevel.HEADING_1,
      })
    );
    for (const line of input.summaryLines) {
      children.push(new Paragraph({ children: [new TextRun(line)] }));
    }
    children.push(new Paragraph({ text: "" }));
  }

  // Skills can be ordered by template; for now keep it where it is if selected.
  const orderedSections = input.sectionIds || ["header", "experience", "projects", "education", "skills"];
  const skillsFirst = orderedSections.indexOf("skills") !== -1 && orderedSections.indexOf("skills") < orderedSections.indexOf("experience");

  const renderSkills = () => {
    if (!input.skills?.length) return;
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "SKILLS", bold: true, size: 22 })],
        heading: HeadingLevel.HEADING_1,
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: input.skills.join(" • ") })],
      })
    );
    children.push(new Paragraph({ text: "" }));
  };

  if (skillsFirst) renderSkills();

  if (input.highlightsBullets?.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "HIGHLIGHTS", bold: true, size: 22 })],
        heading: HeadingLevel.HEADING_1,
      })
    );
    for (const b of input.highlightsBullets.slice(0, 12)) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${stripTrailingPunct(b)}` })],
          bullet: { level: 0 },
        })
      );
    }
  }

  if (input.experiences?.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "EXPERIENCE", bold: true, size: 22 })],
        heading: HeadingLevel.HEADING_1,
      })
    );
    for (const e of input.experiences) {
      const line = [e.title, e.organization].filter(Boolean).join(" — ");
      const meta = [e.location, e.dateRange].filter(Boolean).join(" | ");
      children.push(
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: rightTabTwips }],
          children: [
            new TextRun({ text: line, bold: true }),
            new Tab(),
            new TextRun({ text: meta || "", color: "444444" }),
          ],
        })
      );
      for (const b of (e.bullets || []).slice(0, 10)) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: stripTrailingPunct(b) })],
            bullet: { level: 0 },
          })
        );
      }
      children.push(new Paragraph({ text: "" }));
    }
  }

  if (input.projects?.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "PROJECTS", bold: true, size: 22 })],
        heading: HeadingLevel.HEADING_1,
      })
    );
    for (const p of input.projects) {
      const meta = [p.dateRange, p.link].filter(Boolean).join(" | ");
      const link = (p.link || "").trim();
      const metaRuns = link
        ? [
            new TextRun({ text: p.dateRange ? `${p.dateRange} | ` : "", color: "444444" }),
            new ExternalHyperlink({
              link,
              children: [new TextRun({ text: link, color: "0000EE", underline: {} })],
            }),
          ]
        : [new TextRun({ text: meta, color: "444444" })];
      children.push(
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: rightTabTwips }],
          children: [new TextRun({ text: p.name || "", bold: true }), new Tab(), ...metaRuns],
        })
      );
      for (const b of (p.bullets || []).slice(0, 6)) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: stripTrailingPunct(b) })],
            bullet: { level: 0 },
          })
        );
      }
      children.push(new Paragraph({ text: "" }));
    }
  }

  if (input.education?.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "EDUCATION", bold: true, size: 22 })],
        heading: HeadingLevel.HEADING_1,
      })
    );
    for (const e of input.education) {
      const line = [e.school, e.degree].filter(Boolean).join(" — ");
      const meta = [e.location, e.dateRange].filter(Boolean).join(" | ");
      children.push(
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: rightTabTwips }],
          children: [
            new TextRun({ text: line, bold: true }),
            new Tab(),
            new TextRun({ text: meta || "", color: "444444" }),
          ],
        })
      );
      for (const d of (e.details || []).slice(0, 4)) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: stripTrailingPunct(d) })],
            bullet: { level: 0 },
          })
        );
      }
      children.push(new Paragraph({ text: "" }));
    }
  }

  if (!skillsFirst) renderSkills();

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

