import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { STATIC_IMAGE_MANIFEST_PATH } from "./static-image-config.ts";

export interface StaticImageManifestVariant {
  path: string;
  sha256: string;
}

export interface StaticImageManifestEntry {
  sourceSha256: string;
  variants: Partial<Record<"webp" | "avif", StaticImageManifestVariant>>;
}

export interface StaticImageManifest {
  version: 1;
  items: Record<string, StaticImageManifestEntry>;
}

export function toRepoRelativePath(filePath: string) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

export function sha256FromBuffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function sha256FromFile(filePath: string) {
  const buffer = await readFile(filePath);
  return sha256FromBuffer(buffer);
}

export async function loadStaticImageManifest(manifestPath = STATIC_IMAGE_MANIFEST_PATH): Promise<StaticImageManifest> {
  const raw = await readFile(manifestPath, "utf8");
  return JSON.parse(raw) as StaticImageManifest;
}

export async function saveStaticImageManifest(manifest: StaticImageManifest, manifestPath = STATIC_IMAGE_MANIFEST_PATH) {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
