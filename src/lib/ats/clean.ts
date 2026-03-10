export function cleanText(input: string) {
  const text = (input || "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•·◦]/g, "-")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

export function toLines(text: string) {
  return cleanText(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function toSentences(text: string) {
  const cleaned = cleanText(text);
  const raw = cleaned
    .replace(/\n+/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return raw;
}

