import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cleanText } from "@/lib/ats/clean";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

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
    const pdfPath = path.join(tmpDir, "resume.pdf");
    await fs.writeFile(pdfPath, bytes);

    const cwd = process.cwd();
    const { text } = await runExtract(pdfPath, cwd);
    const cleaned = cleanText(text || "");

    const resume = await prisma.resume.create({
      data: {
        name,
        content: cleaned,
        filePath: pdfPath,
      },
    });

    return NextResponse.json({ resume, extractedChars: cleaned.length });
  } catch (e) {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

