import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { documentToExportPayload } from "@/lib/tailor/document";
import { renderResumeHtmlFromDocument } from "@/lib/render/resumeHtml";
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
  contactLine?: string;
  targetRole?: string;
  company?: string;
  summaryLines: string[];
  skills: string[];
  highlightsBullets: string[];
  experiences?: Array<{ title: string; organization: string; location?: string; dateRange: string; bullets: string[] }>;
  projects?: Array<{ name: string; dateRange?: string; link?: string; bullets: string[] }>;
  education?: Array<{ school: string; degree?: string; location?: string; dateRange?: string; details: string[] }>;
  theme?: { primaryColor: string; accentColor: string; backgroundColor: string };
  fontFamily?: string;
  template: "classic" | "compact";
  sectionIds?: Array<"header" | "summary" | "highlights" | "experience" | "projects" | "education" | "skills">;
};

function stripTrailingPunct(s: string) {
  return (s || "").trim().replace(/[.]+$/g, "");
}

async function renderDocx(input: ExportPayload): Promise<Buffer> {
  const children: Paragraph[] = [];
  const rightTabTwips = 9360;

  children.push(
    new Paragraph({
      children: [new TextRun({ text: input.name || "Resume", bold: true, size: 32 })],
      heading: HeadingLevel.TITLE,
    })
  );
  if (input.contactLine) {
    children.push(new Paragraph({ children: [new TextRun({ text: input.contactLine, size: 20, color: "444444" })] }));
  }
  children.push(new Paragraph({ text: "" }));

  if (input.summaryLines?.length) {
    children.push(new Paragraph({ children: [new TextRun({ text: "SUMMARY", bold: true, size: 22 })], heading: HeadingLevel.HEADING_1 }));
    for (const line of input.summaryLines) children.push(new Paragraph({ children: [new TextRun(line)] }));
    children.push(new Paragraph({ text: "" }));
  }

  const renderSkills = () => {
    if (!input.skills?.length) return;
    children.push(new Paragraph({ children: [new TextRun({ text: "SKILLS", bold: true, size: 22 })], heading: HeadingLevel.HEADING_1 }));
    children.push(new Paragraph({ children: [new TextRun({ text: input.skills.join(" • ") })] }));
    children.push(new Paragraph({ text: "" }));
  };

  const orderedSections = input.sectionIds || ["header", "experience", "projects", "education", "skills"];
  const skillsFirst =
    orderedSections.indexOf("skills") !== -1 &&
    orderedSections.indexOf("skills") < orderedSections.indexOf("experience");
  if (skillsFirst) renderSkills();

  if (input.highlightsBullets?.length) {
    children.push(new Paragraph({ children: [new TextRun({ text: "HIGHLIGHTS", bold: true, size: 22 })], heading: HeadingLevel.HEADING_1 }));
    for (const b of input.highlightsBullets.slice(0, 12)) {
      children.push(new Paragraph({ children: [new TextRun({ text: stripTrailingPunct(b) })], bullet: { level: 0 } }));
    }
    children.push(new Paragraph({ text: "" }));
  }

  if (input.experiences?.length) {
    children.push(new Paragraph({ children: [new TextRun({ text: "EXPERIENCE", bold: true, size: 22 })], heading: HeadingLevel.HEADING_1 }));
    for (const e of input.experiences) {
      const line = [e.title, e.organization].filter(Boolean).join(" — ");
      const meta = [e.location, e.dateRange].filter(Boolean).join(" | ");
      children.push(
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: rightTabTwips }],
          children: [new TextRun({ text: line, bold: true }), new Tab(), new TextRun({ text: meta || "", color: "444444" })],
        })
      );
      for (const b of (e.bullets || []).slice(0, 10)) children.push(new Paragraph({ children: [new TextRun({ text: stripTrailingPunct(b) })], bullet: { level: 0 } }));
      children.push(new Paragraph({ text: "" }));
    }
  }

  if (input.projects?.length) {
    children.push(new Paragraph({ children: [new TextRun({ text: "PROJECTS", bold: true, size: 22 })], heading: HeadingLevel.HEADING_1 }));
    for (const p of input.projects) {
      const link = (p.link || "").trim();
      const metaRuns = link
        ? [
            new TextRun({ text: p.dateRange ? `${p.dateRange} | ` : "", color: "444444" }),
            new ExternalHyperlink({ link, children: [new TextRun({ text: link, color: "0000EE", underline: {} })] }),
          ]
        : [new TextRun({ text: p.dateRange || "", color: "444444" })];
      children.push(new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: rightTabTwips }], children: [new TextRun({ text: p.name || "", bold: true }), new Tab(), ...metaRuns] }));
      for (const b of (p.bullets || []).slice(0, 6)) children.push(new Paragraph({ children: [new TextRun({ text: stripTrailingPunct(b) })], bullet: { level: 0 } }));
      children.push(new Paragraph({ text: "" }));
    }
  }

  if (input.education?.length) {
    children.push(new Paragraph({ children: [new TextRun({ text: "EDUCATION", bold: true, size: 22 })], heading: HeadingLevel.HEADING_1 }));
    for (const e of input.education) {
      const line = [e.school, e.degree].filter(Boolean).join(" — ");
      const meta = [e.location, e.dateRange].filter(Boolean).join(" | ");
      children.push(new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: rightTabTwips }], children: [new TextRun({ text: line, bold: true }), new Tab(), new TextRun({ text: meta || "", color: "444444" })] }));
      for (const d of (e.details || []).slice(0, 4)) children.push(new Paragraph({ children: [new TextRun({ text: stripTrailingPunct(d) })], bullet: { level: 0 } }));
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
  return Packer.toBuffer(doc);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const generatedResumeId = String(body?.generatedResumeId || "").trim();
    const exportFormat = body?.exportFormat === "docx" ? "docx" : "pdf";
    if (!generatedResumeId) return NextResponse.json({ error: "generatedResumeId is required" }, { status: 400 });

    const gr = await prisma.generatedResume.findUnique({ where: { id: generatedResumeId } });
    if (!gr) return NextResponse.json({ error: "Generated resume not found" }, { status: 404 });

    let assembly: any = {};
    try {
      assembly = JSON.parse(gr.assemblyJson || "{}");
    } catch {}
    const docBody = assembly?.document;
    if (!docBody?.blocks?.length) return NextResponse.json({ error: "Generated resume has no document" }, { status: 400 });

    const fromDoc = documentToExportPayload(docBody);
    const payload: ExportPayload = {
      name: fromDoc.name || gr.name,
      contactLine: fromDoc.contactLine,
      summaryLines: fromDoc.summaryLines,
      skills: fromDoc.skills,
      highlightsBullets: fromDoc.highlightsBullets,
      experiences: fromDoc.experiences,
      projects: fromDoc.projects,
      education: fromDoc.education,
      theme: assembly?.theme,
      fontFamily: assembly?.fontFamily,
      template: "classic",
      sectionIds: Array.isArray(assembly?.sections) ? assembly.sections : undefined,
    };

    if (exportFormat === "docx") {
      const buf = await renderDocx(payload);
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(gr.name || "resume")}.docx"`,
        },
      });
    }

    const html = renderResumeHtmlFromDocument(docBody, {
      theme: payload.theme,
      fontFamily: payload.fontFamily,
      fontSize: typeof assembly?.fontSize === "number" ? assembly.fontSize : undefined,
      templateName: typeof assembly?.templateName === "string" ? assembly.templateName : gr.template || undefined,
    });
    const bytes = await htmlToPdfBuffer(html, { format: "Letter" });
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(gr.name || "resume")}.pdf"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Export failed";
    console.error("Export generated failed:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

