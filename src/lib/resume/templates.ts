import type { ResumeTemplate } from "./types";

import modern from "@/templates/resume/modern.json";
import minimal from "@/templates/resume/minimal.json";
import centered from "@/templates/resume/centered.json";

const ALL = [modern, minimal, centered] as unknown as ResumeTemplate[];

export function listResumeTemplates(): Array<Pick<ResumeTemplate, "templateName" | "layout">> {
  return ALL.map((t) => ({ templateName: t.templateName, layout: t.layout }));
}

export function getResumeTemplate(templateName: string): ResumeTemplate | null {
  const t = ALL.find((x) => x.templateName === templateName);
  return t ? (t as ResumeTemplate) : null;
}

export function defaultResumeTemplate(): ResumeTemplate {
  return (centered as unknown as ResumeTemplate) || (modern as unknown as ResumeTemplate) || {
    templateName: "default",
    layout: {
      page: { size: "letter", fontSize: 12, fontFamily: "Georgia" },
      sections: ["header", "experience", "skills"],
      theme: { primaryColor: "#0f172a", accentColor: "#2563eb", backgroundColor: "#ffffff" },
    },
  };
}

