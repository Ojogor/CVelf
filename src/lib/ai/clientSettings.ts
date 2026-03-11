"use client";

export type Provider = "local" | "claude" | "gpt" | "gemini";

const STORAGE_KEYS = {
  provider: "jtp_ai_provider",
  claude: "jtp_api_key_claude",
  gpt: "jtp_api_key_gpt",
  gemini: "jtp_api_key_gemini",
  auto: "jtp_ai_auto",
} as const;

export function getAiSettings() {
  try {
    const raw = (localStorage.getItem(STORAGE_KEYS.provider) as Provider | null) || "local";
    const provider = raw === "gemini" || raw === "local" ? raw : "local";
    const auto = (localStorage.getItem(STORAGE_KEYS.auto) || "0") === "1";
    const apiKey =
      provider === "gemini" ? localStorage.getItem(STORAGE_KEYS.gemini) || "" : "";
    return { provider, apiKey, auto };
  } catch {
    return { provider: "local" as Provider, apiKey: "", auto: false };
  }
}

