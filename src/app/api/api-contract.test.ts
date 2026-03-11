import { describe, expect, it } from "vitest";

import { POST as aiPost } from "./ai/route";
import { POST as scorePost } from "./score/route";
import { POST as tailorPost } from "./tailor/route";

function makeReq(body: any) {
  return {
    json: async () => body,
  } as any;
}

describe("API contract: /api/ai", () => {
  it("returns 400 when provider is local", async () => {
    const res = await aiPost(makeReq({ provider: "local", task: "x" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
  });

  it("returns 400 when gemini apiKey missing", async () => {
    const res = await aiPost(makeReq({ provider: "gemini", task: "job_extract_requirements", input: { jobText: "x" } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing api key/i);
  });

  it("returns 400 when provider is not Gemini", async () => {
    const res = await aiPost(makeReq({ provider: "gpt", apiKey: "k", task: "x" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/only gemini/i);
  });
});

describe("API contract: /api/score", () => {
  it("returns {analysis,result} for jobText/resumeText without DB", async () => {
    const res = await scorePost(makeReq({ jobText: "Requirements:\n- React\n- TypeScript", resumeText: "- Built React app with TypeScript" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("analysis");
    expect(body).toHaveProperty("result");
    expect(typeof body.result.overallScore).toBe("number");
    expect(String(body.analysis?.note || "")).toMatch(/gemini api key/i);
  });
});

describe("API contract: /api/tailor", () => {
  it("returns TailorResult for jobText/resumeText without DB", async () => {
    const res = await tailorPost(makeReq({ jobText: "Requirements:\n- React\n- TypeScript", resumeText: "- Built React app with TypeScript" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.fastWins)).toBe(true);
    expect(Array.isArray(body.bulletSuggestions)).toBe(true);
    expect(body).toHaveProperty("extracted");
  });
});

