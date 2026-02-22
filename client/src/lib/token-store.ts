/**
 * In-memory token storage for client-side access.
 * 
 * Security model:
 * - accessToken: stored in non-httpOnly cookie (JavaScript accessible) for
 *   WebSocket connections and client-side auth checks
 * - refreshToken: stored in httpOnly cookie (server-only) for maximum security
 * 
 * Token sync:
 * - On page load, token is synced from cookie to memory
 * - On login/register/refresh, token is set by server and synced to memory
 * 
 * This module is the SINGLE SOURCE OF TRUTH for client-side token state.
 */

let accessToken: string | null = null;
let isSyncing = false;

// Impersonation state
let impersonatedUsername: string | null = null;
let originalAdminToken: string | null = null;

/**
 * Read a cookie value by name
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    const cookieValue = parts.pop()?.split(';').shift();
    return cookieValue || null;
  }
  return null;
}

/**
 * Sync token from cookie to memory.
 * Called on page load and after auth operations.
 * Protected against race conditions.
 */
export function syncTokenFromCookie(): void {
  // Защита от одновременных вызовов
  if (isSyncing) {
    return;
  }
  
  isSyncing = true;
  try {
    const tokenFromCookie = getCookie('accessToken');
    if (tokenFromCookie && tokenFromCookie !== 'null') {
      accessToken = tokenFromCookie;
    } else {
      accessToken = null;
    }
  } finally {
    isSyncing = false;
  }
}

// Sync token on module load
syncTokenFromCookie();

/**
 * Get the current access token from memory.
 * Returns null if no token is available (user not logged in).
 */
export function getAccessToken(): string | null {
  // Возвращаем токен из памяти напрямую, без повторной синхронизации
  // Синхронизация происходит только при загрузке модуля и после auth операций
  return accessToken;
}

/**
 * Set the access token in memory.
 * Called after login, register, or token refresh.
 * Pass null to clear (on logout or auth failure).
 */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Check if a JWT token is expired by decoding its payload.
 */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const currentTime = Math.floor(Date.now() / 1000);
    return payload.exp < currentTime;
  } catch {
    return true;
  }
}

/**
 * Decode user info from a JWT token without verification.
 * Used for UI display only — actual auth is handled by httpOnly cookies.
 */
export function getUserFromToken(token: string): { userId: string; username: string; role: string } | null {
  try {
    if (isTokenExpired(token)) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      userId: payload.userId,
      username: payload.username,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

/**
 * Start impersonation mode - save original admin token and set new user token.
 */
export function startImpersonation(
  newUserToken: string,
  username: string
): void {
  // Save current token as admin token
  originalAdminToken = accessToken;
  impersonatedUsername = username;
  accessToken = newUserToken;
}

/**
 * Check if currently in impersonation mode.
 */
export function isImpersonating(): boolean {
  return originalAdminToken !== null;
}

/**
 * Get the impersonated username.
 */
export function getImpersonatedUsername(): string | null {
  return impersonatedUsername;
}

/**
 * Exit impersonation mode - restore original admin token.
 */
export function exitImpersonation(): string | null {
  if (!originalAdminToken) {
    return null;
  }
  
  const adminToken = originalAdminToken;
  accessToken = adminToken;
  originalAdminToken = null;
  impersonatedUsername = null;
  
  return adminToken;
}

/**
 * Clear impersonation state (on logout).
 */
export function clearImpersonation(): void {
  originalAdminToken = null;
  impersonatedUsername = null;
}
