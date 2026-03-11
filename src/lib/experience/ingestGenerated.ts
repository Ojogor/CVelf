import type { PrismaClient } from "@prisma/client";
import type { ResumeDocument, ResumeBlock, ExperienceItemContent, BulletContent } from "@/lib/tailor/document";

function normCompany(s: string) {
  return String(s || "").trim().toLowerCase();
}

function normBullet(s: string) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[•\-–—]+\s*/g, "")
    .replace(/\s+\.\s*$/g, ".")
    .toLowerCase();
}

function getExperienceBlock(doc: ResumeDocument): ResumeBlock | null {
  return (doc.blocks || []).find((b) => b.type === "experience") || null;
}

export async function ingestGeneratedResumeToMasterExperience(
  prisma: PrismaClient,
  generatedResumeId: string
): Promise<{
  ok: true;
  experiencesUpserted: number;
  bulletsAdded: number;
  bulletsSkippedDuplicate: number;
}> {
  const gr = await prisma.generatedResume.findUnique({ where: { id: generatedResumeId } });
  if (!gr) throw new Error("Generated resume not found");

  let assembly: any = {};
  try {
    assembly = JSON.parse(gr.assemblyJson || "{}");
  } catch {
    throw new Error("Generated resume assemblyJson is invalid JSON");
  }

  const doc = assembly?.document as ResumeDocument | undefined;
  if (!doc?.blocks?.length) {
    return { ok: true, experiencesUpserted: 0, bulletsAdded: 0, bulletsSkippedDuplicate: 0 };
  }

  const exp = getExperienceBlock(doc);
  const items = (exp?.children || []).filter((c) => c.type === "experience_item");
  if (!items.length) {
    return { ok: true, experiencesUpserted: 0, bulletsAdded: 0, bulletsSkippedDuplicate: 0 };
  }

  let experiencesUpserted = 0;
  let bulletsAdded = 0;
  let bulletsSkippedDuplicate = 0;

  for (const it of items) {
    const c = (it.content || {}) as ExperienceItemContent;
    const organization = String(c.organization || "").trim();
    const title = String(c.title || "").trim();
    if (!organization) continue;

    const normalizedCompany = normCompany(organization);

    // Find existing experience by normalizedCompany only; we will converge titles
    // by preferring the longest/most descriptive one we see.
    let me = await prisma.masterExperience.findFirst({
      where: { normalizedCompany },
      include: { bullets: true },
    });

    if (!me) {
      // Append at end by position
      const last = await prisma.masterExperience.findFirst({
        orderBy: { position: "desc" },
        select: { position: true },
      });

      me = await prisma.masterExperience.create({
        data: {
          type: "job",
          organization,
          normalizedCompany,
          title,
          location: c.location ? String(c.location) : null,
          startDate: c.startDate ? String(c.startDate) : null,
          endDate: c.endDate ? String(c.endDate) : null,
          current: Boolean(c.current),
          position: (last?.position ?? 0) + 1,
          sourceResumeIds: generatedResumeId,
        },
        include: { bullets: true },
      });
      experiencesUpserted += 1;
    } else {
      // Update provenance + fill missing fields (don’t overwrite user edits aggressively)
      const existingIds = new Set(
        String(me.sourceResumeIds || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      );
      existingIds.add(generatedResumeId);
      const nextSource = Array.from(existingIds).join(",");

      // Optionally upgrade the stored title if this one is longer/more specific.
      const nextTitle =
        title && (!me.title || String(title).length > String(me.title).length) ? title : me.title;

      await prisma.masterExperience.update({
        where: { id: me.id },
        data: {
          sourceResumeIds: nextSource,
          title: nextTitle || me.title,
          location: me.location || (c.location ? String(c.location) : null),
          startDate: me.startDate || (c.startDate ? String(c.startDate) : null),
          endDate: me.endDate || (c.endDate ? String(c.endDate) : null),
          current: me.current || Boolean(c.current),
        },
      });
    }

    const existingBulletNorm = new Set((me.bullets || []).map((b) => normBullet(b.text)));
    const newBulletTexts = (it.children || [])
      .filter((b) => b.type === "bullet")
      .map((b) => String(((b.content || {}) as BulletContent).text || "").trim())
      .filter(Boolean);

    // Keep stable position ordering: append after existing max position
    const basePos = (me.bullets || []).reduce((m, b) => Math.max(m, b.position ?? 0), 0) + 1;
    let pos = basePos;

    for (const text of newBulletTexts) {
      const nb = normBullet(text);
      if (!nb) continue;
      if (existingBulletNorm.has(nb)) {
        bulletsSkippedDuplicate += 1;
        continue;
      }
      await prisma.experienceBullet.create({
        data: {
          experienceId: me.id,
          text,
          position: pos++,
          sourceResumeId: generatedResumeId,
          sourceSection: "generated",
        },
      });
      existingBulletNorm.add(nb);
      bulletsAdded += 1;
    }
  }

  return { ok: true, experiencesUpserted, bulletsAdded, bulletsSkippedDuplicate };
}

