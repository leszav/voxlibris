import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const TARGET_DIRS = [
  "attached_assets/generated_images",
  "client/public",
];

const SOURCE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
const WEBP_MIN_BYTES = 40 * 1024;
const AVIF_MIN_BYTES = 200 * 1024;

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

async function convertImage(filePath: string) {
  const fileStats = await stat(filePath);
  const ext = path.extname(filePath).toLowerCase();
  if (!SOURCE_EXTENSIONS.has(ext)) {
    return;
  }

  const image = sharp(filePath).rotate();
  const imageMetadata = await image.metadata();
  const webpPath = filePath.replace(/\.[^.]+$/, ".webp");
  const avifPath = filePath.replace(/\.[^.]+$/, ".avif");

  if (fileStats.size >= WEBP_MIN_BYTES) {
    await ensureDir(webpPath);
    const webpBuffer = await image.clone().webp({ quality: 82, effort: 4 }).toBuffer();
    await writeFile(webpPath, webpBuffer);
    console.log(`WEBP ${path.relative(process.cwd(), webpPath)} (${fileStats.size} -> ${webpBuffer.length})`);
  }

  if (fileStats.size >= AVIF_MIN_BYTES && (imageMetadata.width ?? 0) >= 800) {
    await ensureDir(avifPath);
    const avifBuffer = await image.clone().avif({ quality: 58, effort: 6 }).toBuffer();
    await writeFile(avifPath, avifBuffer);
    console.log(`AVIF ${path.relative(process.cwd(), avifPath)} (${fileStats.size} -> ${avifBuffer.length})`);
  }
}

async function main() {
  for (const dir of TARGET_DIRS) {
    const absoluteDir = path.resolve(process.cwd(), dir);
    const files = await walk(absoluteDir);
    for (const filePath of files) {
      await convertImage(filePath);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
