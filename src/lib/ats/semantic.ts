import { cleanText } from "./clean";

function tokenize(text: string) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && w.length <= 24);
}

function termFreq(tokens: string[]) {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

function dot(a: Map<string, number>, b: Map<string, number>) {
  let s = 0;
  for (const [k, av] of a) {
    const bv = b.get(k);
    if (bv) s += av * bv;
  }
  return s;
}

function norm(m: Map<string, number>) {
  let s = 0;
  for (const v of m.values()) s += v * v;
  return Math.sqrt(s);
}

export function localTextSimilarity(a: string, b: string) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length < 10 || tb.length < 10) return 0;
  const fa = termFreq(ta);
  const fb = termFreq(tb);
  const denom = norm(fa) * norm(fb);
  if (!denom) return 0;
  return dot(fa, fb) / denom;
}

export function scoreSemanticAlignmentLocal(jobText: string, resumeText: string) {
  const sim = localTextSimilarity(jobText, resumeText);
  // map cosine (~0..1) to a score-ish 0..100 with soft scaling
  const score = Math.max(0, Math.min(100, Math.round(sim * 140)));
  return { score, similarity: sim };
}

