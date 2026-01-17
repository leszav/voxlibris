// Re-export db from storage for direct database access
// This is needed for advanced queries not covered by storage methods
import { storage } from "./storage";

// Type assertion to access db property
export const db = (storage as any).db;

// Re-export commonly used Drizzle functions
export { eq, and, or, desc, asc, sql } from "drizzle-orm";
