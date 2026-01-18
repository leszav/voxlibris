import { build as viteBuild } from "vite";
import { rm, readFile, cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  await execAsync("npx tsc --project tsconfig.server.json");

  console.log("copying assets...");
  // Assets are already in dist/public after vite build, no need to copy
}

try {
  await buildAll();
} catch (err) {
  console.error(err);
  process.exit(1);
}
