"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ResumeBuilderEditor } from "@/components/ResumeBuilderEditor";

export default function BuilderResumeDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const preview = search.get("preview") === "1";

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{preview ? "Preview resume" : "Edit resume"}</h1>
          <p className="text-xs text-slate-400 mt-1">Template-based resume (normalized JSON).</p>
        </div>
        <Link href="/resumes" className="text-sm text-slate-300 hover:text-white">
          Back
        </Link>
      </div>

      <ResumeBuilderEditor generatedResumeId={params.id} initialMode={preview ? "preview" : "edit"} />
    </div>
  );
}

