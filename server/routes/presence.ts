import { Router, type Request, type Response } from "express";
import { presenceService } from "../services/presence-service.js";

const router = Router();

/**
 * GET /api/presence/club/:clubId
 * Список userId онлайн-пользователей клуба (Redis TTL + fallback in-memory)
 */
router.get("/club/:clubId", async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;
    const onlineUserIds = await presenceService.getClubOnlineUserIds(clubId);
    return res.json({ success: true, onlineUserIds });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

export default router;
