import React, { useMemo } from "react";
import type { ResumeDocument } from "@/lib/tailor/document";
import { renderResumeHtmlFromDocument } from "@/lib/render/resumeHtml";

export function ResumeHtmlPreview({
  document,
  theme,
  fontFamily,
  fontSize,
  templateName,
}: {
  document: ResumeDocument;
  theme: { primaryColor: string; accentColor: string; backgroundColor: string };
  fontFamily: string;
  fontSize: number;
  templateName?: string;
}) {
  const srcDoc = useMemo(() => {
    return renderResumeHtmlFromDocument(document, { theme, fontFamily, fontSize, templateName });
  }, [document, theme, fontFamily, fontSize, templateName]);

  return (
    <div className="rounded-xl border border-slate-700/50 shadow-lg max-w-3xl mx-auto overflow-auto bg-white">
      <iframe
        title="Resume preview"
        className="w-full min-h-[80vh]"
        sandbox="allow-same-origin"
        srcDoc={srcDoc}
      />
    </div>
  );
}

