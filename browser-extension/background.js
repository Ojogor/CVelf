const DEFAULT_BASE_URL = "http://localhost:3000";

async function getBaseUrl() {
  const stored = await chrome.storage.sync.get(["baseUrl"]);
  const baseUrl = (stored.baseUrl || DEFAULT_BASE_URL).trim();
  return baseUrl.replace(/\/+$/, "");
}

function originPatternFromBaseUrl(baseUrl) {
  try {
    const u = new URL(baseUrl);
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

async function ensureHostPermission(baseUrl) {
  const pattern = originPatternFromBaseUrl(baseUrl);
  if (!pattern) return { ok: false, error: "Invalid server URL." };

  // If already granted, no prompt.
  const has = await chrome.permissions.contains({ origins: [pattern] });
  if (has) return { ok: true };

  // Request optional host permission for non-localhost installs.
  const granted = await chrome.permissions.request({ origins: [pattern] });
  return granted ? { ok: true } : { ok: false, error: "Permission denied for server origin." };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type !== "SAVE_JOB") return;

    const baseUrl = await getBaseUrl();
    const perm = await ensureHostPermission(baseUrl);
    if (!perm.ok) {
      sendResponse({ ok: false, error: perm.error });
      return;
    }

    const endpoint = `${baseUrl}/api/jobs/quick-add`;
    const payload = msg.payload || {};

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }

      if (!res.ok) {
        sendResponse({
          ok: false,
          error: (data && data.error) || `Server error (${res.status})`,
          debug: data,
        });
        return;
      }

      sendResponse({ ok: true, data });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || "Network error" });
    }
  })();

  // Keep the message channel open for async response.
  return true;
});

