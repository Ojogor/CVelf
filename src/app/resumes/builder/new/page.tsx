"use client";

import Link from "next/link";
import { ResumeBuilderEditor } from "@/components/ResumeBuilderEditor";

export default function NewBuilderResumePage() {
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Create resume</h1>
          <p className="text-xs text-slate-400 mt-1">Start from a template and save as normalized JSON.</p>
        </div>
        <Link href="/resumes" className="text-sm text-slate-300 hover:text-white">
          Back
        </Link>
      </div>

      <ResumeBuilderEditor />
    </div>
  );
}

