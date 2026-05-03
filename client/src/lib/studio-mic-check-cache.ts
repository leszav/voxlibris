const MIC_CHECK_STORAGE_KEY = 'mic_check_passed';
const MIC_CHECK_TTL_MS = 10 * 60 * 1000;

export function markStudioMicCheckPassed(nowMs: number = Date.now()): void {
  sessionStorage.setItem(MIC_CHECK_STORAGE_KEY, nowMs.toString());
}

export function clearStudioMicCheckPassed(): void {
  sessionStorage.removeItem(MIC_CHECK_STORAGE_KEY);
}

export function hasRecentStudioMicCheck(nowMs: number = Date.now()): boolean {
  const cached = sessionStorage.getItem(MIC_CHECK_STORAGE_KEY);
  if (!cached) return false;

  const ts = Number.parseInt(cached, 10);
  if (Number.isNaN(ts)) return false;

  return nowMs - ts < MIC_CHECK_TTL_MS;
}
