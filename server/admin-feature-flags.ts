/**
 * Admin Feature Flags API
 * Управление feature flags через админку
 */

import { Router } from "express";
import { jwtAuth, requireAdmin } from "./jwt-middleware.js";
import { getFeatureFlag, setFeatureFlag, loadFeatureFlags } from "./lib/feature-flags.js";

const router = Router();
const FEATURE_GUEST_ACCESS = "guest.access.enabled";
const FEATURE_LANDING_READER_CLUBS = "landing.readerClubs.enabled";
const FEATURE_LANDING_TOP_READERS = "landing.topReaders.enabled";

/**
 * GET /api/v1/admin/features
 * Получить список всех feature flags
 */
router.get("/features", jwtAuth, requireAdmin, async (req, res) => {
	try {
		// Reload flags from DB to get latest values
		await loadFeatureFlags();
		
		const guestEnabled = await getFeatureFlag(FEATURE_GUEST_ACCESS, false);
		const landingReaderClubsEnabled = await getFeatureFlag(FEATURE_LANDING_READER_CLUBS, false);
		const landingTopReadersEnabled = await getFeatureFlag(FEATURE_LANDING_TOP_READERS, false);
		
		res.json({
			features: {
				[FEATURE_GUEST_ACCESS]: guestEnabled,
				[FEATURE_LANDING_READER_CLUBS]: landingReaderClubsEnabled,
				[FEATURE_LANDING_TOP_READERS]: landingTopReadersEnabled,
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

		await setFeatureFlag(FEATURE_GUEST_ACCESS, enabled);

		res.json({
			success: true,
			feature: FEATURE_GUEST_ACCESS,
			enabled
		});
	} catch (error) {
		console.error("Error updating guest access:", error);
		res.status(500).json({ message: "Internal server error" });
	}
});

/**
 * PUT /api/v1/admin/features/landing-reader-clubs
 * Включить/выключить секцию клубов чтецов на лендинге
 */
router.put("/features/landing-reader-clubs", jwtAuth, requireAdmin, async (req, res) => {
	try {
		const { enabled } = req.body;
		
		if (typeof enabled !== "boolean") {
			return res.status(400).json({ message: "enabled must be a boolean" });
		}

		await setFeatureFlag(FEATURE_LANDING_READER_CLUBS, enabled);

		res.json({
			success: true,
			feature: FEATURE_LANDING_READER_CLUBS,
			enabled
		});
	} catch (error) {
		console.error("Error updating landing reader clubs feature:", error);
		res.status(500).json({ message: "Internal server error" });
	}
});

/**
 * PUT /api/v1/admin/features/landing-top-readers
 * Включить/выключить секцию рейтинга чтецов на лендинге
 */
router.put("/features/landing-top-readers", jwtAuth, requireAdmin, async (req, res) => {
	try {
		const { enabled } = req.body;
		
		if (typeof enabled !== "boolean") {
			return res.status(400).json({ message: "enabled must be a boolean" });
		}

		await setFeatureFlag(FEATURE_LANDING_TOP_READERS, enabled);

		res.json({
			success: true,
			feature: FEATURE_LANDING_TOP_READERS,
			enabled
		});
	} catch (error) {
		console.error("Error updating landing top readers feature:", error);
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
