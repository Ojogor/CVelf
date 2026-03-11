import { chromium } from "playwright";

export async function htmlToPdfBuffer(
  html: string,
  opts?: {
    format?: "Letter" | "A4";
    margin?: { top?: string; bottom?: string; left?: string; right?: string };
  }
): Promise<Uint8Array> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: opts?.format || "Letter",
      printBackground: true,
      margin: opts?.margin || { top: "0.75in", bottom: "0.75in", left: "0.75in", right: "0.75in" },
    });
    return new Uint8Array(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}

