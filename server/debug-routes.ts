import { Router } from "express";
import { appendFileSync } from "node:fs";
import { join } from "node:path";

const router = Router();

// Simple debug logging endpoint
router.post("/log", (req, res) => {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: req.body.type || 'unknown',
      data: req.body.data || {}
    };
    
    const logPath = join(process.cwd(), '.tmp', 'frontend-debug.log');
    appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
    
    res.status(200).json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to log' });
  }
});

export default router;
