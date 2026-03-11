"use client";

import { useEffect, useState } from "react";

type Provider = "local" | "claude" | "gpt" | "gemini";

const PROVIDER_LABELS: Record<Provider, string> = {
  local: "Local (no external API)",
  claude: "Anthropic Claude (coming soon)",
  gpt: "OpenAI / GPT (coming soon)",
  gemini: "Google Gemini",
};

const STORAGE_KEYS = {
  provider: "jtp_ai_provider",
  claude: "jtp_api_key_claude",
  gpt: "jtp_api_key_gpt",
  gemini: "jtp_api_key_gemini",
  auto: "jtp_ai_auto",
};

export default function SettingsPage() {
  const [provider, setProvider] = useState<Provider>("local");
  const [claudeKey, setClaudeKey] = useState("");
  const [gptKey, setGptKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [autoAi, setAutoAi] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const p = (localStorage.getItem(STORAGE_KEYS.provider) as Provider | null) || "local";
      const supported = p === "local" || p === "gemini";
      setProvider(supported ? p : "local");
      setClaudeKey(localStorage.getItem(STORAGE_KEYS.claude) || "");
      setGptKey(localStorage.getItem(STORAGE_KEYS.gpt) || "");
      setGeminiKey(localStorage.getItem(STORAGE_KEYS.gemini) || "");
      setAutoAi((localStorage.getItem(STORAGE_KEYS.auto) || "0") === "1");
    } catch {
      // ignore
    }
  }, []);

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEYS.provider, provider);
      localStorage.setItem(STORAGE_KEYS.claude, claudeKey.trim());
      localStorage.setItem(STORAGE_KEYS.gpt, gptKey.trim());
      localStorage.setItem(STORAGE_KEYS.gemini, geminiKey.trim());
      localStorage.setItem(STORAGE_KEYS.auto, autoAi ? "1" : "0");
      setSavedMsg("Settings saved locally.");
      setTimeout(() => setSavedMsg(null), 2500);
    } catch {
      setSavedMsg("Could not save in this browser.");
      setTimeout(() => setSavedMsg(null), 3000);
    }
  }

  function clearAllKeys() {
    try {
      localStorage.removeItem(STORAGE_KEYS.claude);
      localStorage.removeItem(STORAGE_KEYS.gpt);
      localStorage.removeItem(STORAGE_KEYS.gemini);
      localStorage.removeItem(STORAGE_KEYS.auto);
    } catch {
      // ignore
    }
    setClaudeKey("");
    setGptKey("");
    setGeminiKey("");
    setAutoAi(false);
    setSavedMsg("All API keys removed from this browser.");
    setTimeout(() => setSavedMsg(null), 2500);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Settings</h1>
        <p className="text-sm text-slate-400 max-w-2xl">
          Configure how cvElf uses AI. Keys are stored only in your browser (localStorage). The default{" "}
          <span className="font-semibold text-slate-200">Local</span> mode avoids any external API calls and uses the
          built-in, token-free logic.
        </p>
      </div>

      <section className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-4">
        <div>
          <h2 className="font-semibold">AI provider</h2>
          <p className="text-xs text-slate-400 mt-1">
            This provider will be used for heavy analysis steps (when enabled in features). Local mode uses as few
            tokens as possible (none) and keeps everything on-device.
          </p>
        </div>

        <div className="space-y-2">
          {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => {
            const supported = p === "local" || p === "gemini";
            return (
              <label
                key={p}
                className={`flex items-center gap-2 text-sm ${supported ? "text-slate-200" : "text-slate-500 cursor-not-allowed"}`}
              >
                <input
                  type="radio"
                  name="provider"
                  value={p}
                  checked={provider === p}
                  onChange={() => supported && setProvider(p)}
                  disabled={!supported}
                  className="h-4 w-4"
                />
                <span>{PROVIDER_LABELS[p]}</span>
              </label>
            );
          })}
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-200 pt-2">
          <input
            type="checkbox"
            checked={autoAi}
            onChange={(e) => setAutoAi(e.target.checked)}
            className="h-4 w-4"
          />
          <span>Auto-use AI when available (still minimizes tokens)</span>
        </label>
        <p className="text-xs text-slate-500">
          When enabled, features may automatically run a small AI refinement step after the local result is generated.
        </p>
      </section>

      <section className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-4">
        <div>
          <h2 className="font-semibold">API keys</h2>
          <p className="text-xs text-slate-400 mt-1">
            Keys never leave your browser unless you explicitly trigger a feature that calls an external API. You can
            wipe them in one click.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="block text-xs text-slate-500">Claude (Anthropic)</label>
            <input
              type="password"
              value={claudeKey}
              onChange={(e) => setClaudeKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-sm text-slate-100"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-slate-500">OpenAI / GPT</label>
            <input
              type="password"
              value={gptKey}
              onChange={(e) => setGptKey(e.target.value)}
              placeholder="sk-..."
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-sm text-slate-100"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-slate-500">Google Gemini</label>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIza..."
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-sm text-slate-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={persist}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
          >
            Save settings
          </button>
          <button
            type="button"
            onClick={clearAllKeys}
            className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/40 text-sm"
          >
            Remove all API keys
          </button>
          {savedMsg && <p className="text-xs text-slate-300">{savedMsg}</p>}
        </div>
      </section>
    </div>
  );
}

