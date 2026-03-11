import { beforeEach, describe, expect, it, vi } from "vitest";
import { callGeminiWithSchema, safeParseJson } from "./gemini";

function mockJsonResponse(data: any, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: async () => data,
  } as any;
}

describe("safeParseJson", () => {
  it("parses JSON even when wrapped in code fences", () => {
    const obj = safeParseJson("```json\n{ \"a\": 1 }\n```");
    expect(obj).toEqual({ a: 1 });
  });

  it("throws on incomplete JSON", () => {
    expect(() => safeParseJson("{")).toThrow(/incomplete json/i);
  });

  it("repairs missing comma between properties (newline instead of comma)", () => {
    const broken = '{"required":["React","TypeScript"]\n"preferred":["Vitest"]}';
    const obj = safeParseJson(broken) as { required: string[]; preferred: string[] };
    expect(obj.required).toEqual(["React", "TypeScript"]);
    expect(obj.preferred).toEqual(["Vitest"]);
  });

  it("repairs missing comma after number before next key (e.g. 0.68\\n\"confidence\")", () => {
    const broken = '{"score":0.68\n"confidence":"high"}';
    const obj = safeParseJson(broken) as { score: number; confidence: string };
    expect(obj.score).toBe(0.68);
    expect(obj.confidence).toBe("high");
  });
});

describe("callGeminiWithSchema", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok:false when validate fails twice", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/models?key=")) {
        return mockJsonResponse({
          models: [{ name: "models/gemini-2.5-flash-lite", supportedGenerationMethods: ["generateContent"] }],
        });
      }
      // generateContent
      return mockJsonResponse({
        candidates: [{ content: { parts: [{ text: "{ \"x\": 1 }" }] } }],
      });
    });
    (globalThis as any).fetch = fetchMock;

    const r = await callGeminiWithSchema(
      "k",
      "p",
      (o: any) => ({ x: Number(o?.x ?? 0) }),
      { validate: () => "nope", seedJson: true }
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("nope");
  });

  it("retries when first response is non-JSON and succeeds on second", async () => {
    let genCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/models?key=")) {
        return mockJsonResponse({
          models: [{ name: "models/gemini-2.5-flash-lite", supportedGenerationMethods: ["generateContent"] }],
        });
      }
      genCalls += 1;
      const text = genCalls === 1 ? "not json at all" : "{ \"r\": [\"React\"], \"p\": [], \"d\": [], \"k\": [], \"n\": [] }";
      return mockJsonResponse({
        candidates: [{ content: { parts: [{ text }] } }],
      });
    });
    (globalThis as any).fetch = fetchMock;

    const r = await callGeminiWithSchema(
      "k",
      "p",
      (o: any) => ({ required: o.r as string[] }),
      { seedJson: true }
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.required).toEqual(["React"]);
    expect(genCalls).toBe(2);
  });
});

