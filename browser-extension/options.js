const DEFAULT_BASE_URL = "http://localhost:3000";

const baseUrlEl = document.getElementById("baseUrl");
const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("save");
const testBtn = document.getElementById("test");

function setStatus(msg, kind = "info") {
  statusEl.textContent = msg;
  statusEl.className = `status ${kind}`;
}

function normalizeBaseUrl(s) {
  const v = (s || "").trim().replace(/\/+$/, "");
  return v || DEFAULT_BASE_URL;
}

function originPattern(baseUrl) {
  try {
    const u = new URL(baseUrl);
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

async function load() {
  const stored = await chrome.storage.sync.get(["baseUrl"]);
  baseUrlEl.value = stored.baseUrl || DEFAULT_BASE_URL;
}

async function save() {
  const baseUrl = normalizeBaseUrl(baseUrlEl.value);
  const pattern = originPattern(baseUrl);
  if (!pattern) {
    setStatus("Invalid URL. Example: http://localhost:3000", "err");
    return;
  }

  await chrome.storage.sync.set({ baseUrl });
  // Request origin permission so fetch works from the service worker.
  const granted = await chrome.permissions.request({ origins: [pattern] });
  setStatus(granted ? "Saved (permission granted)." : "Saved (permission not granted).", granted ? "ok" : "info");
}

async function test() {
  const baseUrl = normalizeBaseUrl(baseUrlEl.value);
  const pattern = originPattern(baseUrl);
  if (!pattern) {
    setStatus("Invalid URL.", "err");
    return;
  }

  const has = await chrome.permissions.contains({ origins: [pattern] });
  if (!has) {
    const granted = await chrome.permissions.request({ origins: [pattern] });
    if (!granted) {
      setStatus("Permission denied for this server origin.", "err");
      return;
    }
  }

  try {
    const res = await fetch(`${baseUrl}/api/jobs`, { method: "GET" });
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    setStatus("Connection OK.", "ok");
  } catch (e) {
    setStatus(`Connection failed: ${e?.message || "error"}`, "err");
  }
}

saveBtn.addEventListener("click", save);
testBtn.addEventListener("click", test);
load().catch(() => {});

