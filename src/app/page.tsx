import Link from "next/link";
import { prisma } from "@/lib/db";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [jobCount, resumeCount] = await Promise.all([
    prisma.job.count(),
    prisma.resume.count(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Welcome back</h2>
        <p className="text-slate-400">
          Save jobs, tailor resumes, and track your pipeline.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <p className="text-sm text-slate-400">Jobs</p>
          <p className="text-3xl font-bold">{jobCount}</p>
          <Link className="text-blue-500 hover:underline text-sm" href="/jobs">
            View jobs
          </Link>
        </div>
        <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <p className="text-sm text-slate-400">Resumes</p>
          <p className="text-3xl font-bold">{resumeCount}</p>
          <Link className="text-blue-500 hover:underline text-sm" href="/resumes">
            View resumes
          </Link>
        </div>
      </div>

      <Link
        href="/jobs/new"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition"
      >
        <Plus className="w-4 h-4" />
        Add Job
      </Link>
    </div>
  );
}

