import { cleanText } from "./clean";
import languages from "../../../skills/languages.json";
import frameworks from "../../../skills/frameworks.json";
import databases from "../../../skills/databases.json";
import cloud from "../../../skills/cloud.json";
import tools from "../../../skills/tools.json";
import analytics from "../../../skills/analytics.json";
import aliases from "../../../skills/aliases.json";
import stopwords from "../../../skills/stopwords.json";

// Canonical skills the system understands well, loaded from JSON.
const RAW_SKILLS: string[] = [
  ...languages,
  ...frameworks,
  ...databases,
  ...cloud,
  ...tools,
  ...analytics.analytics_tools,
  ...analytics.data_science,
  ...analytics.ml_frameworks,
];

// Aliases and common variants for Layer 2 normalization.
const SYNONYMS: Record<string, string[]> = aliases as Record<string, string[]>;

const TECH_LOOKALIKE_STOP = new Set<string>(stopwords as string[]);

// Simple domain / action term dictionaries for grouping.
const DOMAIN_TERMS: string[] = analytics.domain_terms;

const SOFT_SKILL_TERMS: string[] = analytics.soft_skills;

function norm(s: string) {
  return cleanText(s).toLowerCase();
}

export const KNOWN_SKILLS = RAW_SKILLS.map((s) => norm(s));

// Layer 1+2: canonical skill extraction with aliases.
export function extractSkills(text: string) {
  const t = ` ${norm(text)} `;
  const found = new Set<string>();

  for (const base of KNOWN_SKILLS) {
    const all = [base, ...(SYNONYMS[base] || [])].map((x) => norm(x));
    for (const s of all) {
      const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(s)}([^a-z0-9]|$)`, "i");
      if (pattern.test(t)) {
        found.add(base);
        break;
      }
    }
  }

  return Array.from(found).sort();
}

// Higher level analysis used by Job Intelligence to surface
// recognized skills, other technical terms, and domain/soft signals.
export function analyzeJobSignals(text: string) {
  const cleaned = norm(text || "");
  const recognizedSkills = extractSkills(cleaned);

  const tokens = Array.from(
    new Set(
      cleaned
        .split(/[^a-z0-9+.#/]+/i)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2 && t.length <= 32)
    )
  );

  const otherTechnicalTerms: string[] = [];

  for (const tok of tokens) {
    const lower = tok.toLowerCase();
    if (KNOWN_SKILLS.includes(lower)) continue;

    const looksLikeTech =
      /[.#]/.test(tok) || // e.g. ".NET", "Node.js"
      /^[a-z]+(js|sql|db)$/.test(lower) || // reactjs, postgresdb
      /^[A-Z][A-Za-z0-9]{2,}$/.test(tok) || // React, Elixir
      /^[A-Z0-9]{2,8}$/.test(tok); // AWS, S3

    if (!looksLikeTech) continue;
    if (TECH_LOOKALIKE_STOP.has(lower)) continue;
    otherTechnicalTerms.push(tok);
  }

  const domainTerms = DOMAIN_TERMS.filter((term) => cleaned.includes(term));
  const softSkills = SOFT_SKILL_TERMS.filter((term) => cleaned.includes(term));

  return {
    recognizedSkills,
    otherTechnicalTerms: Array.from(new Set(otherTechnicalTerms)).slice(0, 20),
    domainTerms: Array.from(new Set(domainTerms)),
    softSkills: Array.from(new Set(softSkills)),
    confidenceSummary: {
      high: recognizedSkills,
      medium: otherTechnicalTerms.slice(0, 20),
      low: [...domainTerms, ...softSkills].slice(0, 20),
    },
  };
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

