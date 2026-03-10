import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cleanText } from "@/lib/ats/clean";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import mammoth from "mammoth";

export const runtime = "nodejs";

function runExtract(pdfPath: string, cwd: string) {
  return new Promise<{ text: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/extract-pdf-text.mjs", pdfPath], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(err || `extract failed (${code})`));
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error("extract returned invalid JSON"));
      }
    });
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const form = await request.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "jobtracker-"));
    const ext = inferExt(file);
    const filePath = path.join(tmpDir, `resume.${ext}`);
    await fs.writeFile(filePath, bytes);

    let extracted = "";
    if (ext === "pdf") {
      const cwd = process.cwd();
      const { text } = await runExtract(filePath, cwd);
      extracted = text || "";
    } else {
      const { value } = await mammoth.extractRawText({ path: filePath });
      extracted = value || "";
    }

    const cleaned = cleanText(extracted);

    const resume = await prisma.resume.update({
      where: { id },
      data: { content: cleaned, filePath },
    });

    return NextResponse.json({ resume, extractedChars: cleaned.length });
  } catch (e) {
    return NextResponse.json({ error: "Replace upload failed" }, { status: 500 });
  }
}

function inferExt(file: File) {
  const t = (file.type || "").toLowerCase();
  const n = (file.name || "").toLowerCase();
  if (t.includes("pdf") || n.endsWith(".pdf")) return "pdf";
  if (t.includes("word") || t.includes("officedocument") || n.endsWith(".docx")) return "docx";
  return "pdf";
}

