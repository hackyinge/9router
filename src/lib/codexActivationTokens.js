export const CODEX_ACTIVATION_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export class CodexTokenRefreshError extends Error {
  constructor(message, { code = null, status = null, details = null } = {}) {
    super(message);
    this.name = "CodexTokenRefreshError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function hasCompleteCodexTokenSnapshot(connection) {
  return !!(connection?.accessToken && connection?.refreshToken);
}

export function buildCodexChatGptAuthData(existingAuthData = {}, tokens, now = new Date()) {
  return {
    ...(existingAuthData && typeof existingAuthData === "object" ? existingAuthData : {}),
    auth_mode: "chatgpt",
    OPENAI_API_KEY: null,
    tokens,
    last_refresh: now.toISOString(),
  };
}

function decodeJwtExpirationMs(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return Number.isFinite(decoded?.exp) ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function getCodexTokenSnapshotExpirationMs(connection) {
  const expirations = [
    Date.parse(connection?.expiresAt || ""),
    decodeJwtExpirationMs(connection?.accessToken),
    decodeJwtExpirationMs(connection?.idToken),
  ].filter((value) => Number.isFinite(value) && value > 0);

  return expirations.length ? Math.min(...expirations) : null;
}

export function isCodexTokenSnapshotFresh(
  connection,
  { now = Date.now(), bufferMs = CODEX_ACTIVATION_REFRESH_BUFFER_MS } = {},
) {
  if (!hasCompleteCodexTokenSnapshot(connection)) return false;
  const expiresAt = getCodexTokenSnapshotExpirationMs(connection);
  return Number.isFinite(expiresAt) && expiresAt > now + bufferMs;
}

export function isRefreshTokenReuseError(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message : "";
  return code === "refresh_token_reused" || /refresh_token_reused|already been used/i.test(message);
}

export async function readCodexTokenRefreshError(response) {
  const text = await response.text().catch(() => "");
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  const payload = parsed?.error && typeof parsed.error === "object" ? parsed.error : parsed;
  const code = typeof payload?.code === "string" ? payload.code : null;
  const upstreamMessage = typeof payload?.message === "string" ? payload.message : null;
  const message = code === "refresh_token_reused"
    ? "Codex refresh token has already been used. Re-import or sign in again if this account has no cached token snapshot."
    : `Failed to refresh Codex account before activation${code ? ` (${code})` : ""}: ${upstreamMessage || response.statusText || "unknown error"}`;

  return new CodexTokenRefreshError(message, {
    code,
    status: response.status,
    details: parsed || text || null,
  });
}

export async function ensureCodexActivationTokens(
  connection,
  {
    refreshTokens,
    now = Date.now(),
    bufferMs = CODEX_ACTIVATION_REFRESH_BUFFER_MS,
  } = {},
) {
  if (isCodexTokenSnapshotFresh(connection, { now, bufferMs })) {
    return { connection, tokenSource: "cached" };
  }

  try {
    const refreshed = await refreshTokens(connection);
    return { connection: refreshed, tokenSource: "refreshed" };
  } catch (error) {
    if (isRefreshTokenReuseError(error) && hasCompleteCodexTokenSnapshot(connection)) {
      return {
        connection,
        tokenSource: "cached_after_refresh_reuse",
        tokenWarning: "Refresh token was already used; applied the cached Codex access token snapshot. Re-import this account if Codex asks for login.",
      };
    }
    throw error;
  }
}
