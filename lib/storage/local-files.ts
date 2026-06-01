import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const storageRoot = path.join(process.cwd(), "storage");
const cvDirectory = path.join(storageRoot, "cv");

export async function ensureStorageDirs() {
  await mkdir(cvDirectory, { recursive: true });
}

export function getCvStoragePath(fileName: string) {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const stamped = `${Date.now()}-${sanitized}`;

  return {
    absolutePath: path.join(cvDirectory, stamped),
    relativePath: `./storage/cv/${stamped}`,
  };
}

export async function saveUploadedFile(file: File) {
  await ensureStorageDirs();

  const buffer = Buffer.from(await file.arrayBuffer());
  const target = getCvStoragePath(file.name);

  await writeFile(target.absolutePath, buffer);

  return target;
}
