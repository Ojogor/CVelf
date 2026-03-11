function pickMeta(name) {
  const el =
    document.querySelector(`meta[property="${name}"]`) ||
    document.querySelector(`meta[name="${name}"]`);
  return el?.getAttribute("content")?.trim() || "";
}

function extractCompanyGuess() {
  return (
    pickMeta("og:site_name") ||
    pickMeta("application-name") ||
    pickMeta("twitter:site") ||
    ""
  )
    .replace(/^@/, "")
    .trim();
}

function extractVisibleText(maxChars = 25000) {
  const text = (document.body?.innerText || "").replace(/\s+\n/g, "\n").trim();
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function getSelectionText(maxChars = 15000) {
  const sel = window.getSelection?.();
  const text = (sel && sel.toString()) ? sel.toString().trim() : "";
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function detectPlatform(url) {
  const u = (url || "").toLowerCase();
  if (u.includes("linkedin.com")) return "LinkedIn";
  if (u.includes("indeed.")) return "Indeed";
  if (u.includes("greenhouse.io")) return "Greenhouse";
  if (u.includes("lever.co")) return "Lever";
  return "Other";
}

function normalizeText(s) {
  return (s || "").replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

function closestText(el, maxChars = 12000) {
  if (!el) return "";
  const t = normalizeText(el.innerText || "");
  if (!t) return "";
  return t.length > maxChars ? t.slice(0, maxChars) : t;
}

function textFromSel(selectors, maxChars = 25000) {
  for (const s of selectors) {
    const el = document.querySelector(s);
    if (!el) continue;
    const t = normalizeText(el.innerText || "");
    if (t && t.length >= 120) return t.length > maxChars ? t.slice(0, maxChars) : t;
  }
  return "";
}

function inferCompanyFromBlock(text) {
  const lines = (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) return lines[1].slice(0, 80);
  return "";
}

function cleanJobTitleText(raw) {
  let t = (raw || "").trim();
  if (!t) return "";
  const suffixes = [
    /\s*[-–—]\s*job\s*post(ing)?$/i,
    /\s*[-–—]\s*job\s*description$/i,
    /\s*[-–—]\s*careers?\b.*$/i,
  ];
  for (const rx of suffixes) t = t.replace(rx, "").trim();
  return t;
}

function extractThisJob(includeText = true) {
  const url = location.href;
  const platform = detectPlatform(url);

  const isIndeedListing = platform === "Indeed" && !/\/viewjob\b|indeed\.com\/rc\/clk/.test(url);
  if (isIndeedListing) {
    // On Indeed listing/search pages, the real job details often render in a right-side panel.
    const panelTitle =
      normalizeText(
        document.querySelector("[data-testid='jobsearch-JobInfoHeader-title']")?.innerText ||
          document.querySelector("[data-testid='jobDetailTitle']")?.innerText ||
          document.querySelector("h1")?.innerText ||
          ""
      ) || "";
    const panelCompany = normalizeText(
      document.querySelector("[data-testid='inlineHeader-companyName']")?.innerText ||
        document.querySelector("[data-testid='companyName']")?.innerText ||
        ""
    );
    const panelDesc = textFromSel(
      [
        "#jobDescriptionText",
        "[data-testid='jobDescriptionText']",
        "div#jobDescriptionText",
        "[data-testid='jobsearch-JobComponent-description']",
      ],
      25000
    );

    const activeCard =
      document.querySelector("[data-jk][aria-current='true']")?.closest("li") ||
      document.querySelector("[data-testid='jobsearch-ResultsList'] [aria-current='true']")?.closest("li") ||
      document.querySelector("[data-testid^='jobCard']") ||
      document.querySelector("li[data-jk]") ||
      null;

    const cardText = closestText(activeCard, 12000);
    const lines = cardText.split("\n").map((l) => l.trim()).filter(Boolean);
    const titleFromCard = lines[0] || "";
    const companyFromCard = lines[1] || "";

    return {
      title: (panelTitle || titleFromCard || "Indeed job").slice(0, 140),
      company: (panelCompany || companyFromCard || "Unknown").slice(0, 80),
      url,
      platform,
      description: includeText ? (panelDesc || cardText || extractVisibleText(25000)) : null,
      status: "interested",
      captureMethod: "extension_this",
      capturedAt: new Date().toISOString(),
    };
  }

  const linkedInDesc = textFromSel(
    [
      "div.jobs-description__content",
      "div.jobs-description-content__text",
      "div.jobs-search__job-details--container",
      "section.jobs-description",
    ],
    25000
  );

  const indeedDesc = textFromSel(
    [
      "#jobDescriptionText",
      "[data-testid='jobDescriptionText']",
      "div#jobDescriptionText",
    ],
    25000
  );

  const genericDesc = textFromSel(
    [
      "main article",
      "article",
      "main",
      "[role='main']",
    ],
    25000
  );

  const description =
    platform === "LinkedIn"
      ? linkedInDesc || genericDesc
      : platform === "Indeed"
        ? indeedDesc || genericDesc
        : genericDesc;

  const rawTitle =
    pickMeta("og:title") ||
    pickMeta("twitter:title") ||
    (document.querySelector("h1")?.innerText || "").trim() ||
    (document.title || "Job posting").trim();
  const title = cleanJobTitleText(rawTitle) || "Job posting";

  const company =
    (platform === "Indeed" ? (document.querySelector("[data-testid='inlineHeader-companyName']")?.innerText || "").trim() : "") ||
    extractCompanyGuess() ||
    inferCompanyFromBlock(description) ||
    "Unknown";

  return {
    title: title.slice(0, 140) || "Job posting",
    company: company.slice(0, 80) || "Unknown",
    url,
    platform,
    description: includeText ? (description || extractVisibleText(25000)) : null,
    status: "interested",
    captureMethod: "extension_this",
    capturedAt: new Date().toISOString(),
  };
}

function extractJobsFromPage(limit = 20) {
  const url = location.href;
  const platform = detectPlatform(url);

  const anchors = Array.from(document.querySelectorAll("a[href]"));
  const jobAnchors = anchors.filter((a) => {
    const href = (a.getAttribute("href") || "").toLowerCase();
    if (!href) return false;
    if (href.includes("linkedin.com/jobs/view")) return true;
    if (href.includes("/jobs/view/")) return true;
    if (href.includes("indeed.com/viewjob") || href.includes("indeed.com/rc/clk")) return true;
    if (href.includes("greenhouse.io/") && href.includes("jobs")) return true;
    if (href.includes("lever.co/")) return true;
    return false;
  });

  const items = [];
  const seen = new Set();

  for (const a of jobAnchors) {
    if (items.length >= limit) break;
    const href = a.href || "";
    if (!href) continue;
    const key = href.replace(/[#?].*$/, "");
    if (seen.has(key)) continue;

    const card =
      a.closest("li") ||
      a.closest("[role='listitem']") ||
      a.closest("article") ||
      a.closest("div");

    const title = cleanJobTitleText(
      normalizeText(a.innerText || a.getAttribute("aria-label") || document.title || ""),
    ).slice(0, 140) || "Job posting";
    const cardText = closestText(card, 12000);

    let company = "Unknown";
    if (cardText) {
      const lines = cardText.split("\n").map((l) => l.trim()).filter(Boolean);
      company = lines[1]?.slice(0, 80) || company;
    }

    items.push({
      title,
      company,
      url: key,
      platform,
      description: cardText || null,
      status: "interested",
      captureMethod: "extension_all",
      capturedAt: new Date().toISOString(),
    });
    seen.add(key);
  }

  return items;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "CAPTURE_PAGE") {
      const url = location.href;
      const title = document.title || "";
      const companyGuess = extractCompanyGuess();
      const descriptionText = extractVisibleText(msg?.maxChars || 25000);
      sendResponse({ ok: true, capture: { url, title, companyGuess, descriptionText } });
      return;
    }

    if (msg?.type === "CAPTURE_THIS_JOB") {
      try {
        sendResponse({ ok: true, job: extractThisJob(!!msg?.includeText) });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || "Could not extract job." });
      }
      return;
    }

    if (msg?.type === "CAPTURE_JOBS") {
      sendResponse({ ok: true, jobs: extractJobsFromPage(msg?.limit || 25) });
      return;
    }

    if (msg?.type === "CAPTURE_THIS_JOB") {
      try {
        const job = extractThisJob(!!msg?.includeText);
        sendResponse({ ok: true, job });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || "Could not extract job." });
      }
      return;
    }

    if (msg?.type === "FLOAT_SAVE_ALL") {
      const jobs = extractJobsFromPage(25);
      if (!jobs.length) {
        sendResponse({ ok: false, error: "No job listings detected on this page." });
        return;
      }
      sendResponse(await chrome.runtime.sendMessage({ type: "SAVE_JOB", payload: jobs }));
      return;
    }

    if (msg?.type === "FLOAT_SAVE_THIS") {
      const payload = extractThisJob(true);
      sendResponse(await chrome.runtime.sendMessage({ type: "SAVE_JOB", payload }));
      return;
    }
  })();
  return true;
});

// Floating button UI
(() => {
  const ID = "jtp-floating-save";
  if (document.getElementById(ID)) return;

  const root = document.createElement("div");
  root.id = ID;
  root.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:2147483647",
    "font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif",
  ].join(";");

  root.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:8px; align-items:flex-end;">
      <div id="jtp-menu" style="display:none; width:220px; padding:10px; border-radius:12px; border:1px solid rgba(148,163,184,.35); background:rgba(15,23,42,.92); color:#e5e7eb; box-shadow:0 10px 30px rgba(0,0,0,.35);">
        <div style="font-weight:700; font-size:12px; margin-bottom:8px;">cvElf</div>
        <button id="jtp-save-this" style="width:100%; padding:8px 10px; border-radius:10px; border:1px solid rgba(59,130,246,.55); background:rgba(37,99,235,.9); color:white; font-weight:700; cursor:pointer;">Save this job</button>
        <div style="height:8px;"></div>
        <button id="jtp-save-all" style="width:100%; padding:8px 10px; border-radius:10px; border:1px solid rgba(148,163,184,.35); background:rgba(15,23,42,.6); color:#e5e7eb; font-weight:700; cursor:pointer;">Save all jobs on this page</button>
        <div id="jtp-msg" style="margin-top:8px; font-size:11px; color:#94a3b8; min-height:14px;"></div>
      </div>
      <button id="jtp-fab" title="Save job" style="width:46px; height:46px; border-radius:999px; border:1px solid rgba(59,130,246,.55); background:rgba(37,99,235,.95); color:white; font-weight:900; cursor:pointer; box-shadow:0 10px 30px rgba(0,0,0,.35);">+</button>
    </div>
  `;

  document.documentElement.appendChild(root);

  const fab = root.querySelector("#jtp-fab");
  const menu = root.querySelector("#jtp-menu");
  const msg = root.querySelector("#jtp-msg");
  const btnThis = root.querySelector("#jtp-save-this");
  const btnAll = root.querySelector("#jtp-save-all");

  function setMsg(text, ok) {
    msg.textContent = text || "";
    msg.style.color = ok === true ? "#86efac" : ok === false ? "#fca5a5" : "#94a3b8";
  }

  function toggleMenu() {
    const open = menu.style.display !== "none";
    menu.style.display = open ? "none" : "block";
    fab.textContent = open ? "+" : "×";
  }

  fab.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMenu();
  });

  document.addEventListener("click", (e) => {
    if (!root.contains(e.target) && menu.style.display !== "none") {
      menu.style.display = "none";
      fab.textContent = "+";
    }
  });

  async function run(actionType) {
    setMsg("Saving…");
    btnThis.disabled = true;
    btnAll.disabled = true;
    try {
      const resp =
        actionType === "FLOAT_SAVE_THIS"
          ? await chrome.runtime.sendMessage({ type: "SAVE_JOB", payload: extractThisJob(true) })
          : await chrome.runtime.sendMessage({
              type: "SAVE_JOB",
              payload: (() => {
                const jobs = extractJobsFromPage(25);
                if (!jobs.length) throw new Error("No job listings detected on this page.");
                return jobs;
              })(),
            });
      if (!resp?.ok) throw new Error(resp?.error || "Save failed.");
      setMsg("Saved.", true);
    } catch (e) {
      setMsg(e?.message || "Save failed.", false);
    } finally {
      btnThis.disabled = false;
      btnAll.disabled = false;
    }
  }

  btnThis.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    run("FLOAT_SAVE_THIS");
  });
  btnAll.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    run("FLOAT_SAVE_ALL");
  });
})();

