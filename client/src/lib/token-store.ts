/**
 * In-memory token storage for XSS protection.
 * 
 * Production security: Tokens are stored ONLY in JavaScript memory, NOT in
 * localStorage or sessionStorage. This prevents XSS attacks from stealing tokens.
 * 
 * On page refresh, the session is restored via httpOnly refresh cookie
 * (POST /api/auth/refresh). The server also sets accessToken as an httpOnly
 * cookie for automatic transport in all requests.
 * 
 * This module is the SINGLE SOURCE OF TRUTH for client-side token state.
 */

let accessToken: string | null = null;

/**
 * Get the current access token from memory.
 * Returns null if no token is available (user not logged in or page refreshed).
 */
export function getAccessToken(): string | null {
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
