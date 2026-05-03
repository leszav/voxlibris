import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  STATIC_IMAGE_AVIF_OPTIONS,
  STATIC_IMAGE_AVIF_MIN_BYTES,
  STATIC_IMAGE_MIN_SAVINGS_RATIO,
  STATIC_IMAGE_SOURCE_EXTENSIONS,
  STATIC_IMAGE_TARGET_DIRS,
  STATIC_IMAGE_WEBP_OPTIONS,
  STATIC_IMAGE_WEBP_MIN_BYTES,
} from "./static-image-config.ts";
import {
  saveStaticImageManifest,
  sha256FromBuffer,
  sha256FromFile,
  toRepoRelativePath,
  type StaticImageManifest,
  type StaticImageManifestEntry,
} from "./static-image-manifest.ts";

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(fullPath);
      }
      return [fullPath];
    }),
  );

  return files.flat();
}

async function ensureDir(filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

function isWorthWriting(sourceSize: number, optimizedSize: number) {
  return optimizedSize < sourceSize * (1 - STATIC_IMAGE_MIN_SAVINGS_RATIO);
}

async function convertImage(filePath: string) {
  const fileStats = await stat(filePath);
  const ext = path.extname(filePath).toLowerCase();
  if (!STATIC_IMAGE_SOURCE_EXTENSIONS.has(ext)) {
    return null;
  }

  const image = sharp(filePath).rotate();
  const imageMetadata = await image.metadata();
  const webpPath = filePath.replace(/\.[^.]+$/, ".webp");
  const avifPath = filePath.replace(/\.[^.]+$/, ".avif");
  const manifestEntry: StaticImageManifestEntry = {
    sourceSha256: await sha256FromFile(filePath),
    variants: {},
  };

  if (fileStats.size >= STATIC_IMAGE_WEBP_MIN_BYTES) {
    const webpBuffer = await image.clone().webp(STATIC_IMAGE_WEBP_OPTIONS).toBuffer();
    if (isWorthWriting(fileStats.size, webpBuffer.length)) {
      await ensureDir(webpPath);
      await writeFile(webpPath, webpBuffer);
      manifestEntry.variants.webp = {
        path: toRepoRelativePath(webpPath),
        sha256: sha256FromBuffer(webpBuffer),
      };
      console.log(`WEBP ${path.relative(process.cwd(), webpPath)} (${fileStats.size} -> ${webpBuffer.length})`);
    }
  }

  if (fileStats.size >= STATIC_IMAGE_AVIF_MIN_BYTES && (imageMetadata.width ?? 0) >= 800) {
    const avifBuffer = await image.clone().avif(STATIC_IMAGE_AVIF_OPTIONS).toBuffer();
    if (isWorthWriting(fileStats.size, avifBuffer.length)) {
      await ensureDir(avifPath);
      await writeFile(avifPath, avifBuffer);
      manifestEntry.variants.avif = {
        path: toRepoRelativePath(avifPath),
        sha256: sha256FromBuffer(avifBuffer),
      };
      console.log(`AVIF ${path.relative(process.cwd(), avifPath)} (${fileStats.size} -> ${avifBuffer.length})`);
    }
  }

  return manifestEntry;
}

function sortManifest(items: StaticImageManifest["items"]): StaticImageManifest {
  return {
    version: 1,
    items: Object.fromEntries(
      Object.entries(items)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [
          key,
          {
            sourceSha256: entry.sourceSha256,
            variants: Object.fromEntries(
              Object.entries(entry.variants).sort(([left], [right]) => left.localeCompare(right)),
            ),
          },
        ]),
    ),
  };
}

export async function optimizeStaticImages(targetDirs: string[] = STATIC_IMAGE_TARGET_DIRS) {
  const manifestItems: StaticImageManifest["items"] = {};

  for (const dir of targetDirs) {
    const absoluteDir = path.resolve(process.cwd(), dir);
    const files = await walk(absoluteDir);
    for (const filePath of files) {
      const manifestEntry = await convertImage(filePath);
      if (!manifestEntry) {
        continue;
      }

      manifestItems[toRepoRelativePath(filePath)] = manifestEntry;
    }
  }

  await saveStaticImageManifest(sortManifest(manifestItems));
}

const currentFilePath = fileURLToPath(import.meta.url);
const executedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : null;

if (executedFilePath === currentFilePath) {
  optimizeStaticImages().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
