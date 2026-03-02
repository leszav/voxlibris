/**
 * Admin Feature Flags API
 * Управление feature flags через админку
 */

import { Router } from "express";
import { jwtAuth, requireAdmin } from "./jwt-middleware.js";
import { getFeatureFlag, setFeatureFlag, loadFeatureFlags } from "./lib/feature-flags.js";

const router = Router();

/**
 * GET /api/v1/admin/features
 * Получить список всех feature flags
 */
router.get("/features", jwtAuth, requireAdmin, async (req, res) => {
	try {
		// Reload flags from DB to get latest values
		await loadFeatureFlags();
		
		const guestEnabled = await getFeatureFlag("guest.access.enabled", false);
		
		res.json({
			features: {
				"guest.access.enabled": guestEnabled
			}
		});
	} catch (error) {
		console.error("Error fetching features:", error);
		res.status(500).json({ message: "Internal server error" });
	}
});

/**
 * PUT /api/v1/admin/features/guest-access
 * Включить/выключить гостевой доступ
 */
router.put("/features/guest-access", jwtAuth, requireAdmin, async (req, res) => {
	try {
		const { enabled } = req.body;
		
		if (typeof enabled !== "boolean") {
			return res.status(400).json({ message: "enabled must be a boolean" });
		}

		await setFeatureFlag("guest.access.enabled", enabled);

		res.json({
			success: true,
			feature: "guest.access.enabled",
			enabled
		});
	} catch (error) {
		console.error("Error updating guest access:", error);
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
