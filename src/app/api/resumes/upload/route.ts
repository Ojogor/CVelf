import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cleanText } from "@/lib/ats/clean";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import mammoth from "mammoth";

export const runtime = "nodejs";

function runExtract(pdfPath: string) {
  return new Promise<{ text: string }>((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), "scripts", "extract-pdf-text.mjs");
    const child = spawn(process.execPath, [scriptPath, pdfPath], {
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

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const name = String(form.get("name") || "Uploaded resume");
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
      const { text } = await runExtract(filePath);
      extracted = text || "";
    } else {
      const { value } = await mammoth.extractRawText({ path: filePath });
      extracted = value || "";
    }

    const cleaned = cleanText(extracted);

    const resume = await prisma.resume.create({
      data: {
        name,
        content: cleaned,
      },
    });

    // Best-effort cleanup of temporary files; ignore failures.
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    return NextResponse.json({ resume, extractedChars: cleaned.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}

function inferExt(file: File) {
  const t = (file.type || "").toLowerCase();
  const n = (file.name || "").toLowerCase();
  if (t.includes("pdf") || n.endsWith(".pdf")) return "pdf";
  if (t.includes("word") || t.includes("officedocument") || n.endsWith(".docx")) return "docx";
  return "pdf";
}

