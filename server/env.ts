/**
 * Environment Variables Loader
 * 
 * This module MUST be loaded before any other application code.
 * Use Node.js --import flag to ensure proper initialization order.
 * 
 * In development: loads .env file using dotenv
 * In production: expects env vars to be set by the system (Docker, K8s, etc.)
 */

import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const envPath = join(rootDir, ".env");

// Load .env file only if it exists (development mode)
// In production, env vars should be provided by the deployment environment
if (existsSync(envPath)) {
  console.log("[ENV] Loading environment from .env file");
  dotenv.config({ path: envPath });
} else {
  console.log("[ENV] No .env file found, using system environment variables");
}

// Verify critical environment variables are present
const requiredEnvVars = [
  "DATABASE_URL",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "SESSION_SECRET",
];

const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  console.error("[ENV] ERROR: Missing required environment variables:");
  missingVars.forEach((varName) => console.error(`  - ${varName}`));
  console.error("\nIn development: Create .env file from .env.example");
  console.error("In production: Set these variables in your deployment environment");
  process.exit(1);
}

console.log("[ENV] Environment variables loaded successfully");
