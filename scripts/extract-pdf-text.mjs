import fs from "node:fs/promises";
import pdfParse from "pdf-parse";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Missing file path argument");
  process.exit(2);
}

try {
  const buf = await fs.readFile(filePath);
  const data = await pdfParse(buf);
  process.stdout.write(JSON.stringify({ text: data.text || "" }));
} catch (e) {
  process.stderr.write(String(e?.stack || e?.message || e));
  process.exit(1);
}

