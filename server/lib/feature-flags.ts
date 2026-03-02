/**
 * Feature Flags Manager
 * Загружает feature flags из БД при старте и предоставляет кэшированный доступ
 * Использует чистые SQL запросы (схема может отсутствовать в TypeScript)
 */

import { db, sql } from "../db.js";
import { logger } from "./logger.js";

// In-memory cache for feature flags
const featureFlagsCache = new Map<string, { value: string; timestamp: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute TTL

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SettingsRow = Record<string, any>;

/**
 * Load all feature flags from database
 */
export async function loadFeatureFlags(): Promise<void> {
	try {
		const result = await db.execute(
			sql`SELECT key, value, category FROM settings WHERE category = 'features'`
		) as unknown as SettingsRow[];

		for (const row of result) {
			featureFlagsCache.set(row.key, {
				value: row.value,
				timestamp: Date.now(),
			});
		}

		logger.info({ count: result.length }, "Feature flags loaded from database");
	} catch (error) {
		logger.error({ error }, "Failed to load feature flags");
	}
}

/**
 * Get feature flag value (with caching)
 */
export async function getFeatureFlag(key: string, defaultValue: boolean = false): Promise<boolean> {
	const cached = featureFlagsCache.get(key);

	// Return cached value if still valid
	if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
		return cached.value === "true";
	}

	// Fetch from database
	try {
		const result = await db.execute(
			sql`SELECT key, value FROM settings WHERE key = ${key}`
		) as unknown as SettingsRow[];

		if (result && result.length > 0) {
			featureFlagsCache.set(key, {
				value: result[0].value,
				timestamp: Date.now(),
			});
			return result[0].value === "true";
		}
	} catch (error) {
		logger.error({ error, key }, "Failed to get feature flag");
	}

	return defaultValue;
}

/**
 * Get feature flag synchronously (after initial load)
 * Используется после загрузки флагов при старте
 */
export function getFeatureFlagSync(key: string, defaultValue: boolean = false): boolean {
	const cached = featureFlagsCache.get(key);
	if (cached) {
		return cached.value === "true";
	}
	return defaultValue;
}

/**
 * Set feature flag value (invalidates cache)
 */
export async function setFeatureFlag(key: string, value: boolean): Promise<void> {
	try {
		await db.execute(
			sql`UPDATE settings SET value = ${value.toString()} WHERE key = ${key}`
		);

		// Invalidate cache
		featureFlagsCache.delete(key);

		logger.info({ key, value }, "Feature flag updated");
	} catch (error) {
		logger.error({ error, key, value }, "Failed to set feature flag");
		throw error;
	}
}

/**
 * Check if guest access is enabled (async)
 */
export async function isGuestAccessEnabled(): Promise<boolean> {
	return getFeatureFlag("guest.access.enabled", false);
}

/**
 * Check if guest access is enabled (sync, after load)
 */
export function isGuestAccessEnabledSync(): boolean {
	return getFeatureFlagSync("guest.access.enabled", false);
}
