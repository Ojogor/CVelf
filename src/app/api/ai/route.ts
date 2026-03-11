import { NextRequest, NextResponse } from "next/server";
import {
  callGeminiWithSchema,
  callGeminiText,
  buildJsonOnlyPrompt,
} from "@/lib/ai/gemini";
import { extractJobStructure, extractResumeStructure, scoreJobFit } from "@/lib/ai/tasks";

export const runtime = "nodejs";

type Provider = "local" | "claude" | "gpt" | "gemini";

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

/** API key must be sent from client (stored locally only). No server env fallback. */
function resolveApiKey(bodyKey: unknown): string {
  return asString(bodyKey).trim();
}

function mapReqOut(obj: any) {
  // Map short keys -> long keys (token optimized output schema)
  // r=required, p=preferred, d=responsibilities, k=keySkills, n=notes
  const arr = (v: any) => (Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : []);
  return {
    required: arr(obj?.r ?? obj?.required),
    preferred: arr(obj?.p ?? obj?.preferred),
    responsibilities: arr(obj?.d ?? obj?.responsibilities),
    keySkills: arr(obj?.k ?? obj?.keySkills),
    notes: arr(obj?.n ?? obj?.notes),
  };
}

function mapInsightsOut(obj: any) {
  // s=summary, m=matched, x=missing, f=fixFirst, c=confidence
  const arr = (v: any) => (Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : []);
  const c = String(obj?.c ?? obj?.confidence ?? "").toLowerCase();
  const conf = c === "high" || c === "medium" || c === "low" ? c : "medium";
  return {
    summary: String(obj?.s ?? obj?.summary ?? "").trim(),
    matched: arr(obj?.m ?? obj?.matched),
    missing: arr(obj?.x ?? obj?.missing),
    fixFirst: arr(obj?.f ?? obj?.fixFirst),
    confidence: conf as "high" | "medium" | "low",
  };
}

function mapTailorOut(obj: any) {
  // b = bullets array, o=original, r=rewrite, w=why
  const bullets = Array.isArray(obj?.b ?? obj?.bullets) ? (obj?.b ?? obj?.bullets) : [];
  return {
    bullets: bullets
      .map((it: any) => ({
        original: String(it?.o ?? it?.original ?? "").trim(),
        rewrite: it?.r === null || it?.rewrite === null ? null : String(it?.r ?? it?.rewrite ?? "").trim() || null,
        why: String(it?.w ?? it?.why ?? "").trim(),
      }))
      .filter((b: any) => b.original),
  };
}

function mapProfileOut(obj: any) {
  const toStr = (v: any) => (typeof v === "string" ? v.trim() : "");
  const arr = (v: any) => (Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : []);

  const profileRaw = obj?.profile ?? {};
  const skillsRaw = obj?.skills ?? {};
  const expsRaw = Array.isArray(obj?.experiences) ? obj.experiences : [];

  const profile = {
    fullName: toStr(profileRaw.fullName ?? profileRaw.name),
    email: toStr(profileRaw.email),
    phone: toStr(profileRaw.phone),
    city: toStr(profileRaw.city),
    region: toStr(profileRaw.region),
    country: toStr(profileRaw.country),
    headline: toStr(profileRaw.headline ?? profileRaw.title),
    linkedin: toStr(profileRaw.linkedin),
    github: toStr(profileRaw.github),
    website: toStr(profileRaw.website),
  };

  const skills = {
    hard: arr(skillsRaw.hard),
    soft: arr(skillsRaw.soft),
    tools: arr(skillsRaw.tools),
  };

  const experiences = expsRaw
    .map((e: any) => ({
      type: toStr(e.type || "job"),
      organization: toStr(e.organization),
      title: toStr(e.title),
      location: toStr(e.location),
      startDate: toStr(e.startDate),
      endDate: toStr(e.endDate),
      current: Boolean(e.current),
      bullets: arr(e.bullets),
      skills: arr(e.skills),
    }))
    .filter((e: any) => e.organization || e.title || e.bullets.length);

  return { profile, skills, experiences };
}

function mapResumeRefineOut(obj: any) {
  const arr = Array.isArray(obj?.s ?? obj?.suggestions) ? (obj?.s ?? obj?.suggestions) : [];
  const normalizeTargetInfo = (t: any) => {
    if (!t || typeof t !== "object") return undefined;
    const bulletIndexRaw = t.bulletIndex ?? t.bullet_index ?? t.i;
    const bulletIndex =
      typeof bulletIndexRaw === "number" && Number.isFinite(bulletIndexRaw)
        ? bulletIndexRaw
        : typeof bulletIndexRaw === "string" && bulletIndexRaw.trim() && Number.isFinite(Number(bulletIndexRaw))
          ? Number(bulletIndexRaw)
          : undefined;
    return {
      section: typeof t.section === "string" && t.section.trim() ? t.section.trim() : undefined,
      company: typeof t.company === "string" && t.company.trim() ? t.company.trim() : undefined,
      role: typeof t.role === "string" && t.role.trim() ? t.role.trim() : undefined,
      bulletIndex,
      blockId: typeof t.blockId === "string" && t.blockId.trim() ? t.blockId.trim() : undefined,
    };
  };
  return {
    suggestions: arr
      .slice(0, 10)
      .map((s: any) => ({
        type: s?.type === "remove" || s?.type === "add" || s?.type === "replace" ? s.type : "replace",
        target: String(s?.target ?? "").trim(),
        value: s?.value != null ? String(s.value).trim() : undefined,
        reason: String(s?.reason ?? "").trim(),
        targetInfo: normalizeTargetInfo(s?.targetInfo ?? s?.t ?? null),
      }))
      .filter((s: any) => s.target || s.reason),
  };
}

function buildCoverLetterRefinePrompt(input: {
  draft: string;
  jobTitle?: string;
  company?: string;
  keySkills?: string[];
  requirements?: string[];
}) {
  const draft = (input.draft || "").trim();
  const jobTitle = (input.jobTitle || "").trim();
  const company = (input.company || "").trim();
  const keySkills = (input.keySkills || []).slice(0, 12);
  const req = (input.requirements || []).slice(0, 12);

  return [
    "Rewrite the following cover letter draft to be concise, human-sounding, and ATS-friendly.",
    "Rules:",
    "- Do not invent experience or metrics.",
    "- Keep it 180-260 words.",
    "- Keep the same meaning; improve clarity and relevance.",
    "- Use the company/role if provided.",
    "- Use 3-5 bullet highlights only if it reads naturally; otherwise keep paragraphs.",
    "",
    `Role: ${jobTitle || "N/A"}`,
    `Company: ${company || "N/A"}`,
    keySkills.length ? `Key skills: ${keySkills.join(", ")}` : "",
    req.length ? `Top requirements: ${req.join(" | ")}` : "",
    "",
    "Draft:",
    draft,
    "",
    "Return ONLY the improved cover letter body text (no markdown, no explanations).",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const provider = asString(body?.provider) as Provider;
    const task = asString(body?.task);
    const input = body?.input ?? {};

    if (!provider || provider === "local") {
      return NextResponse.json({ error: "Provider is local; no AI call made." }, { status: 400 });
    }
    const apiKey = resolveApiKey(body?.apiKey);
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key. Add your Gemini API key in Settings (stored locally only)." }, { status: 400 });
    }

    if (provider === "gemini") {
      if (task === "cover_letter_refine") {
        const prompt = buildCoverLetterRefinePrompt({
          draft: asString(input?.draft),
          jobTitle: asString(input?.jobTitle),
          company: asString(input?.company),
          keySkills: Array.isArray(input?.keySkills) ? input.keySkills : [],
          requirements: Array.isArray(input?.requirements) ? input.requirements : [],
        });
        const result = await callGeminiText(apiKey, prompt, { maxOutputTokens: 650 });
        if (!result.ok) {
          return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
        }
        return NextResponse.json({ ok: true, text: result.text });
      }

      if (task === "job_extract_requirements") {
        const r = await extractJobStructure(apiKey, asString(input?.jobText));
        if (!r.ok) {
          return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
        }
        return NextResponse.json({ ok: true, data: r.data });
      }

      if (task === "job_intelligence_insights") {
        const prompt = buildJsonOnlyPrompt(
          [
            "Return job/resume insight as JSON with these top-level keys: summary, matched, missing, fixFirst, confidence.",
            "Exact JSON shape:",
            "{",
            '  "summary": string,',
            '  "matched": [string],',
            '  "missing": [string],',
            '  "fixFirst": [string],',
            '  "confidence": "low" | "medium" | "high"',
            "}",
            "Rules:",
            "- Be conservative and evidence-only.",
            "- Keep strings short and plain text.",
            "- No markdown, no bullet symbols, no extra keys.",
          ].join("\n"),
          {
            job: input?.job,
            resume: input?.resume,
            local: input?.local,
          }
        );
        const r = await callGeminiWithSchema(apiKey, prompt, mapInsightsOut, {
          maxOutputTokens: 480,
          model: "models/gemini-2.5-flash-lite",
          seedJson: true,
        });
        if (!r.ok) {
          return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
        }
        return NextResponse.json({ ok: true, data: r.data });
      }

      if (task === "tailor_bullets_refine") {
        const prompt = buildJsonOnlyPrompt(
          [
            "Return refined bullets in JSON with this exact shape:",
            "{",
            '  "bullets": [',
            "    {",
            '      "original": string,',
            '      "rewrite": string | null,',
            '      "why": string',
            "    }",
            "  ]",
            "}",
            "Rules:",
            "- Do not invent experience or technologies that are not present.",
            "- One concise sentence per rewrite.",
            "- If you cannot confidently improve a bullet, set rewrite to null.",
            "- No markdown, no extra top-level keys.",
          ].join("\n"),
          {
            bullets: input?.bullets,
            jobRequirements: input?.jobRequirements,
            keySkills: input?.keySkills,
          }
        );
        const r = await callGeminiWithSchema(apiKey, prompt, mapTailorOut, {
          maxOutputTokens: 650,
          model: "models/gemini-2.5-flash-lite",
          seedJson: true,
        });
        if (!r.ok) {
          return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
        }
        return NextResponse.json({ ok: true, data: r.data });
      }

      if (task === "tailor_bullets_refine_text") {
        const bullets = Array.isArray(input?.bullets) ? input.bullets : [];
        if (!bullets.length) {
          return NextResponse.json({ ok: false, error: "No bullets provided." }, { status: 400 });
        }

        const lines = bullets
          .map((b: any, idx: number) => {
            const original = asString(b?.original);
            const matched = asString(b?.matchedRequirement || "");
            const current = asString(b?.currentSuggestion || "");
            return [
              `#${idx + 1}`,
              `ORIGINAL: ${original}`,
              matched ? `MATCHED_REQUIREMENT: ${matched}` : "",
              current ? `CURRENT_SUGGESTION: ${current}` : "",
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n\n");

        const prompt = [
          "You are improving resume bullet suggestions for a specific job.",
          "For each numbered item, write ONE improved bullet that is realistic, ATS-friendly, and not exaggerated.",
          "Rules:",
          "- Keep the same factual meaning; do not invent companies, roles, technologies, or metrics.",
          "- Use strong action verbs and concrete details only when they appear in the ORIGINAL or CURRENT_SUGGESTION.",
          "- Make each bullet a single concise sentence (you may use commas/semicolons).",
          "- Keep all bullets in English.",
          "",
          "Input format:",
          "#1",
          "ORIGINAL: ...",
          "MATCHED_REQUIREMENT: ... (optional)",
          "CURRENT_SUGGESTION: ... (optional)",
          "",
          "Output format:",
          "- Return EXACTLY one improved bullet per line, in order, with no numbering, no labels, no explanations.",
          "- Do NOT return JSON, markdown, bullet symbols, or commentary.",
          "",
          "Items:",
          lines,
        ].join("\n");

        const result = await callGeminiText(apiKey, prompt, {
          maxOutputTokens: 650,
          model: "models/gemini-2.5-flash-lite",
        });
        if (!result.ok) {
          return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
        }
        return NextResponse.json({ ok: true, text: result.text });
      }

      if (task === "tailor_bullet_one") {
        const prompt = buildJsonOnlyPrompt(
          [
            "Rewrite ONE resume bullet for the job.",
            "Return exactly one JSON object with keys: rewrite, why.",
            "Exact JSON shape:",
            "{",
            '  "rewrite": string | null,',
            '  "why": string',
            "}",
            "Rules:",
            "- Do not invent experience or technologies that are not in the input.",
            "- One concise, ATS-friendly sentence in rewrite.",
            "- If unsure, set rewrite to null and explain in why.",
            "- No markdown, no extra keys.",
          ].join("\n"),
          {
            o: asString(input?.original).slice(0, 420),
            j: asString(input?.matchedRequirement).slice(0, 420),
            s: Array.isArray(input?.skills) ? input.skills.slice(0, 12) : [],
          }
        );
        const r = await callGeminiWithSchema(
          apiKey,
          prompt,
          (obj: any) => ({
            rewrite: obj?.r === null ? null : String(obj?.r ?? "").trim() || null,
            why: String(obj?.w ?? "").trim(),
          }),
          {
            maxOutputTokens: 220,
            model: "models/gemini-2.5-flash-lite",
            seedJson: true,
          }
        );
        if (!r.ok) {
          return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
        }
        return NextResponse.json({ ok: true, data: r.data });
      }

      if (task === "job_fit_score") {
        const r = await scoreJobFit(
          apiKey,
          asString(input?.job),
          asString(input?.resume)
        );
        if (!r.ok) {
          return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
        }
        return NextResponse.json({ ok: true, data: r.data });
      }

      if (task === "resume_structured") {
        const r = await extractResumeStructure(apiKey, asString(input?.text));
        if (!r.ok) {
          return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
        }
        return NextResponse.json({ ok: true, data: r.data });
      }

      if (task === "resume_refine_suggestions") {
        const jobDesc = asString(input?.jobDescription).slice(0, 6000);
        const resumeText = asString(input?.resumePlainText).slice(0, 6000);
        const jobTitle = asString(input?.jobTitle).slice(0, 140);
        const company = asString(input?.company).slice(0, 140);
        const outline = Array.isArray(input?.experienceOutline) ? input.experienceOutline.slice(0, 12) : [];
        if (!jobDesc || !resumeText) {
          return NextResponse.json(
            { ok: false, error: "jobDescription and resumePlainText are required." },
            { status: 400 }
          );
        }
        const prompt = buildJsonOnlyPrompt(
          [
            "You are a resume coach. Given a JOB DESCRIPTION and the candidate's current RESUME (plain text), suggest 3–8 concrete edits to better match the job.",
            jobTitle || company ? `Job context: ${[jobTitle, company].filter(Boolean).join(" — ")}` : "",
            outline.length ? `Experience outline (company — role):\n${outline.join("\n")}` : "",
            "Return exactly one JSON object with key: suggestions (array of objects).",
            "Each suggestion object:",
            "{",
            '  "type": "remove" | "add" | "replace",',
            '  "target": "short label for what to change (e.g. \'bullet in Experience\', \'Skills section\', \'Summary\')",',
            '  "value": "for add/replace: the exact text or item to add or the replacement text; omit for remove",',
            '  "reason": "one sentence why this helps for this job",',
            '  "targetInfo": { "section": "header|summary|skills|experience|projects|education", "company": string?, "role": string?, "bulletIndex": number? }',
            "}",
            "Rules:",
            "- remove: suggest removing a bullet or phrase that doesn't match the job.",
            "- add: suggest adding a skill, bullet, or phrase that matches job requirements (only if it fits the candidate's resume).",
            "- replace: suggest rewording a bullet or the summary to mirror job language.",
            "- Be specific: for remove/replace, quote a short snippet from the resume in target if helpful.",
            "- When targeting experience bullets, fill targetInfo.company and targetInfo.role from the experience outline when possible, and set bulletIndex (0-based) for replace/remove.",
            "- No more than 8 suggestions; prioritize high-impact edits.",
            "- Keep value concise; no markdown.",
          ].filter(Boolean).join("\n"),
          { job: jobDesc, resume: resumeText }
        );
        const r = await callGeminiWithSchema(apiKey, prompt, mapResumeRefineOut, {
          maxOutputTokens: 1200,
          model: "models/gemini-2.5-flash-lite",
          seedJson: true,
        });
        if (!r.ok) {
          return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
        }
        return NextResponse.json({ ok: true, data: r.data });
      }

      if (task === "profile_autofill") {
        const prompt = buildJsonOnlyPrompt(
          [
            "Extract a career profile from the input text into JSON.",
            "Return exactly one JSON object with top-level keys: profile, skills, experiences.",
            "profile object:",
            "{",
            '  "fullName": string,',
            '  "email": string,',
            '  "phone": string,',
            '  "city": string,',
            '  "region": string,',
            '  "country": string,',
            '  "headline": string,',
            '  "linkedin": string,',
            '  "github": string,',
            '  "website": string',
            "}",
            "skills object:",
            "{",
            '  "hard": [string],',
            '  "soft": [string],',
            '  "tools": [string]',
            "}",
            "experiences array of objects:",
            "{",
            '  "type": string,',
            '  "organization": string,',
            '  "title": string,',
            '  "location": string,',
            '  "startDate": string,',
            '  "endDate": string,',
            '  "current": boolean,',
            '  "bullets": [string],',
            '  "skills": [string]',
            "}",
            "type examples: job, internship, volunteering, project, education, certification, course.",
            "Dates should be short strings like '2021-03' or 'Present'.",
            "Bullets must come only from the input; do not invent technologies or achievements.",
            "Keep strings concise; no markdown; no extra top-level keys.",
          ].join("\n"),
          {
            t: asString(input?.text).slice(0, 12000),
          }
        );
        const r = await callGeminiWithSchema(apiKey, prompt, mapProfileOut, {
          maxOutputTokens: 900,
          model: "models/gemini-2.5-flash-lite",
          seedJson: true,
          validate: (v) => {
            const exp = (v.experiences || []).length;
            if (exp === 0) return "AI returned no experiences.";
            return null;
          },
        });
        if (!r.ok) {
          return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
        }
        return NextResponse.json({ ok: true, data: r.data });
      }

      return NextResponse.json({ error: "Unknown task." }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Only Gemini is supported. Select Gemini in Settings." },
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI call failed" },
      { status: 500 }
    );
  }
}

