"use client";

import { useState } from "react";

const STATUSES = [
  "pending",
  "in_progress",
  "applied",
  "interviewing",
  "offer",
  "rejected",
] as const;

export function StatusSelect({
  jobId,
  currentStatus,
  onChanged,
  size = "md",
}: {
  jobId: string;
  currentStatus: string;
  onChanged?: (newStatus: string) => void;
  size?: "sm" | "md";
}) {
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);

  async function handleChange(newStatus: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setStatus(newStatus);
        onChanged?.(newStatus);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <select
      value={status}
      onChange={(e) => handleChange(e.target.value)}
      disabled={loading}
      className={[
        "rounded-lg bg-slate-800 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500",
        size === "sm" ? "px-2 py-1.5" : "px-3 py-2",
      ].join(" ")}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.replace("_", " ")}
        </option>
      ))}
    </select>
  );
}

