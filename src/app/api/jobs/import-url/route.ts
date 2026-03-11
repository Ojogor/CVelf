import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function isProbablyHtml(contentType: string) {
  const ct = (contentType || "").toLowerCase();
  return ct.includes("text/html") || ct.includes("application/xhtml");
}

function stripHtmlToText(html: string) {
  const raw = String(html || "");
  const noScripts = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const withNewlines = noScripts
    .replace(/<\/(p|div|br|li|h1|h2|h3|h4|h5|h6|section|article|tr)>/gi, "\n")
    .replace(/<(p|div|br|li|h1|h2|h3|h4|h5|h6|section|article|tr)\b[^>]*>/gi, "\n");

  const text = withNewlines
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  return text.trim();
}

function extractTitle(html: string) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const t = m ? m[1] : "";
  return t.replace(/\s+/g, " ").trim().slice(0, 140);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = asString(body?.url).trim();
    if (!url) {
      return NextResponse.json({ ok: false, error: "url is required", fallback: "paste" }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid URL", fallback: "paste" }, { status: 400 });
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ ok: false, error: "Only http/https URLs are supported", fallback: "paste" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
      });

      const contentType = res.headers.get("content-type") || "";
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: `Fetch failed (${res.status}). This site may block automated access.`, fallback: "paste" },
          { status: 502 }
        );
      }
      if (!isProbablyHtml(contentType)) {
        return NextResponse.json(
          { ok: false, error: `Unsupported content-type (${contentType || "unknown"}).`, fallback: "paste" },
          { status: 415 }
        );
      }

      const html = await res.text();
      const title = extractTitle(html);
      const text = stripHtmlToText(html);

      if (!text || text.length < 400) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Could not extract enough readable job text from this page. Paste the job description instead (some sites block scraping).",
            fallback: "paste",
            title: title || undefined,
          },
          { status: 502 }
        );
      }

      return NextResponse.json({ ok: true, title: title || undefined, text });
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    const msg =
      e instanceof Error && /aborted/i.test(e.message)
        ? "Timed out fetching the page. Paste the job description instead."
        : e instanceof Error
          ? e.message
          : "Import failed";
    return NextResponse.json({ ok: false, error: msg, fallback: "paste" }, { status: 500 });
  }
}

