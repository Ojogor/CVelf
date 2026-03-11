import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { documentToPlainText } from "@/lib/tailor/document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ResumeOption =
  | {
      kind: "master";
      id: "master";
      name: "Master (combined)";
      updatedAt: string;
      content: string;
    }
  | {
      kind: "resume";
      id: string;
      name: string;
      updatedAt: string;
      content: string;
    }
  | {
      kind: "generated";
      id: string;
      name: string;
      updatedAt: string;
      content: string;
      template?: string | null;
    };

export async function GET() {
  try {
    const [resumes, generated] = await Promise.all([
      prisma.resume.findMany({ orderBy: { updatedAt: "desc" } }),
      prisma.generatedResume.findMany({ orderBy: { updatedAt: "desc" } }),
    ]);

    const generatedDocs: Array<{ id: string; text: string }> = generated.map((g) => {
      let t = "";
      try {
        const assembly = JSON.parse(g.assemblyJson || "{}");
        if (assembly?.document?.blocks?.length) {
          t = documentToPlainText(assembly.document);
        }
      } catch {}
      return { id: g.id, text: t };
    });

    const masterText = [
      ...resumes.map((r) => (r.content ? String(r.content) : "")),
      ...generatedDocs.map((g) => g.text),
    ]
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .join("\n\n---\n\n");

    const masterUpdated =
      [0, ...resumes.map((r) => new Date(r.updatedAt).getTime()), ...generated.map((r) => new Date(r.updatedAt).getTime())].reduce(
        (a, b) => Math.max(a, b),
        0
      ) || Date.now();

    const options: ResumeOption[] = [
      {
        kind: "master",
        id: "master",
        name: "Master (combined)",
        updatedAt: new Date(masterUpdated).toISOString(),
        content: masterText,
      },
      ...generated.map((r) => ({
        kind: "generated" as const,
        id: r.id,
        name: r.name,
        updatedAt: new Date(r.updatedAt).toISOString(),
        content: generatedDocs.find((x) => x.id === r.id)?.text || "",
        template: r.template,
      })),
      ...resumes.map((r) => ({
        kind: "resume" as const,
        id: r.id,
        name: r.name,
        updatedAt: new Date(r.updatedAt).toISOString(),
        content: r.content ? String(r.content) : "",
      })),
    ];

    return NextResponse.json(options);
  } catch {
    return NextResponse.json({ error: "Failed to fetch resume options" }, { status: 500 });
  }
}

