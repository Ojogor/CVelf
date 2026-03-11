import fs from "node:fs/promises";
import { PDFParse } from "pdf-parse";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Missing file path argument");
  process.exit(2);
}

try {
  const buf = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText({});
  await parser.destroy();
  process.stdout.write(JSON.stringify({ text: result?.text || "" }));
} catch (e) {
  process.stderr.write(String(e?.stack || e?.message || e));
  process.exit(1);
}

