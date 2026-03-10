import { cleanText } from "./clean";

const RAW_SKILLS = [
  // frontend
  "javascript",
  "typescript",
  "react",
  "next.js",
  "vue",
  "angular",
  "html",
  "css",
  "sass",
  "tailwind",
  "accessibility",
  "ui",
  "ux",
  // backend
  "node.js",
  "express",
  "python",
  "django",
  "flask",
  "java",
  "spring",
  "c#",
  ".net",
  "php",
  "wordpress",
  // data
  "sql",
  "postgresql",
  "mysql",
  "sqlite",
  "mongodb",
  // cloud/devops
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",
  "ci/cd",
  "git",
  // APIs
  "rest",
  "graphql",
  // testing
  "jest",
  "cypress",
  "playwright",
  // misc
  "figma",
  "jira",
  "agile",
] as const;

const SYNONYMS: Record<string, string[]> = {
  "next.js": ["nextjs", "next js"],
  "node.js": ["nodejs", "node js"],
  postgresql: ["postgres", "postgre sql"],
  "ci/cd": ["cicd", "ci cd"],
  graphql: ["graph ql"],
  ".net": ["dotnet"],
  "c#": ["c sharp"],
  ux: ["user experience"],
  ui: ["user interface", "user interfaces"],
  "rest": ["rest api", "restful", "restful api"],
};

function norm(s: string) {
  return cleanText(s).toLowerCase();
}

export const KNOWN_SKILLS = RAW_SKILLS.map((s) => norm(s));

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

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

