import { ApiError } from "@/lib/queryClient";

const UPGRADE_CODES = new Set(["LIMIT_EXCEEDED", "MISSING_ENTITLEMENT"]);

export function isUpgradeError(error: unknown) {
  return error instanceof ApiError && Boolean(error.upgradeUrl || UPGRADE_CODES.has(error.code ?? ""));
}

export function upgradeDescription(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  return `${error.message}. Откройте раздел «Тарифы», чтобы выбрать подходящий план.`;
}

export function upgradeUrl(error: unknown) {
  return error instanceof ApiError && error.upgradeUrl ? error.upgradeUrl : "/pricing";
}
