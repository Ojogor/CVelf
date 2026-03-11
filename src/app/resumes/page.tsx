"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Resume } from "@prisma/client";
import { fetchJson } from "@/lib/fetchJson";

export default function ResumesPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/resumes");
      const data = await fetchJson<any>(res);
      if (!res.ok) throw new Error(data.error || "Failed to fetch");
      setResumes(data as Resume[]);
    })().catch((e) => setError(e instanceof Error ? e.message : "Failed to fetch"));
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resumes</h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage your master resumes. Click a card to view and tailor, or delete ones you no longer use.
          </p>
        </div>
        <Link
          href="/resumes/new"
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
        >
          Add resume
        </Link>
      </div>

      {error && <p className="text-red-400">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {resumes.map((r) => (
          <Link
            key={r.id}
            href={`/resumes/${r.id}`}
            className="p-4 rounded-xl border border-slate-700/50 bg-slate-900/40 hover:bg-slate-800/40"
          >
            <p className="font-medium truncate">{r.name}</p>
            <p className="text-xs text-slate-500 mt-1">
              Updated {new Date(r.updatedAt).toLocaleDateString()}
            </p>
            <p className="text-xs text-slate-500 mt-2 line-clamp-3">
              {r.content ? r.content.slice(0, 200) : "No content yet"}
            </p>
          </Link>
        ))}
      </div>

      {!error && resumes.length === 0 && (
        <p className="text-slate-400">No resumes yet. Add one to start scoring jobs.</p>
      )}
    </div>
  );
}

