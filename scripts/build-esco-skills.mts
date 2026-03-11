/**
 * One-off helper script to generate a compact ESCO skills JSON file
 * that you can plug into your local skills taxonomy.
 *
 * Usage (from project root):
 *   node ./scripts/build-esco-skills.mts
 *
 * This script:
 * - calls the ESCO web-service API /resource/skill endpoint in pages
 * - keeps only a small subset of fields (id, preferredLabel, altLabels, group)
 * - writes ./skills/esco_skills.json
 *
 * It is designed to be safe to run offline / at build time; your app
 * should NOT call ESCO on every user request.
 */

const ESCO_BASE = "https://ec.europa.eu/esco/api/resource";

/**
 * @param {string} url
 * @returns {Promise<any>}
 */
async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`ESCO request failed: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

/**
 * @param {string | undefined} skillType
 * @returns {"skill" | "knowledge" | "language" | "other"}
 */
function groupFromType(skillType) {
  if (!skillType) return "other";
  const t = skillType.toLowerCase();
  if (t.includes("knowledge")) return "knowledge";
  if (t.includes("language")) return "language";
  if (t.includes("skill")) return "skill";
  return "other";
}

/**
 * @param {string} uri
 */
function extractIdFromUri(uri) {
  // example: http://data.europa.eu/esco/skill/dc06de9f-dd3a-4f28-b58f-b01b5ae72ab8
  const parts = uri.split("/");
  return parts[parts.length - 1] || uri;
}

async function buildEscoSkills() {
  const lang = "en"; // you can change this if you want
  const pageSize = 200;

  /** @type {Array<{id:string,label:string,altLabels:string[],group:string}>} */
  const out = [];
  let url = `${ESCO_BASE}/skill?language=${encodeURIComponent(lang)}&offset=0&limit=${pageSize}`;
  let page = 0;

  // NOTE: There are ~14k skills; this loop will walk all pages.
  while (url) {
    // eslint-disable-next-line no-console
    console.log(`Fetching ESCO skills page ${page} -> ${url}`);
    const data = await fetchPage(url);
    const hits = (data && data._embedded && data._embedded.results) || [];

    for (const hit of hits) {
      const id = extractIdFromUri(hit.uri);
      const label = (hit.preferredLabel?.[lang] || "").trim();
      if (!label) continue;

      const alt = (hit.altLabels?.[lang] ?? []).map((s) => s.trim()).filter(Boolean);
      const group = groupFromType(hit.skillType);

      out.push({
        id,
        label,
        altLabels: Array.from(new Set(alt)),
        group,
      });
    }

    const nextHref = data._links && data._links.next && data._links.next.href;
    if (!nextHref) break;

    url = nextHref.startsWith("http") ? nextHref : `${ESCO_BASE}${nextHref}`;
    page += 1;
  }

  // Write to ./skills/esco_skills.json
  const fs = await import("node:fs/promises");
  const path = new URL("../skills/esco_skills.json", import.meta.url);

  await fs.writeFile(path, JSON.stringify(out, null, 2), "utf8");
  // eslint-disable-next-line no-console
  console.log(`Wrote ${out.length} ESCO skills to ${path.pathname}`);
}

buildEscoSkills().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

