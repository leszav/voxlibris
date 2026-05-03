import { build as viteBuild } from "vite";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";
import { cp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { checkStaticImages } from "./check-static-images.ts";

const execAsync = promisify(exec);
const gzipAsync = promisify(gzip);
const brotliCompressAsync = promisify(brotliCompress);
const COMPRESSIBLE_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".svg", ".txt", ".xml"]);

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(fullPath);
    }

    return [fullPath];
  }));

  return files.flat();
}

async function writeCompressedFile(outputPath: string, buffer: Buffer) {
  const existingStats = await stat(outputPath).catch(() => null);
  if (existingStats && existingStats.size === buffer.length) {
    return false;
  }

  await writeFile(outputPath, buffer);
  return true;
}

async function precompressPublicAssets() {
  const distPublicDir = path.resolve(process.cwd(), "dist/public");
  const files = await walk(distPublicDir);

  for (const filePath of files) {
    const extension = path.extname(filePath).toLowerCase();
    if (!COMPRESSIBLE_EXTENSIONS.has(extension)) {
      continue;
    }

    const sourceBuffer = await readFile(filePath);

    const [brotliBuffer, gzipBuffer] = await Promise.all([
      brotliCompressAsync(sourceBuffer, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
        },
      }),
      gzipAsync(sourceBuffer, { level: 9 }),
    ]);

    if (brotliBuffer.length < sourceBuffer.length) {
      await writeCompressedFile(`${filePath}.br`, brotliBuffer);
    }

    if (gzipBuffer.length < sourceBuffer.length) {
      await writeCompressedFile(`${filePath}.gz`, gzipBuffer);
    }
  }
}

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("verifying static images...");
  await checkStaticImages();

  console.log("building client...");
  await viteBuild();

  console.log("precompressing client assets...");
  await precompressPublicAssets();

  console.log("building server...");
  await execAsync("npx tsc --project tsconfig.server.json");

  console.log("copying assets...");
  await cp("email-templates", "dist/email-templates", { recursive: true });
}

try {
  await buildAll();
} catch (err) {
  console.error(err);
  process.exit(1);
}
