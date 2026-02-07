import { build as viteBuild } from "vite";
import { cp, rm } from "node:fs/promises";
import { dirname } from "node:path";
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
  await cp("email-templates", "dist/email-templates", { recursive: true });
}

try {
  await buildAll();
} catch (err) {
  console.error(err);
  process.exit(1);
}
