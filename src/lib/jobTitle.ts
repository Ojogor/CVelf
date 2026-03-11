/**
 * Strip common suffixes from job titles (e.g. " - Job Post", " | LinkedIn").
 * Use when saving or displaying job titles.
 */
export function cleanJobTitle(raw: string | undefined | null): string {
  let t = (raw || "").trim();
  if (!t) return "Untitled";

  const suffixes = [
    /\s*[-–—]\s*job\s*post(ing)?\s*$/i,
    /\s+job\s*post(ing)?\s*$/i,
    /\s*[-–—]\s*job\s*description\s*$/i,
    /\s*[-–—]\s*careers?\b.*$/i,
    /\s*\|\s*indeed.*$/i,
    /\s*\|\s*linkedin.*$/i,
    /\s*\|\s*glassdoor.*$/i,
  ];

  for (const rx of suffixes) {
    t = t.replace(rx, "").trim();
  }

  return t || "Untitled";
}
