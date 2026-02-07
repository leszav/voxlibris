// Re-export db for direct database access.
// Uses the shared singleton connection from BaseRepository.
import { getDbConnection } from "./repositories/BaseRepository.js";

export const db = getDbConnection();

// Re-export commonly used Drizzle functions
export { eq, and, or, desc, asc, sql } from "drizzle-orm";
