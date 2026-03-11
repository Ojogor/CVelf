"use client";

import { useEffect, useMemo, useState } from "react";
import type { MasterExperience, ExperienceBullet, Resume } from "@prisma/client";
import { fetchJson } from "@/lib/fetchJson";
import { getAiSettings } from "@/lib/ai/clientSettings";

type ExperienceWithBullets = MasterExperience & { bullets: ExperienceBullet[] };

type GroupKey = "job" | "internship" | "project" | "course" | "certification" | "other";

function groupType(raw: string | null): GroupKey {
  const t = (raw || "").toLowerCase();
  if (t.includes("intern")) return "internship";
  if (t.includes("project")) return "project";
  if (t.includes("course")) return "course";
  if (t.includes("cert")) return "certification";
  if (t === "job" || !t) return "job";
  return "other";
}

export default function ExperienceBankPage() {
  const [items, setItems] = useState<ExperienceWithBullets[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [fileExtracting, setFileExtracting] = useState(false);
  const [view, setView] = useState<"roles" | "organizations" | "skills" | "qualifications" | "volunteering">(
    "roles",
  );
  const [resumes, setResumes] = useState<Resume[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [expRes, resumesRes] = await Promise.all([fetch("/api/experience"), fetch("/api/resumes")]);
      const [expData, resumesData] = await Promise.all([
        fetchJson<any>(expRes),
        fetchJson<any>(resumesRes),
      ]);
      if (!expRes.ok) {
        throw new Error(
          (expData && typeof expData.error === "string" && expData.error) || "Failed to load experiences",
        );
      }
      if (!Array.isArray(expData)) {
        throw new Error("Experience API returned unexpected data shape.");
      }
      setItems(expData as ExperienceWithBullets[]);
      if (resumesRes.ok && Array.isArray(resumesData)) {
        setResumes(resumesData as Resume[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load experiences");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const grouped = useMemo(() => {
    const map: Record<GroupKey, ExperienceWithBullets[]> = {
      job: [],
      internship: [],
      project: [],
      course: [],
      certification: [],
      other: [],
    };
    for (const exp of items) {
      const g = groupType(exp.type);
      map[g].push(exp);
    }
    return map;
  }, [items]);

  const organizations = useMemo(() => {
    const map = new Map<string, { name: string; items: ExperienceWithBullets[] }>();
    for (const exp of items) {
      const key =
        (exp.normalizedCompany || exp.organization || "").trim().toLowerCase() || `exp-${exp.id}`;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(exp);
      } else {
        map.set(key, { name: exp.organization, items: [exp] });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const volunteering = useMemo(
    () =>
      items.filter((exp) => (exp.type || "").toLowerCase().includes("volunteer")),
    [items],
  );

  const skillsIndex = useMemo(() => {
    const map = new Map<
      string,
      { skill: string; count: number; orgs: Set<string> }
    >();
    for (const exp of items) {
      const raw = (exp.skills || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const s of raw) {
        const key = s.toLowerCase();
        const entry = map.get(key);
        if (entry) {
          entry.count += 1;
          entry.orgs.add(exp.organization);
        } else {
          map.set(key, { skill: s, count: 1, orgs: new Set(exp.organization ? [exp.organization] : []) });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill));
  }, [items]);

  const allBullets = useMemo(
    () =>
      items.flatMap((exp) =>
        exp.bullets.map((b) => ({
          exp,
          bullet: b,
        })),
      ),
    [items],
  );

  async function updateExperience(id: string, patch: Partial<ExperienceWithBullets>) {
    try {
      const res = await fetch("/api/experience", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const body = await fetchJson<ExperienceWithBullets>(res);
      if (!res.ok) throw new Error((body as any)?.error || "Update failed");
      setItems((prev) => prev.map((e) => (e.id === id ? { ...e, ...body } : e)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function createBullet(experienceId: string, text: string) {
    const res = await fetch("/api/experience/bullets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experienceId, text }),
    });
    const body = await fetchJson<ExperienceBullet>(res);
    if (!res.ok) throw new Error((body as any)?.error || "Create bullet failed");
    setItems((prev) =>
      prev.map((exp) => (exp.id === experienceId ? { ...exp, bullets: [...exp.bullets, body] } : exp)),
    );
  }

  async function updateBullet(id: string, patch: Partial<ExperienceBullet>) {
    try {
      const res = await fetch(`/api/experience/bullets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await fetchJson<ExperienceBullet>(res);
      if (!res.ok) throw new Error((body as any)?.error || "Update failed");
      setItems((prev) =>
        prev.map((exp) => ({
          ...exp,
          bullets: exp.bullets.map((b) => (b.id === id ? { ...b, ...body } : b)),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function deleteBullet(id: string) {
    try {
      const res = await fetch(`/api/experience/bullets/${id}`, { method: "DELETE" });
      const body = await fetchJson<any>(res);
      if (!res.ok) throw new Error(body?.error || "Delete failed");
      setItems((prev) =>
        prev.map((exp) => ({
          ...exp,
          bullets: exp.bullets.filter((b) => b.id !== id),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function importWithAi() {
    if (!importText.trim()) return;
    const ai = getAiSettings();
    if (ai.provider === "local" || !ai.apiKey) {
      setError("AI provider is set to Local or missing API key.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: ai.provider,
          apiKey: ai.apiKey,
          task: "profile_autofill",
          input: { text: importText },
        }),
      });
      const body = await fetchJson<any>(res);
      if (!res.ok) throw new Error(body?.error || "AI import failed");
      if (body?.ok === false && typeof body?.error === "string") throw new Error(body.error);

      const data = body?.data || {};
      const experiences: any[] = Array.isArray(data.experiences) ? data.experiences : [];

      // If the AI layer returned no experiences but included a diagnostic note,
      // surface that directly to the user instead of silently doing nothing.
      if (!experiences.length) {
        const note =
          typeof data._note === "string" && data._note.trim()
            ? data._note.trim()
            : "AI did not return any structured experiences. Check your API key and try again, or paste a simpler text snippet.";
        setError(note);
        return;
      }

      // Create experiences + bullets sequentially to keep it simple and robust.
      for (const e of experiences) {
        const expRes = await fetch("/api/experience", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: e.type,
            organization: e.organization || e.school || e.company,
            title: e.title,
            location: e.location,
            startDate: e.startDate,
            endDate: e.endDate,
            current: e.current,
            skills: (e.skills || []).join(", "),
          }),
        });
        const expBody = await fetchJson<ExperienceWithBullets>(expRes);
        if (!expRes.ok) continue;

        const createdExp = expBody as ExperienceWithBullets;
        const bullets: string[] = Array.isArray(e.bullets) ? e.bullets : [];
        for (const b of bullets) {
          if (!b || typeof b !== "string") continue;
          await createBullet(createdExp.id, b);
        }
      }

      setImportText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI import failed");
    } finally {
      setImporting(false);
    }
  }

  const sections: { key: GroupKey; label: string }[] = [
    { key: "job", label: "Jobs" },
    { key: "internship", label: "Internships" },
    { key: "project", label: "Projects" },
    { key: "course", label: "Courses" },
    { key: "certification", label: "Certifications" },
    { key: "other", label: "Other" },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-700/60 bg-slate-950/60 p-4">
          <h1 className="text-2xl font-bold">Experience Bank</h1>
          <p className="mt-1 text-xs text-slate-400 max-w-2xl">
            Central place for reusable bullets from jobs, internships, projects, courses, volunteering, and
            certifications. Use it to power resume tailoring and job-fit.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 space-y-2">
            <p className="text-[11px] text-slate-400">
              Paste a resume, LinkedIn profile, or CV text. We’ll use AI to autofill experiences (jobs, internships,
              projects, volunteering, education, certifications) into the bank.
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-xs text-slate-100 resize-y"
              placeholder="Paste your resume or profile text here…"
            />
            <button
              type="button"
              onClick={importWithAi}
              disabled={importing || !importText.trim()}
              className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium"
            >
              {importing ? "Importing with AI…" : "Autofill with AI"}
            </button>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 space-y-2">
            <p className="text-[11px] text-slate-400">
              Or upload a resume file (PDF or DOCX). We’ll extract the text first, then run the same AI autofill.
            </p>
            <input
              type="file"
              accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="block w-full text-xs text-slate-300 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-700 file:text-white hover:file:bg-slate-600"
            />
            <button
              type="button"
              onClick={async () => {
                if (!importFile) return;
                setFileExtracting(true);
                setError(null);
                try {
                  const form = new FormData();
                  form.set("name", importFile.name || "Uploaded resume");
                  form.set("file", importFile);
                  const res = await fetch("/api/resumes/upload", { method: "POST", body: form });
                  const data = await fetchJson<any>(res);
                  if (!res.ok) throw new Error(data?.error || "Upload failed");
                  const text = String(data?.resume?.content || "");
                  if (!text.trim()) {
                    throw new Error("Could not extract text from this file. Try pasting the text instead.");
                  }
                  setImportText(text);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "File import failed");
                } finally {
                  setFileExtracting(false);
                }
              }}
              disabled={fileExtracting || !importFile}
              className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium"
            >
              {fileExtracting ? "Extracting…" : "Extract from file"}
            </button>
            <p className="text-[11px] text-slate-500">
              We’ll save a temporary resume record and reuse its cleaned text here.
            </p>
          </div>
        </div>

        {resumes.length > 0 && (
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-200">Resumes</p>
              <a
                href="/resumes"
                className="text-[11px] text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline"
              >
                Manage all
              </a>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {resumes.slice(0, 6).map((r) => (
                <a
                  key={r.id}
                  href={`/resumes/${r.id}`}
                  className="rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 hover:bg-slate-900/80"
                >
                  <p className="font-medium truncate">{r.name}</p>
                  <p className="text-[10px] text-slate-400">
                    Updated {new Date(r.updatedAt).toLocaleDateString()}
                  </p>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        {[
          ["roles", "By roles"],
          ["organizations", "By organization"],
          ["skills", "By skills"],
          ["qualifications", "Qualifications (all bullets)"],
          ["volunteering", "Volunteering"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() =>
              setView(
                id as "roles" | "organizations" | "skills" | "qualifications" | "volunteering",
              )
            }
            className={
              "px-3 py-1.5 rounded-lg text-xs font-semibold border " +
              (view === id
                ? "bg-slate-100 text-slate-900 border-slate-100"
                : "bg-slate-900/40 text-slate-200 border-slate-700 hover:bg-slate-800/60")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && <p className="text-sm text-slate-400">Loading…</p>}

      {view === "roles" && (
        <>
          {sections.map(({ key, label }) => {
            const exps = grouped[key];
            if (!exps.length) return null;
            return (
              <section key={key} className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-200">{label}</h2>
                <div className="space-y-3">
                  {exps.map((exp) => (
                    <div
                      key={exp.id}
                      className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <input
                            className="w-full bg-transparent text-sm font-semibold text-slate-50 outline-none"
                            value={exp.title}
                            onChange={(e) => updateExperience(exp.id, { title: e.target.value })}
                          />
                          <input
                            className="w-full bg-transparent text-xs text-slate-300 outline-none"
                            value={exp.organization}
                            onChange={(e) => updateExperience(exp.id, { organization: e.target.value })}
                          />
                          <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                            <input
                              className="bg-slate-900/60 rounded px-2 py-0.5 outline-none border border-slate-700/70"
                              placeholder="Start (YYYY-MM)"
                              value={exp.startDate || ""}
                              onChange={(e) => updateExperience(exp.id, { startDate: e.target.value })}
                            />
                            <input
                              className="bg-slate-900/60 rounded px-2 py-0.5 outline-none border border-slate-700/70"
                              placeholder="End (YYYY-MM or Present)"
                              value={exp.endDate || ""}
                              onChange={(e) => updateExperience(exp.id, { endDate: e.target.value })}
                            />
                            <input
                              className="bg-slate-900/60 rounded px-2 py-0.5 outline-none border border-slate-700/70"
                              placeholder="Location"
                              value={exp.location || ""}
                              onChange={(e) => updateExperience(exp.id, { location: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] text-slate-400">Bullets</p>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await createBullet(exp.id, "New bullet");
                              } catch (e) {
                                setError(e instanceof Error ? e.message : "Add bullet failed");
                              }
                            }}
                            className="text-[11px] px-2 py-1 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/60"
                          >
                            + Add bullet
                          </button>
                        </div>
                        <div className="space-y-2">
                          {exp.bullets.map((b) => (
                            <div
                              key={b.id}
                              className="flex items-start gap-2 rounded-lg bg-slate-900/40 border border-slate-700/60 p-2"
                            >
                              <span className="mt-1 text-xs text-slate-500">•</span>
                              <div className="flex-1 space-y-1">
                                <textarea
                                  className="w-full bg-transparent text-xs text-slate-100 outline-none resize-y"
                                  rows={2}
                                  value={b.text}
                                  onChange={(e) => updateBullet(b.id, { text: e.target.value })}
                                />
                                <div className="flex flex-wrap gap-2 text-[10px] text-slate-400">
                                  <input
                                    className="bg-slate-950/70 rounded px-2 py-0.5 outline-none border border-slate-800"
                                    placeholder="Tags (comma-separated)"
                                    value={b.tags || ""}
                                    onChange={(e) => updateBullet(b.id, { tags: e.target.value })}
                                  />
                                  <input
                                    className="bg-slate-950/70 rounded px-2 py-0.5 outline-none border border-slate-800"
                                    placeholder="Tools (comma-separated)"
                                    value={b.tools || ""}
                                    onChange={(e) => updateBullet(b.id, { tools: e.target.value })}
                                  />
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => deleteBullet(b.id)}
                                className="ml-1 text-[10px] text-slate-400 hover:text-red-400"
                              >
                                Delete
                              </button>
                            </div>
                          ))}
                          {!exp.bullets.length && (
                            <p className="text-xs text-slate-500">
                              No bullets yet. Use &quot;+ Add bullet&quot; above or import from a resume with AI.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}

      {view === "organizations" && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">By organization</h2>
          <div className="space-y-3">
            {organizations.map((org) => {
              const allBulletsForOrg = org.items.flatMap((exp) => exp.bullets);
              const primaryExp = org.items[0];
              return (
                <div
                  key={org.name}
                  className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-slate-50">
                        {org.name || "Untitled organization"}
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        {org.items.length} role{org.items.length === 1 ? "" : "s"} in this organization.
                      </p>
                    </div>
                    {primaryExp && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await createBullet(primaryExp.id, "New bullet");
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Add bullet failed");
                          }
                        }}
                        className="text-[11px] px-2 py-1 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/60"
                      >
                        + Add bullet
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] text-slate-400">Roles</p>
                    <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
                      {org.items.map((exp) => (
                        <span
                          key={exp.id}
                          className="px-2 py-0.5 rounded-full bg-slate-800/60 border border-slate-700/70"
                        >
                          {exp.title} · {exp.startDate || "?"} – {exp.endDate || "Present"}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] text-slate-400">Responsibilities & achievements</p>
                    <div className="space-y-2">
                      {allBulletsForOrg.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-start gap-2 rounded-lg bg-slate-900/40 border border-slate-700/60 p-2"
                        >
                          <span className="mt-1 text-xs text-slate-500">•</span>
                          <div className="flex-1 space-y-1">
                            <textarea
                              className="w-full bg-transparent text-xs text-slate-100 outline-none resize-y"
                              rows={2}
                              value={b.text}
                              onChange={(e) => updateBullet(b.id, { text: e.target.value })}
                            />
                            {b.tags && (
                              <p className="text-[10px] text-slate-400">
                                Tags: <span className="text-slate-200">{b.tags}</span>
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteBullet(b.id)}
                            className="ml-1 text-[10px] text-slate-400 hover:text-red-400"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                      {!allBulletsForOrg.length && (
                        <p className="text-xs text-slate-500">
                          No bullets yet for this organization. Use “+ Add bullet” to start capturing them.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {view === "skills" && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">By skills</h2>
          {!skillsIndex.length && (
            <p className="text-xs text-slate-500">
              No skills were detected yet. Add comma-separated skills to experiences or import again with AI.
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {skillsIndex.map((entry) => (
              <div
                key={entry.skill.toLowerCase()}
                className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-slate-50">{entry.skill}</p>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-200">
                    {entry.count} experience{entry.count === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-300">
                  {Array.from(entry.orgs).map((org) => (
                    <span
                      key={org}
                      className="px-2 py-0.5 rounded-full bg-slate-800/60 border border-slate-700/70"
                    >
                      {org}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {view === "qualifications" && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Qualifications (all bullets)</h2>
          {!allBullets.length && (
            <p className="text-xs text-slate-500">
              No bullets yet. Import from resumes or add bullets in the roles or organizations views.
            </p>
          )}
          <div className="space-y-2">
            {allBullets.map(({ exp, bullet }) => (
              <div
                key={bullet.id}
                className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-400">
                    {exp.title} · {exp.organization}
                  </p>
                  <button
                    type="button"
                    onClick={() => deleteBullet(bullet.id)}
                    className="text-[10px] text-slate-400 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
                <textarea
                  className="w-full bg-transparent text-xs text-slate-100 outline-none resize-y"
                  rows={2}
                  value={bullet.text}
                  onChange={(e) => updateBullet(bullet.id, { text: e.target.value })}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {view === "volunteering" && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Volunteering</h2>
          {!volunteering.length && (
            <p className="text-xs text-slate-500">
              No volunteering experiences detected yet. Make sure the type includes “volunteer” when importing or
              editing.
            </p>
          )}
          <div className="space-y-3">
            {volunteering.map((exp) => (
              <div
                key={exp.id}
                className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 space-y-3"
              >
                <div className="min-w-0 space-y-1">
                  <input
                    className="w-full bg-transparent text-sm font-semibold text-slate-50 outline-none"
                    value={exp.title}
                    onChange={(e) => updateExperience(exp.id, { title: e.target.value })}
                  />
                  <input
                    className="w-full bg-transparent text-xs text-slate-300 outline-none"
                    value={exp.organization}
                    onChange={(e) => updateExperience(exp.id, { organization: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] text-slate-400">Bullets</p>
                  <div className="space-y-2">
                    {exp.bullets.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-start gap-2 rounded-lg bg-slate-900/40 border border-slate-700/60 p-2"
                      >
                        <span className="mt-1 text-xs text-slate-500">•</span>
                        <div className="flex-1 space-y-1">
                          <textarea
                            className="w-full bg-transparent text-xs text-slate-100 outline-none resize-y"
                            rows={2}
                            value={b.text}
                            onChange={(e) => updateBullet(b.id, { text: e.target.value })}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteBullet(b.id)}
                          className="ml-1 text-[10px] text-slate-400 hover:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                    {!exp.bullets.length && (
                      <p className="text-xs text-slate-500">
                        No bullets yet. Use other views or add manually to describe your volunteering impact.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

