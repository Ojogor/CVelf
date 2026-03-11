import type { ResumeBlock, ResumeDocument } from "@/lib/tailor/document";
import { documentToExportPayload } from "@/lib/tailor/document";

function esc(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeTitle(s: string) {
  return String(s || "").trim().toLowerCase();
}

function getCustomSections(doc: ResumeDocument) {
  const sections: Array<{ title: string; text?: string; bullets: string[] }> = [];
  for (const b of doc.blocks) {
    if (b.type !== "section") continue;
    const c = b.content as { title?: string; text?: string };
    const title = String(c.title || "").trim();
    const bullets = (b.children || [])
      .filter((x) => x.type === "bullet")
      .map((x) => String((x.content as any)?.text || "").trim())
      .filter(Boolean);
    sections.push({ title, text: c.text ? String(c.text) : undefined, bullets });
  }
  return sections;
}

function getBlockTitle(doc: ResumeDocument, type: "skills" | "experience" | "projects" | "education") {
  const b = doc.blocks.find((x) => x.type === type);
  const t = (b?.content as any)?.title;
  return typeof t === "string" && t.trim().length ? t.trim() : null;
}

function getHeaderContacts(doc: ResumeDocument): {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  github?: string;
  linkedin?: string;
  website?: string;
} {
  const h = doc.blocks.find((b) => b.type === "header");
  const c = (h?.content || {}) as any;
  return {
    name: typeof c.name === "string" ? c.name : undefined,
    email: typeof c.email === "string" ? c.email : undefined,
    phone: typeof c.phone === "string" ? c.phone : undefined,
    address: typeof c.address === "string" ? c.address : undefined,
    github: typeof c.github === "string" ? c.github : undefined,
    linkedin: typeof c.linkedin === "string" ? c.linkedin : undefined,
    website: typeof c.website === "string" ? c.website : undefined,
  };
}

function iconSvg(kind: "phone" | "email" | "link" | "pin" | "github" | "linkedin") {
  const common = `width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"`;
  if (kind === "phone")
    return `<svg ${common}><path d="M6.6 10.8c1.7 3.3 3.9 5.5 7.2 7.2l2.4-2.4c.3-.3.8-.4 1.2-.2 1.3.5 2.7.8 4.2.8.7 0 1.4.6 1.4 1.4V21c0 .8-.6 1.4-1.4 1.4C10.1 22.4 1.6 13.9 1.6 3.4 1.6 2.6 2.2 2 3 2h3.6C7.4 2 8 2.6 8 3.4c0 1.5.3 2.9.8 4.2.1.4 0 .9-.2 1.2l-2.4 2.0Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (kind === "email")
    return `<svg ${common}><path d="M4 6h16v12H4V6Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (kind === "pin")
    return `<svg ${common}><path d="M12 21s7-4.4 7-11a7 7 0 1 0-14 0c0 6.6 7 11 7 11Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" stroke="currentColor" stroke-width="1.7"/></svg>`;
  if (kind === "link")
    return `<svg ${common}><path d="M10 13a5 5 0 0 0 7.1 0l1.4-1.4a5 5 0 0 0-7.1-7.1L10.7 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 11a5 5 0 0 0-7.1 0L5.5 12.4a5 5 0 0 0 7.1 7.1L13.3 20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (kind === "github")
    return `<svg ${common}><path d="M9 19c-4 1.5-4-2-5-2m10 4v-3a2.6 2.6 0 0 0-.7-2c2.3-.3 4.7-1.1 4.7-5a3.9 3.9 0 0 0-1-2.7 3.6 3.6 0 0 0-.1-2.7s-.8-.3-2.8 1a9.5 9.5 0 0 0-5 0c-2-1.3-2.8-1-2.8-1a3.6 3.6 0 0 0-.1 2.7A3.9 3.9 0 0 0 6 11c0 3.9 2.4 4.7 4.7 5a2.6 2.6 0 0 0-.7 2v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `<svg ${common}><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4V14a6 6 0 0 1 6-6Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 9h4v12H2V9Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" stroke-width="1.7"/></svg>`;
}

export function renderResumeHtmlFromDocument(
  doc: ResumeDocument,
  opts?: {
    theme?: { primaryColor: string; accentColor: string; backgroundColor: string };
    fontFamily?: string;
    fontSize?: number;
    templateName?: string;
  }
): string {
  const theme = opts?.theme || { primaryColor: "#0f172a", accentColor: "#2563eb", backgroundColor: "#ffffff" };
  const fontFamily = String(opts?.fontFamily || "Helvetica");
  const fontSize = Math.max(9, Math.min(16, Number(opts?.fontSize || 11)));
  const templateName = String(opts?.templateName || "").toLowerCase();
  const templateKind: "modern" | "minimal" | "centered" =
    templateName.includes("center") ? "centered" : templateName.includes("minimal") ? "minimal" : "modern";

  const payload = documentToExportPayload(doc);
  const customSections = getCustomSections(doc).filter((s) => normalizeTitle(s.title) !== "highlights");
  const highlights = payload.highlightsBullets || [];
  const skillsTitle = getBlockTitle(doc, "skills") || "Skills";
  const experienceTitle = getBlockTitle(doc, "experience") || "Experience";
  const projectsTitle = getBlockTitle(doc, "projects") || "Projects";
  const educationTitle = getBlockTitle(doc, "education") || "Education";
  const headerContacts = getHeaderContacts(doc);

  // Collect rich-text bullets per experience/project/education to preserve inline styling.
  const richExperienceBullets: string[][] = [];
  const richProjectBullets: string[][] = [];
  const richEducationDetails: string[][] = [];

  for (const b of doc.blocks) {
    if (b.type === "experience" && b.children?.length) {
      for (const it of b.children) {
        if (it.type !== "experience_item") continue;
        const bullets: string[] = [];
        for (const c of it.children || []) {
          if (c.type !== "bullet") continue;
          const bc = c.content as BulletContent;
          bullets.push(bc.richText || esc(bc.text || ""));
        }
        richExperienceBullets.push(bullets);
      }
    } else if (b.type === "projects" && b.children?.length) {
      for (const it of b.children) {
        if (it.type !== "project_item") continue;
        const bullets: string[] = [];
        for (const c of it.children || []) {
          if (c.type !== "bullet") continue;
          const bc = c.content as BulletContent;
          bullets.push(bc.richText || esc(bc.text || ""));
        }
        richProjectBullets.push(bullets);
      }
    } else if (b.type === "education" && b.children?.length) {
      for (const it of b.children) {
        if (it.type !== "education_item") continue;
        const details: string[] = [];
        for (const c of it.children || []) {
          if (c.type !== "bullet") continue;
          const bc = c.content as BulletContent;
          details.push(bc.richText || esc(bc.text || ""));
        }
        richEducationDetails.push(details);
      }
    }
  }

  const templateCss =
    templateKind === "minimal"
      ? `
        :root{ --canvas:#ffffff; --divider: rgba(148,163,184,0.55); }
        body{ line-height: 1.3; }
        .secTitle{ letter-spacing:0.08em; }
        .secTitle:after{ border-bottom: 1px solid var(--divider); }
        @media screen{
          html,body{ background: #ffffff; }
          .page{ box-shadow:none; border: 1px solid rgba(148,163,184,0.25); }
        }
      `
      : templateKind === "centered"
        ? `
          .header{ text-align:center; }
          .name{ text-align:center; }
          .contact{ display:none; }
          .contactRow{
            margin-top: 10px;
            display:flex;
            flex-wrap:wrap;
            justify-content:center;
            gap: 10px 14px;
            color: var(--muted);
            font-size:${Math.max(9, fontSize - 1)}px;
          }
          .contactPill{
            display:inline-flex;
            align-items:center;
            gap: 6px;
            padding: 3px 8px;
            border-radius: 999px;
            border: 1px solid rgba(148,163,184,0.35);
            background: rgba(148,163,184,0.08);
          }
          .contactPill svg{ opacity: 0.9; }
        `
        : "";

  const css = `
    :root{
      --primary:${theme.primaryColor};
      --accent:${theme.accentColor};
      --bg:${theme.backgroundColor};
      --muted:#444;
      --canvas:#eef2f7;
      --divider: rgba(148,163,184,0.8);
    }
    html,body{ margin:0; padding:0; background:var(--bg); color:var(--primary); }
    body{ font-family:${esc(fontFamily)}, Helvetica, Arial, sans-serif; font-size:${fontSize}px; line-height:1.28; }
    .page{
      width: 100%;
      max-width: 8.5in;
      min-height: 11in;
      margin: 0 auto;
      padding: 0.75in;
      box-sizing: border-box;
      background: var(--bg);
    }
    .name{ font-size:${fontSize + 7}px; font-weight:800; letter-spacing:0.1px; }
    .contact{ margin-top:6px; font-size:${Math.max(9, fontSize - 1)}px; color:var(--muted); }
    .spacer{ height:10px; }
    .sec{ margin-top: 14px; }
    .secTitle{
      font-size:${Math.max(9, fontSize - 1)}px;
      font-weight:800;
      letter-spacing:0.12em;
      text-transform:uppercase;
      margin: 0 0 8px 0;
      display:flex;
      align-items:center;
      gap: 10px;
    }
    .secTitle:after{
      content:"";
      flex:1;
      border-bottom: 1px solid var(--divider);
      transform: translateY(1px);
    }
    .p{ margin: 0 0 6px 0; }
    .bullets{ margin: 6px 0 0 0; padding-left: 18px; list-style-position: outside; }
    .bullets li{ margin: 0 0 4px 0; }
    .twocol{
      display:flex;
      justify-content:space-between;
      align-items:baseline;
      gap: 12px;
      margin-top: 8px;
    }
    .twocol .left{ font-weight:700; }
    .twocol .right{ color:var(--muted); font-size:${Math.max(9, fontSize - 2)}px; white-space:nowrap; }
    .itemBullets{ margin: 4px 0 0 0; padding-left: 18px; list-style-position: outside; }
    .itemBullets li{ margin: 0 0 4px 0; }
    a{ color:var(--accent); text-decoration:none; }
    a:hover{ text-decoration: underline; }
    @media screen{
      html,body{ background: var(--canvas); }
      .page{
        margin: 28px auto;
        border-radius: 14px;
        box-shadow: 0 18px 50px rgba(2,6,23,0.18);
      }
    }
    @media print{
      body{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      html,body{ background: #fff; }
      .page{ max-width:none; width: 8.5in; box-shadow:none; margin:0; border-radius: 0; }
    }
    ${templateCss}
  `;

  const pills =
    templateKind === "centered"
      ? [
          headerContacts.phone ? `<span class="contactPill">${iconSvg("phone")}<span>${esc(headerContacts.phone)}</span></span>` : "",
          headerContacts.email ? `<span class="contactPill">${iconSvg("email")}<span>${esc(headerContacts.email)}</span></span>` : "",
          headerContacts.github ? `<span class="contactPill">${iconSvg("github")}<span>${esc(headerContacts.github)}</span></span>` : "",
          headerContacts.linkedin ? `<span class="contactPill">${iconSvg("linkedin")}<span>${esc(headerContacts.linkedin)}</span></span>` : "",
          headerContacts.website ? `<span class="contactPill">${iconSvg("link")}<span>${esc(headerContacts.website)}</span></span>` : "",
          headerContacts.address ? `<span class="contactPill">${iconSvg("pin")}<span>${esc(headerContacts.address)}</span></span>` : "",
        ]
          .filter(Boolean)
          .join("")
      : "";

  const headerHtml = `
    <header class="header">
      <div class="name">${esc(payload.name || "Resume")}</div>
      ${payload.contactLine ? `<div class="contact">${esc(payload.contactLine)}</div>` : ""}
      ${pills ? `<div class="contactRow">${pills}</div>` : ""}
      <div class="spacer"></div>
    </header>
  `;

  // Prefer rich-text summary from the document so inline formatting (bold/italic/size)
  // is preserved in preview and PDF. Fall back to plain summaryLines from the payload.
  let summaryHtml = "";
  const summaryBlock = doc.blocks.find((b) => b.type === "summary");
  const summaryContent = summaryBlock?.content as any;
  const summaryRich = typeof summaryContent?.richText === "string" ? summaryContent.richText.trim() : "";
  const summaryText = typeof summaryContent?.text === "string" ? summaryContent.text.trim() : "";
  if (summaryRich) {
    summaryHtml = `
    <section class="sec">
      <div class="secTitle">Summary</div>
      <p class="p">${summaryRich}</p>
    </section>`;
  } else if (summaryText) {
    summaryHtml = `
    <section class="sec">
      <div class="secTitle">Summary</div>
      <p class="p">${esc(summaryText)}</p>
    </section>`;
  } else if (payload.summaryLines?.length) {
    summaryHtml = `
    <section class="sec">
      <div class="secTitle">Summary</div>
      ${payload.summaryLines.map((l) => `<p class="p">${esc(l)}</p>`).join("")}
    </section>`;
  }

  const skillsHtml =
    payload.skills?.length
      ? `
    <section class="sec">
      <div class="secTitle">${esc(skillsTitle)}</div>
      <p class="p">${esc(payload.skills.join(" • "))}</p>
    </section>`
      : "";

  const highlightsHtml =
    highlights.length > 0
      ? `
    <section class="sec">
      <div class="secTitle">Highlights</div>
      <ul class="bullets">${highlights.slice(0, 12).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
    </section>`
      : "";

  const experienceHtml =
    payload.experiences?.length
      ? `
    <section class="sec">
      <div class="secTitle">${esc(experienceTitle)}</div>
      ${payload.experiences
        .map((e, idx) => {
          const company = e.organization || "";
          const role = e.title || "";
          const rightTop = e.dateRange || "";
          const rightBottom = e.location || "";
          const richBullets = richExperienceBullets[idx] || [];
          return `
          <div class="twocol">
            <div class="left">${esc(company)}</div>
            <div class="right">${esc(rightTop)}</div>
          </div>
          <div class="twocol">
            <div class="left" style="font-weight:600; font-style:italic;">${esc(role)}</div>
            <div class="right">${esc(rightBottom)}</div>
          </div>
          ${
            richBullets.length
              ? `<ul class="itemBullets">${richBullets.slice(0, 10).map((b) => `<li>${b}</li>`).join("")}</ul>`
              : (e.bullets || []).length
                ? `<ul class="itemBullets">${(e.bullets || []).slice(0, 10).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
              : ""
          }
        `;
        })
        .join("")}
    </section>`
      : "";

  const projectsHtml =
    payload.projects?.length
      ? `
    <section class="sec">
      <div class="secTitle">${esc(projectsTitle)}</div>
      ${payload.projects
        .map((p, idx) => {
          const right = [p.dateRange, p.link].filter(Boolean).join(" | ");
          const name = p.link ? `<a href="${esc(p.link)}">${esc(p.name)}</a>` : esc(p.name);
          const richBullets = richProjectBullets[idx] || [];
          return `
          <div class="twocol">
            <div class="left">${name}</div>
            <div class="right">${esc(right)}</div>
          </div>
          ${
            richBullets.length
              ? `<ul class="itemBullets">${richBullets.slice(0, 6).map((b) => `<li>${b}</li>`).join("")}</ul>`
              : (p.bullets || []).length
                ? `<ul class="itemBullets">${(p.bullets || []).slice(0, 6).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
              : ""
          }
        `;
        })
        .join("")}
    </section>`
      : "";

  const educationHtml =
    payload.education?.length
      ? `
    <section class="sec">
      <div class="secTitle">${esc(educationTitle)}</div>
      ${payload.education
        .map((e, idx) => {
          const left = [e.school, e.degree].filter(Boolean).join(" — ");
          const right = [e.location, e.dateRange].filter(Boolean).join(" | ");
          const richDetails = richEducationDetails[idx] || [];
          return `
          <div class="twocol">
            <div class="left">${esc(left)}</div>
            <div class="right">${esc(right)}</div>
          </div>
          ${
            richDetails.length
              ? `<ul class="itemBullets">${richDetails.slice(0, 4).map((d) => `<li>${d}</li>`).join("")}</ul>`
              : (e.details || []).length
                ? `<ul class="itemBullets">${(e.details || []).slice(0, 4).map((d) => `<li>${esc(d)}</li>`).join("")}</ul>`
              : ""
          }
        `;
        })
        .join("")}
    </section>`
      : "";

  const customHtml = customSections.length
    ? customSections
        .filter((s) => s.title.trim().length > 0)
        .map((s) => {
          const title = esc(s.title);
          const text = s.text ? `<p class="p">${esc(s.text)}</p>` : "";
          const bullets = s.bullets.length ? `<ul class="bullets">${s.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : "";
          return `
          <section class="sec">
            <div class="secTitle">${title}</div>
            ${text}
            ${bullets}
          </section>
        `;
        })
        .join("")
    : "";

  const sectionOrder: string[] = [];
  for (const b of doc.blocks) {
    if (b.type === "summary" && !sectionOrder.includes("summary")) sectionOrder.push("summary");
    else if (b.type === "skills" && !sectionOrder.includes("skills")) sectionOrder.push("skills");
    else if (b.type === "experience" && !sectionOrder.includes("experience")) sectionOrder.push("experience");
    else if (b.type === "projects" && !sectionOrder.includes("projects")) sectionOrder.push("projects");
    else if (b.type === "education" && !sectionOrder.includes("education")) sectionOrder.push("education");
  }

  const parts: string[] = [];
  for (const key of sectionOrder) {
    if (key === "summary" && summaryHtml) parts.push(summaryHtml);
    else if (key === "skills" && skillsHtml) parts.push(skillsHtml);
    else if (key === "experience" && experienceHtml) parts.push(experienceHtml);
    else if (key === "projects" && projectsHtml) parts.push(projectsHtml);
    else if (key === "education" && educationHtml) parts.push(educationHtml);
  }

  const body = `${headerHtml}${parts.join("")}${customHtml}`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(payload.name || "Resume")}</title>
    <style>${css}</style>
  </head>
  <body>
    <div class="page">${body}</div>
  </body>
</html>`;
}

export function renderResumeHtmlFromPayload(
  input: {
    name: string;
    contactLine?: string;
    summaryLines: string[];
    skills: string[];
    highlightsBullets: string[];
    experiences?: Array<{ title: string; organization: string; location?: string; dateRange: string; bullets: string[] }>;
    projects?: Array<{ name: string; dateRange?: string; link?: string; bullets: string[] }>;
    education?: Array<{ school: string; degree?: string; location?: string; dateRange?: string; details: string[] }>;
  },
  opts?: { theme?: { primaryColor: string; accentColor: string; backgroundColor: string }; fontFamily?: string; fontSize?: number }
): string {
  const theme = opts?.theme || { primaryColor: "#0f172a", accentColor: "#2563eb", backgroundColor: "#ffffff" };
  const fontFamily = String(opts?.fontFamily || "Helvetica");
  const fontSize = Math.max(9, Math.min(16, Number(opts?.fontSize || 11)));

  const css = `
    :root{
      --primary:${theme.primaryColor};
      --accent:${theme.accentColor};
      --bg:${theme.backgroundColor};
      --muted:#444;
    }
    html,body{ margin:0; padding:0; background:var(--bg); color:var(--primary); }
    body{ font-family:${esc(fontFamily)}, Helvetica, Arial, sans-serif; font-size:${fontSize}px; line-height:1.25; }
    .page{
      width: 8.5in;
      min-height: 11in;
      padding: 0.75in;
      box-sizing: border-box;
    }
    .name{ font-size:${fontSize + 7}px; font-weight:800; letter-spacing:0.2px; }
    .contact{ margin-top:6px; font-size:${Math.max(9, fontSize - 1)}px; color:var(--muted); }
    .spacer{ height:14px; }
    .sec{ margin-top: 12px; }
    .secTitle{
      font-size:${Math.max(9, fontSize - 1)}px;
      font-weight:800;
      letter-spacing:0.12em;
      text-transform:uppercase;
      margin: 0 0 6px 0;
    }
    .p{ margin: 0 0 6px 0; }
    .bullets{ margin: 6px 0 0 0; padding-left: 18px; }
    .bullets li{ margin: 0 0 3px 0; }
    .twocol{
      display:flex;
      justify-content:space-between;
      align-items:baseline;
      gap: 12px;
      margin-top: 8px;
    }
    .twocol .left{ font-weight:700; }
    .twocol .right{ color:var(--muted); font-size:${Math.max(9, fontSize - 2)}px; white-space:nowrap; }
    .itemBullets{ margin: 4px 0 0 0; padding-left: 18px; }
    .itemBullets li{ margin: 0 0 3px 0; }
    a{ color:var(--accent); text-decoration:none; }
    @media print{
      body{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page{ box-shadow:none; margin:0; }
    }
  `;

  const headerHtml = `
    <div class="name">${esc(input.name || "Resume")}</div>
    ${input.contactLine ? `<div class="contact">${esc(input.contactLine)}</div>` : ""}
    <div class="spacer"></div>
  `;

  const summaryHtml =
    input.summaryLines?.length
      ? `
    <section class="sec">
      <div class="secTitle">Summary</div>
      ${input.summaryLines.map((l) => `<p class="p">${esc(l)}</p>`).join("")}
    </section>`
      : "";

  const skillsHtml =
    input.skills?.length
      ? `
    <section class="sec">
      <div class="secTitle">Skills</div>
      <p class="p">${esc(input.skills.join(" • "))}</p>
    </section>`
      : "";

  const highlightsHtml =
    input.highlightsBullets?.length
      ? `
    <section class="sec">
      <div class="secTitle">Highlights</div>
      <ul class="bullets">${input.highlightsBullets.slice(0, 12).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
    </section>`
      : "";

  const experienceHtml =
    input.experiences?.length
      ? `
    <section class="sec">
      <div class="secTitle">Experience</div>
      ${input.experiences
        .map((e) => {
          const left = [e.title, e.organization].filter(Boolean).join(" — ");
          const right = [e.location, e.dateRange].filter(Boolean).join(" | ");
          return `
          <div class="twocol">
            <div class="left">${esc(left)}</div>
            <div class="right">${esc(right)}</div>
          </div>
          ${
            (e.bullets || []).length
              ? `<ul class="itemBullets">${(e.bullets || []).slice(0, 10).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
              : ""
          }
        `;
        })
        .join("")}
    </section>`
      : "";

  const projectsHtml =
    input.projects?.length
      ? `
    <section class="sec">
      <div class="secTitle">Projects</div>
      ${input.projects
        .map((p) => {
          const right = [p.dateRange, p.link].filter(Boolean).join(" | ");
          const name = p.link ? `<a href="${esc(p.link)}">${esc(p.name)}</a>` : esc(p.name);
          return `
          <div class="twocol">
            <div class="left">${name}</div>
            <div class="right">${esc(right)}</div>
          </div>
          ${
            (p.bullets || []).length
              ? `<ul class="itemBullets">${(p.bullets || []).slice(0, 6).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
              : ""
          }
        `;
        })
        .join("")}
    </section>`
      : "";

  const educationHtml =
    input.education?.length
      ? `
    <section class="sec">
      <div class="secTitle">Education</div>
      ${input.education
        .map((e) => {
          const left = [e.school, e.degree].filter(Boolean).join(" — ");
          const right = [e.location, e.dateRange].filter(Boolean).join(" | ");
          return `
          <div class="twocol">
            <div class="left">${esc(left)}</div>
            <div class="right">${esc(right)}</div>
          </div>
          ${
            (e.details || []).length
              ? `<ul class="itemBullets">${(e.details || []).slice(0, 4).map((d) => `<li>${esc(d)}</li>`).join("")}</ul>`
              : ""
          }
        `;
        })
        .join("")}
    </section>`
      : "";

  const body = `${headerHtml}${summaryHtml}${skillsHtml}${highlightsHtml}${experienceHtml}${projectsHtml}${educationHtml}`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(input.name || "Resume")}</title>
    <style>${css}</style>
  </head>
  <body>
    <div class="page">${body}</div>
  </body>
</html>`;
}

