/**
 * Server-callable AI tasks for job and resume structure extraction.
 * Used by api/ai route and by api/score and api/tailor when AI is enabled.
 */

import {
  callGeminiWithSchema,
  buildJsonOnlyPrompt,
} from "@/lib/ai/gemini";

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

export type JobExtractData = {
  required: string[];
  preferred: string[];
  responsibilities: string[];
  keySkills: string[];
  notes: string[];
};

function mapReqOut(obj: any): JobExtractData {
  const arr = (v: any) => (Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : []);
  return {
    required: arr(obj?.r ?? obj?.required),
    preferred: arr(obj?.p ?? obj?.preferred),
    responsibilities: arr(obj?.d ?? obj?.responsibilities),
    keySkills: arr(obj?.k ?? obj?.keySkills),
    notes: arr(obj?.n ?? obj?.notes),
  };
}

export async function extractJobStructure(
  apiKey: string,
  jobText: string
): Promise<{ ok: true; data: JobExtractData } | { ok: false; error: string }> {
  const prompt = buildJsonOnlyPrompt(
    [
      "From the FULL job description below, extract structured data into JSON with exactly these top-level keys: required, preferred, responsibilities, keySkills, notes.",
      "required: must-have qualifications/skills/experience (Requirements, Qualifications, Must have).",
      "preferred: nice-to-have (Preferred, Bonus, Nice to have).",
      "responsibilities: role duties (Responsibilities, What you'll do).",
      "keySkills: technologies, tools, languages (Skills, Tech stack).",
      "notes: any other notable items (one short string per note).",
      "Return exactly one JSON object:",
      "{ \"required\": [string], \"preferred\": [string], \"responsibilities\": [string], \"keySkills\": [string], \"notes\": [string] }",
      "Rules: Each array element is one short plain-text item. No markdown, no bullet symbols, no extra keys.",
    ].join("\n"),
    { t: asString(jobText).slice(0, 8000) }
  );
  return callGeminiWithSchema(apiKey, prompt, mapReqOut, {
    maxOutputTokens: 1200,
    model: "models/gemini-2.5-flash-lite",
    seedJson: true,
    validate: (v) => {
      const req = (v.required || []).length;
      const pref = (v.preferred || []).length;
      const resp = (v.responsibilities || []).length;
      const skills = (v.keySkills || []).length;
      if (req + pref + resp + skills === 0) return "AI returned no requirements, preferred, responsibilities, or key skills.";
      return null;
    },
  });
}

export type ResumeStructuredData = {
  skills: string[];
  experienceBullets: string[];
  projectBullets: string[];
  summary: string;
};

function mapResumeStructuredOut(obj: any): ResumeStructuredData {
  const arr = (v: any) => (Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : []);
  return {
    skills: arr(obj?.skills ?? obj?.s),
    experienceBullets: arr(obj?.experienceBullets ?? obj?.experience ?? obj?.exp),
    projectBullets: arr(obj?.projectBullets ?? obj?.projects ?? obj?.proj),
    summary: typeof obj?.summary === "string" ? obj.summary.trim() : "",
  };
}

export async function extractResumeStructure(
  apiKey: string,
  resumeText: string
): Promise<{ ok: true; data: ResumeStructuredData } | { ok: false; error: string }> {
  const prompt = buildJsonOnlyPrompt(
    [
      "Extract structured resume data into JSON with these top-level keys: skills, experienceBullets, projectBullets, summary.",
      "Return exactly one JSON object of the form:",
      "{",
      '  "skills": [string],',
      '  "experienceBullets": [string],',
      '  "projectBullets": [string],',
      '  "summary": string',
      "}",
      "Rules:",
      "- skills: technologies, tools, languages, frameworks (no fluff).",
      "- experienceBullets: bullet points from jobs and work experience only.",
      "- projectBullets: bullet points from projects, side projects, open source.",
      "- summary: 1–3 sentence professional summary if present, else empty string.",
      "- All strings plain text; no markdown, no bullet symbols in the strings.",
      "- Do not add any extra top-level keys.",
    ].join("\n"),
    { t: asString(resumeText).slice(0, 12000) }
  );
  return callGeminiWithSchema(apiKey, prompt, mapResumeStructuredOut, {
    maxOutputTokens: 800,
    model: "models/gemini-2.5-flash-lite",
    seedJson: true,
    validate: (v) => {
      const skills = (v.skills || []).length;
      const exp = (v.experienceBullets || []).length;
      const proj = (v.projectBullets || []).length;
      if (skills + exp + proj === 0) return "AI returned no skills or bullets.";
      return null;
    },
  });
}

/** API key must be passed from client (stored locally only). No server env. */
export function getGeminiApiKey(bodyKey?: unknown): string {
  return asString(bodyKey).trim();
}

export type JobFitScoreData = {
  score: number;
  confidence: "low" | "medium" | "high";
  explanation: string;
  strong: string[];
  partial: string[];
  missing: string[];
  suggestions: string[];
};

function mapJobFitOut(obj: any): JobFitScoreData {
  const num = (v: any, def: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };
  const arr = (v: any) => (Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : []);
  const rawConf = String(obj?.confidence ?? obj?.c ?? "").toLowerCase();
  const confidence = rawConf === "high" || rawConf === "low" || rawConf === "medium" ? rawConf : "medium";
  return {
    score: num(obj?.score ?? obj?.s, 0),
    confidence: confidence as "low" | "medium" | "high",
    explanation: String(obj?.explanation ?? obj?.e ?? "").trim(),
    strong: arr(obj?.strong ?? obj?.g),
    partial: arr(obj?.partial ?? obj?.p),
    missing: arr(obj?.missing ?? obj?.m),
    suggestions: arr(obj?.suggestions ?? obj?.u),
  };
}

export async function scoreJobFit(
  apiKey: string,
  jobText: string,
  resumeText: string
): Promise<{ ok: true; data: JobFitScoreData } | { ok: false; error: string }> {
  const prompt = buildJsonOnlyPrompt(
    [
      "You are a job match scorer.",
      "Use score = 0.50*core + 0.30*responsibilities + 0.15*ecosystem + 0.05*workflow.",
      "Use strong/partial/none coverage per requirement inferred from resume bullets and skills.",
      "Give partial credit for clearly-transferable stack skills (e.g. Vuex≈Pinia, Jest≈Vitest, Laravel≈modern backend).",
      "Prefer bullets with action verbs and concrete impact over plain skill lists.",
      "Do NOT invent experience or technologies that are not in the input.",
      "Return exactly one JSON object with these top-level keys:",
      "score, confidence, explanation, strong, partial, missing, suggestions.",
      "Exact JSON shape:",
      "{",
      '  "score": number,',
      '  "confidence": "low" | "medium" | "high",',
      '  "explanation": string,',
      '  "strong": [string],',
      '  "partial": [string],',
      '  "missing": [string],',
      '  "suggestions": [string]',
      "}",
      "Short, pragmatic explanation and 3–6 suggestions.",
    ].join("\n"),
    { job: asString(jobText).slice(0, 8000), resume: asString(resumeText).slice(0, 12000) }
  );
  return callGeminiWithSchema(apiKey, prompt, mapJobFitOut, {
    maxOutputTokens: 520,
    model: "models/gemini-2.5-flash-lite",
    seedJson: true,
  });
}
