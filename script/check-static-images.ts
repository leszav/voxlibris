import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STATIC_IMAGE_MANIFEST_PATH,
  STATIC_IMAGE_SOURCE_EXTENSIONS,
  STATIC_IMAGE_TARGET_DIRS,
} from "./static-image-config.ts";
import {
  loadStaticImageManifest,
  sha256FromFile,
  toRepoRelativePath,
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

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getOptimizedVariantIssue(
  optimizedPath: string,
  label: string,
  expectedSha256: string,
) {
  if (!(await fileExists(optimizedPath))) {
    return `${label} missing for ${optimizedPath}`;
  }

  const currentSha256 = await sha256FromFile(optimizedPath);
  if (currentSha256 !== expectedSha256) {
    return `${label} is stale for ${optimizedPath}`;
  }

  return null;
}

export async function checkStaticImages(targetDirs: string[] = STATIC_IMAGE_TARGET_DIRS) {
  const issues: string[] = [];
  let manifest;

  try {
    manifest = await loadStaticImageManifest();
  } catch {
    throw new Error(`Static image manifest is missing or unreadable at ${STATIC_IMAGE_MANIFEST_PATH}. Run \`pnpm images:optimize:static\`.`);
  }

  const seenSources = new Set<string>();

  for (const dir of targetDirs) {
    const absoluteDir = path.resolve(process.cwd(), dir);
    const files = await walk(absoluteDir);

    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      if (!STATIC_IMAGE_SOURCE_EXTENSIONS.has(ext)) {
        continue;
      }

      const relativeSourcePath = toRepoRelativePath(filePath);
      seenSources.add(relativeSourcePath);

      const manifestEntry = manifest.items[relativeSourcePath];
      if (!manifestEntry) {
        issues.push(`Manifest entry missing for ${relativeSourcePath}`);
        continue;
      }

      const sourceSha256 = await sha256FromFile(filePath);
      if (sourceSha256 !== manifestEntry.sourceSha256) {
        issues.push(`Source image is stale in manifest for ${relativeSourcePath}`);
        continue;
      }

      for (const [variantType, variantEntry] of Object.entries(manifestEntry.variants)) {
        if (!variantEntry) {
          continue;
        }

        const issue = await getOptimizedVariantIssue(variantEntry.path, variantType.toUpperCase(), variantEntry.sha256);
        if (issue) {
          issues.push(issue);
        }
      }
    }
  }

  for (const relativeSourcePath of Object.keys(manifest.items)) {
    if (!seenSources.has(relativeSourcePath)) {
      issues.push(`Manifest entry points to missing source ${relativeSourcePath}`);
    }
  }

  if (issues.length > 0) {
    console.error("Static image validation failed. Run `pnpm images:optimize:static` to refresh optimized variants.");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    throw new Error(`Found ${issues.length} static image optimization issue(s)`);
  }

  console.log("Static image validation passed.");
}

const currentFilePath = fileURLToPath(import.meta.url);
const executedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : null;

if (executedFilePath === currentFilePath) {
  checkStaticImages().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
