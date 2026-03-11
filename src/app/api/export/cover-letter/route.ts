import { NextRequest, NextResponse } from "next/server";
import { renderCoverLetterHtml } from "@/lib/render/coverLetterHtml";
import { htmlToPdfBuffer } from "@/lib/render/htmlToPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const subject = typeof body?.subject === "string" ? body.subject : "";
    const letterBody = typeof body?.body === "string" ? body.body : "";
    const theme = body?.theme && typeof body.theme === "object" ? body.theme : undefined;
    const fontFamily = typeof body?.fontFamily === "string" ? body.fontFamily : undefined;
    const fontSize = typeof body?.fontSize === "number" ? body.fontSize : undefined;

    if (!letterBody.trim()) return NextResponse.json({ error: "body is required" }, { status: 400 });

    const html = renderCoverLetterHtml({ subject, body: letterBody }, { theme, fontFamily, fontSize });
    const bytes = await htmlToPdfBuffer(html, { format: "Letter" });

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="cover-letter.pdf"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Export failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

