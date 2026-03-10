"use client";

import React from "react";

function splitToBlocks(text: string) {
  const t = (text || "").replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  return t.split(/\n{2,}/g).map((b) => b.trim()).filter(Boolean);
}

export function FormattedText({ text }: { text: string | null | undefined }) {
  if (!text) return <p className="text-slate-500">No content.</p>;
  const blocks = splitToBlocks(text);

  return (
    <div className="space-y-3 text-sm leading-6 text-slate-200">
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        const bulletLines = lines.filter((l) => l.startsWith("- ") || l.startsWith("• "));
        const nonBullet = lines.filter((l) => !(l.startsWith("- ") || l.startsWith("• ")));

        if (bulletLines.length >= Math.max(2, lines.length - 1)) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {bulletLines.map((l, j) => (
                <li key={j} className="text-slate-200">
                  {l.replace(/^[-•]\s+/, "")}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={i} className="text-slate-200 whitespace-pre-wrap">
            {nonBullet.join("\n")}
          </p>
        );
      })}
    </div>
  );
}

