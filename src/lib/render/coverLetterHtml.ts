function esc(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderCoverLetterHtml(
  input: {
    subject?: string;
    body: string;
  },
  opts?: {
    theme?: { primaryColor: string; accentColor: string; backgroundColor: string };
    fontFamily?: string;
    fontSize?: number;
  }
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
      --canvas:#eef2f7;
    }
    html,body{ margin:0; padding:0; background:var(--bg); color:var(--primary); }
    body{ font-family:${esc(fontFamily)}, Helvetica, Arial, sans-serif; font-size:${fontSize}px; line-height:1.35; }
    .page{
      width: 100%;
      max-width: 8.5in;
      min-height: 11in;
      margin: 0 auto;
      padding: 0.85in;
      box-sizing: border-box;
      background: var(--bg);
    }
    .subject{
      font-weight: 800;
      font-size:${fontSize + 1}px;
      margin: 0 0 10px 0;
    }
    .para{ margin: 0 0 10px 0; }
    .sig{ margin-top: 14px; }
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
      .page{ max-width:none; width: 8.5in; margin:0; border-radius: 0; box-shadow:none; }
    }
  `;

  const paras = String(input.body || "")
    .replaceAll("\r\n", "\n")
    .split("\n\n")
    .map((p) => p.trim())
    .filter(Boolean);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(input.subject || "Cover letter")}</title>
    <style>${css}</style>
  </head>
  <body>
    <div class="page">
      ${input.subject ? `<div class="subject">${esc(input.subject)}</div>` : ""}
      ${paras.map((p) => `<p class="para">${esc(p)}</p>`).join("")}
    </div>
  </body>
</html>`;
}

