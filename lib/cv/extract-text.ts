import { readFile } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
// @ts-expect-error pdf-parse has no types
import { PDFParse } from "pdf-parse/dist/pdf-parse/cjs/index.cjs";

const supportedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
]);

const supportedExtensions = new Set([".pdf", ".docx", ".txt", ".md", ".markdown"]);

export function isSupportedCvFile(fileName: string, mimeType?: string) {
  const extension = path.extname(fileName).toLowerCase();

  return supportedExtensions.has(extension) || (!!mimeType && supportedMimeTypes.has(mimeType));
}

export async function extractTextFromCv(filePath: string, mimeType?: string) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".txt" || extension === ".md" || extension === ".markdown") {
    return readPlainText(filePath);
  }

  if (
    extension === ".docx" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return readDocxText(filePath);
  }

  if (extension === ".pdf" || mimeType === "application/pdf") {
    return readPdfText(filePath);
  }

  throw new Error(`Unsupported CV format: ${extension || mimeType || "unknown"}`);
}

async function readPlainText(filePath: string) {
  return readFile(filePath, "utf8");
}

async function readDocxText(filePath: string) {
  const result = await mammoth.extractRawText({ path: filePath });

  return result.value.trim();
}

async function readPdfText(filePath: string) {
  const buffer = await readFile(filePath);

  // Point to the worker file explicitly to avoid Next.js resolution issues
  const workerPath = path.resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
  PDFParse.setWorker(workerPath);

  const parser = new PDFParse({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useWorkerFetch: false,
  });
  const result = await parser.getText();

  return result.text.trim();
}
