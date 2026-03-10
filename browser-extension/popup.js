const statusEl = document.getElementById("status");
const saveThisBtn = document.getElementById("saveThisBtn");
const saveAllBtn = document.getElementById("saveAllBtn");
const includeTextEl = document.getElementById("includeText");

function setStatus(msg, kind = "info") {
  statusEl.textContent = msg;
  statusEl.className = `status ${kind}`;
}

async function captureActiveTab(maxChars) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab.");

  const res = await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_PAGE", maxChars });
  if (!res?.ok) throw new Error("Capture failed.");
  return res.capture;
}

async function captureThisJob(includeText) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab.");
  const res = await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_THIS_JOB", includeText: !!includeText });
  if (!res?.ok) throw new Error(res?.error || "Could not detect a job on this page.");
  return res.job;
}

async function captureJobs(limit) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab.");
  const res = await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_JOBS", limit });
  if (!res?.ok) throw new Error("Jobs capture failed.");
  return Array.isArray(res.jobs) ? res.jobs : [];
}

function detectPlatform(url) {
  const u = (url || "").toLowerCase();
  if (u.includes("linkedin.com")) return "LinkedIn";
  if (u.includes("indeed.")) return "Indeed";
  if (u.includes("greenhouse.io")) return "Greenhouse";
  if (u.includes("lever.co")) return "Lever";
  return "Other";
}

function inferTitleCompany(capture) {
  const pageTitle = (capture.title || "").trim();
  const company = (capture.companyGuess || "").trim();
  if (pageTitle) return { title: pageTitle.slice(0, 140), company: company || "Unknown" };
  return { title: "Job posting", company: company || "Unknown" };
}

function disableAll(disabled) {
  saveThisBtn.disabled = disabled;
  saveAllBtn.disabled = disabled;
}

async function saveThisJob() {
  setStatus("");
  disableAll(true);
  saveThisBtn.textContent = "Saving…";

  try {
    const includeText = !!includeTextEl.checked;
    const payload = await captureThisJob(includeText);
    const resp = await chrome.runtime.sendMessage({ type: "SAVE_JOB", payload });
    if (!resp?.ok) throw new Error(resp?.error || "Save failed.");
    const jobId = resp?.data?.id || resp?.data?.job?.id;
    setStatus(jobId ? `Saved. Job ID: ${jobId}` : "Saved.", "ok");
  } catch (e) {
    setStatus(e?.message || "Save failed.", "err");
  } finally {
    disableAll(false);
    saveThisBtn.textContent = "Save this job";
  }
}

async function saveAllJobs() {
  setStatus("");
  disableAll(true);
  saveAllBtn.textContent = "Saving…";
  try {
    const jobs = await captureJobs(25);
    if (!jobs.length) throw new Error("No job listings detected on this page.");
    const resp = await chrome.runtime.sendMessage({ type: "SAVE_JOB", payload: jobs });
    if (!resp?.ok) throw new Error(resp?.error || "Save failed.");
    const added = resp?.data?.added;
    setStatus(added ? `Saved ${added} jobs.` : "Saved.", "ok");
  } catch (e) {
    setStatus(e?.message || "Save failed.", "err");
  } finally {
    disableAll(false);
    saveAllBtn.textContent = "Save all jobs on this page";
  }
}

saveThisBtn.addEventListener("click", saveThisJob);
saveAllBtn.addEventListener("click", saveAllJobs);

