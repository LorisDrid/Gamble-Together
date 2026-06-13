const TOKEN_KEY = "playerToken";

/**
 * Stable per-device identifier for the "guest-first" persistent profile.
 * Generated once and kept in localStorage — no account, no password.
 */
export function getPlayerToken(): string {
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `g-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}
