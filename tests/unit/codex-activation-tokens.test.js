import { describe, expect, it, vi } from "vitest";
import {
  ensureCodexActivationTokens,
  getCodexTokenSnapshotExpirationMs,
  isCodexTokenSnapshotFresh,
  isRefreshTokenReuseError,
  readCodexTokenRefreshError,
} from "../../src/lib/codexActivationTokens.js";

function unsignedJwt(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "",
  ].join(".");
}

const futureConnection = {
  id: "codex-1",
  accessToken: "access",
  idToken: "id",
  refreshToken: "refresh",
  expiresAt: "2026-05-14T10:10:00.000Z",
};

describe("codex activation token selection", () => {
  it("uses a fresh local token snapshot without refreshing", async () => {
    const refreshTokens = vi.fn();
    const result = await ensureCodexActivationTokens(futureConnection, {
      now: Date.parse("2026-05-14T10:00:00.000Z"),
      refreshTokens,
    });

    expect(result.tokenSource).toBe("cached");
    expect(result.connection).toBe(futureConnection);
    expect(refreshTokens).not.toHaveBeenCalled();
  });

  it("refreshes when the local token snapshot is missing or expired", async () => {
    const expired = { ...futureConnection, expiresAt: "2026-05-14T09:00:00.000Z" };
    const refreshed = { ...expired, accessToken: "new-access", expiresAt: "2026-05-14T11:00:00.000Z" };
    const refreshTokens = vi.fn(async () => refreshed);
    const result = await ensureCodexActivationTokens(expired, {
      now: Date.parse("2026-05-14T10:00:00.000Z"),
      refreshTokens,
    });

    expect(result.tokenSource).toBe("refreshed");
    expect(result.connection).toBe(refreshed);
  });

  it("falls back to cached tokens when refresh_token_reused is returned", async () => {
    const expired = { ...futureConnection, expiresAt: "2026-05-14T09:00:00.000Z" };
    const error = new Error("Your refresh token has already been used to generate a new access token.");
    error.code = "refresh_token_reused";
    const result = await ensureCodexActivationTokens(expired, {
      now: Date.parse("2026-05-14T10:00:00.000Z"),
      refreshTokens: vi.fn(async () => {
        throw error;
      }),
    });

    expect(result.tokenSource).toBe("cached_after_refresh_reuse");
    expect(result.connection).toBe(expired);
    expect(result.tokenWarning).toMatch(/cached Codex token snapshot/);
  });

  it("does not hide refresh_token_reused when no id_token/access_token snapshot exists", async () => {
    const error = new Error("refresh_token_reused");
    error.code = "refresh_token_reused";
    await expect(ensureCodexActivationTokens(
      { id: "codex-1", refreshToken: "refresh" },
      {
        refreshTokens: vi.fn(async () => {
          throw error;
        }),
      },
    )).rejects.toThrow("refresh_token_reused");
  });

  it("recognizes refresh token reuse errors from code or message", () => {
    expect(isRefreshTokenReuseError({ code: "refresh_token_reused" })).toBe(true);
    expect(isRefreshTokenReuseError(new Error("Your refresh token has already been used"))).toBe(true);
    expect(isRefreshTokenReuseError(new Error("invalid_grant"))).toBe(false);
  });

  it("requires a parseable future expiry for fresh cached snapshots", () => {
    expect(isCodexTokenSnapshotFresh(futureConnection, {
      now: Date.parse("2026-05-14T10:00:00.000Z"),
      bufferMs: 60_000,
    })).toBe(true);
    expect(isCodexTokenSnapshotFresh({ ...futureConnection, expiresAt: "bad" })).toBe(false);
  });

  it("uses JWT exp when imported accounts have a stale placeholder expiresAt", () => {
    const connection = {
      ...futureConnection,
      accessToken: unsignedJwt({ exp: Date.parse("2026-05-14T10:20:00.000Z") / 1000 }),
      idToken: unsignedJwt({ exp: Date.parse("2026-05-14T10:30:00.000Z") / 1000 }),
      expiresAt: "1970-01-01T00:00:00.000Z",
    };

    expect(getCodexTokenSnapshotExpirationMs(connection)).toBe(Date.parse("2026-05-14T10:20:00.000Z"));
    expect(isCodexTokenSnapshotFresh(connection, {
      now: Date.parse("2026-05-14T10:00:00.000Z"),
      bufferMs: 60_000,
    })).toBe(true);
  });

  it("normalizes OAuth refresh errors without leaking raw JSON as the user message", async () => {
    const response = {
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => JSON.stringify({
        error: {
          message: "Your refresh token has already been used to generate a new access token.",
          code: "refresh_token_reused",
        },
      }),
    };
    const error = await readCodexTokenRefreshError(response);

    expect(error.code).toBe("refresh_token_reused");
    expect(error.message).toBe("Codex refresh token has already been used. Re-import or sign in again if this account has no cached token snapshot.");
    expect(error.message).not.toContain("{");
  });
});
