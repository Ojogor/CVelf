/**
 * Local, free text similarity utilities for job–resume match.
 * No heavy ML runtime; just pure TypeScript/JavaScript.
 */

const MAX_TEXT_LENGTH = 8000;

function truncate(text: string): string {
  const t = (text || "").trim();
  if (t.length <= MAX_TEXT_LENGTH) return t;
  return t.slice(0, MAX_TEXT_LENGTH) + "...";
}

/**
 * Simple tokenization + normalization: lowercase, strip punctuation, split on whitespace.
 */
function tokenize(text: string): string[] {
  return truncate(text)
    .toLowerCase()
    // Avoid Unicode property escapes for broad TS target compatibility.
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Build a term-frequency map for a text.
 */
function termFreq(text: string): Map<string, number> {
  const tf = new Map<string, number>();
  for (const w of tokenize(text)) {
    tf.set(w, (tf.get(w) ?? 0) + 1);
  }
  return tf;
}

/**
 * Cosine similarity between two term-frequency maps.
 */
function cosineFromTF(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  // Avoid iterating Map iterators directly for broad TS target compatibility.
  a.forEach((av, term) => {
    const bv = b.get(term) ?? 0;
    dot += av * bv;
    normA += av * av;
  });
  b.forEach((v) => {
    normB += v * v;
  });
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Local semantic-ish similarity score (0–100) using cosine over term frequencies.
 * Completely free and local; no external models or APIs.
 */
export function localSemanticScore(jobText: string, resumeText: string): number {
  const tfJob = termFreq(jobText);
  const tfResume = termFreq(resumeText);
  const sim = cosineFromTF(tfJob, tfResume); // 0..1 in practice
  return Math.round(sim * 100);
}

