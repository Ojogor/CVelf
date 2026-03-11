/**
 * Robust Gemini client: schema-validated JSON with retry, plain-text support.
 * Never returns "success" with empty/invalid data; returns { ok: false, error } or throws.
 */

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type GeminiModel = {
  name?: string;
  supportedGenerationMethods?: string[];
};

let geminiModelCache: { modelName: string; cachedAt: number } | null = null;

const PREFERRED_GEMINI_MODELS = [
  "models/gemini-2.5-flash-lite",
  "models/gemini-2.5-flash",
  "models/gemini-2.0-flash-lite",
  "models/gemini-2.0-flash",
  "models/gemini-1.5-flash",
];

export async function pickGeminiModel(apiKey: string): Promise<string> {
  const now = Date.now();
  if (geminiModelCache && now - geminiModelCache.cachedAt < 1000 * 60 * 15)
    return geminiModelCache.modelName;

  const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(listUrl, { headers: { Accept: "application/json" } });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data && (data.error?.message || data.message)) ||
      `Gemini ListModels error (${res.status})`;
    throw new Error(msg);
  }

  const models: GeminiModel[] = Array.isArray(data?.models) ? data.models : [];
  const canGenerate = models.filter((m) => {
    const name = m?.name || "";
    const methods = m?.supportedGenerationMethods || [];
    return (
      typeof name === "string" &&
      name.startsWith("models/") &&
      Array.isArray(methods) &&
      methods.includes("generateContent")
    );
  });
  if (!canGenerate.length) {
    throw new Error(
      "No Gemini models available for generateContent. (ListModels returned none.)"
    );
  }

  const canSet = new Set(canGenerate.map((m) => String(m.name || "")));
  const chosen =
    PREFERRED_GEMINI_MODELS.find((m) => canSet.has(m)) ||
    canGenerate.find((m) => /flash/i.test(String(m.name || "")))?.name ||
    canGenerate.find((m) => /lite/i.test(String(m.name || "")))?.name ||
    canGenerate.find((m) => /gemini/i.test(String(m.name || "")))?.name ||
    String(canGenerate[0].name);

  geminiModelCache = { modelName: chosen, cachedAt: now };
  return chosen;
}

export type GeminiCallOptions = {
  maxOutputTokens?: number;
  model?: string;
  seedJson?: boolean;
};

/**
 * Raw call to Gemini. Throws on HTTP or API error.
 */
export async function callGemini(
  apiKey: string,
  prompt: string,
  opts?: GeminiCallOptions
): Promise<string> {
  const maxOutputTokens = clamp(opts?.maxOutputTokens ?? 420, 64, 1200);
  const requested = (opts?.model || "").trim();
  const modelName = requested || (await pickGeminiModel(apiKey));
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const contents: { role: string; parts: { text: string }[] }[] = [
    { role: "user", parts: [{ text: prompt }] },
  ];
  if (opts?.seedJson) {
    contents.push({ role: "model", parts: [{ text: "{" }] });
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens,
        // For JSON-mode calls, avoid stopping on ``` which can truncate fenced JSON.
        stopSequences: opts?.seedJson ? undefined : ["```", "\n\n---", "\n\n###"],
        responseMimeType: opts?.seedJson ? "application/json" : undefined,
      },
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data && (data.error?.message || data.message)) ||
      `Gemini error (${res.status})`;
    throw new Error(msg);
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p?.text).filter(Boolean).join("") || "";
  return text.trim();
}

/**
 * Parse JSON from model output with repair for common issues.
 */
export function safeParseJson(text: string): unknown {
  const t = (text || "").trim();
  const cleaned = t
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  const start =
    firstBrace === -1
      ? firstBracket
      : firstBracket === -1
        ? firstBrace
        : Math.min(firstBrace, firstBracket);
  if (start === -1) {
    throw new Error("AI returned no JSON.");
  }

  const slice = cleaned.slice(start);
  const lastObj = slice.lastIndexOf("}");
  const lastArr = slice.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);
  if (end <= 0) {
    throw new Error("AI returned incomplete JSON.");
  }

  let candidate = slice.slice(0, end + 1).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    // Repair common Gemini output issues: trailing commas, smart quotes, missing commas between properties
    let repaired = candidate
      .replace(/\u201c|\u201d/g, '"')
      // Trailing commas before } or ]
      .replace(/,\s*([}\]])/g, "$1")
      // Missing comma between properties: "value"\n"nextKey" or ]\n"key" or }\n"key"
      .replace(/"\s*\n+\s*"/g, '", "')
      .replace(/([}\]"])\s*\n+\s*"/g, '$1, "')
      // Missing comma after number, true, false, null before next key (e.g. 0.68\n"confidence")
      .replace(/(true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*\n+\s*"/g, '$1, "');
    // Remove trailing commas in nested structures (repeat until no change)
    for (let i = 0; i < 5; i++) {
      const next = repaired.replace(/,\s*([}\]])/g, "$1");
      if (next === repaired) break;
      repaired = next;
    }
    try {
      return JSON.parse(repaired);
    } catch (e2) {
      // Last resort: escape unescaped newlines inside double-quoted strings (e.g. "line1\nline2" that became "line1 [actual newline] line2")
      const withEscapedNewlines = repaired.replace(
        /"([^"\\]*(?:\\.[^"\\]*)*)"/g,
        (_, inner) => `"${inner.replace(/\r?\n/g, "\\n").replace(/\r/g, "\\r")}"`
      );
      try {
        return JSON.parse(withEscapedNewlines);
      } catch {
        throw e2;
      }
    }
  }
}

export type GeminiJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Call Gemini with JSON prompt, parse, map, and optionally validate.
 * Retries once on parse/map/validate failure. Returns error instead of empty data.
 */
export async function callGeminiWithSchema<T>(
  apiKey: string,
  prompt: string,
  map: (obj: unknown) => T,
  opts: GeminiCallOptions & {
    validate?: (mapped: T) => string | null;
  }
): Promise<GeminiJsonResult<T>> {
  const { validate, ...callOpts } = opts;
  let lastError = "Unknown error";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await callGemini(apiKey, prompt, {
        ...callOpts,
        seedJson: callOpts.seedJson ?? true,
      });
      const obj = safeParseJson(text);
      const mapped = map(obj);
      const validationError = validate ? validate(mapped) : null;
      if (validationError) {
        lastError = validationError;
        continue;
      }
      return { ok: true, data: mapped };
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Invalid JSON from AI";
    }
  }
  return { ok: false, error: lastError };
}

/**
 * Plain-text call (e.g. cover letter). Returns error if response is empty.
 */
export async function callGeminiText(
  apiKey: string,
  prompt: string,
  opts?: GeminiCallOptions
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const text = await callGemini(apiKey, prompt, opts);
    const trimmed = text.trim();
    if (!trimmed) {
      return { ok: false, error: "AI did not return any text." };
    }
    return { ok: true, text: trimmed };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "AI call failed",
    };
  }
}

export function buildJsonOnlyPrompt(instructions: string, payload: unknown): string {
  const json = JSON.stringify(payload ?? {});
  return [
    instructions.trim(),
    "",
    "You MUST return a single valid JSON object or array.",
    "No markdown, no code fences, no commentary, no extra text before or after the JSON.",
    "",
    "IN:",
    json,
  ].join("\n");
}
