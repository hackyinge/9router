import { describe, expect, it, vi } from "vitest";
import { refreshCodexConnections } from "../../src/lib/oauth/codexTokenRefresh.js";

describe("refreshCodexConnections", () => {
  it("refreshes accounts sequentially and persists rotated refresh tokens", async () => {
    const calls = [];
    const updates = [];
    const result = await refreshCodexConnections(
      [
        { id: "a", email: "a@example.com", refreshToken: "old-a" },
        { id: "b", email: "b@example.com", refreshToken: "old-b" },
      ],
      {
        now: () => Date.parse("2026-05-11T00:00:00.000Z"),
        refreshToken: vi.fn(async (refreshToken) => {
          calls.push(refreshToken);
          return {
            accessToken: `access-${refreshToken}`,
            refreshToken: `new-${refreshToken}`,
            expiresIn: 3600,
          };
        }),
        updateConnection: vi.fn(async (id, data) => {
          updates.push({ id, data });
          return true;
        }),
      }
    );

    expect(calls).toEqual(["old-a", "old-b"]);
    expect(result.refreshed).toMatchObject([
      { id: "a", refreshTokenRotated: true, expiresAt: "2026-05-11T01:00:00.000Z" },
      { id: "b", refreshTokenRotated: true, expiresAt: "2026-05-11T01:00:00.000Z" },
    ]);
    expect(updates).toMatchObject([
      { id: "a", data: { accessToken: "access-old-a", refreshToken: "new-old-a", testStatus: "active" } },
      { id: "b", data: { accessToken: "access-old-b", refreshToken: "new-old-b", testStatus: "active" } },
    ]);
  });

  it("marks failed refreshes unavailable without stopping the batch", async () => {
    const updates = [];
    const result = await refreshCodexConnections(
      [
        { id: "ok", email: "ok@example.com", refreshToken: "ok-refresh" },
        { id: "bad", email: "bad@example.com", refreshToken: "bad-refresh" },
        { id: "missing", email: "missing@example.com" },
      ],
      {
        now: () => Date.parse("2026-05-11T00:00:00.000Z"),
        refreshToken: vi.fn(async (refreshToken) => {
          if (refreshToken === "bad-refresh") return { error: "unrecoverable_refresh_error", code: "invalid_grant" };
          return { accessToken: "new-access", refreshToken, expiresIn: 3600 };
        }),
        updateConnection: vi.fn(async (id, data) => {
          updates.push({ id, data });
          return true;
        }),
      }
    );

    expect(result.refreshed).toMatchObject([{ id: "ok" }]);
    expect(result.failed).toMatchObject([{ id: "bad", reason: "invalid_grant" }]);
    expect(result.skipped).toMatchObject([{ id: "missing", reason: "Missing refresh token" }]);
    expect(updates).toMatchObject([
      { id: "ok", data: { testStatus: "active" } },
      { id: "bad", data: { testStatus: "unavailable", lastError: "invalid_grant" } },
    ]);
  });

  it("keeps a fresh cached access token active when Codex reports refresh_token_reused", async () => {
    const updates = [];
    const result = await refreshCodexConnections(
      [
        {
          id: "cached",
          email: "cached@example.com",
          accessToken: [
            Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
            Buffer.from(JSON.stringify({ exp: Date.parse("2026-05-11T00:30:00.000Z") / 1000 })).toString("base64url"),
            "",
          ].join("."),
          refreshToken: "reused-refresh",
          expiresAt: null,
        },
      ],
      {
        now: () => Date.parse("2026-05-11T00:00:00.000Z"),
        refreshToken: vi.fn(async () => ({ error: "unrecoverable_refresh_error", code: "refresh_token_reused" })),
        updateConnection: vi.fn(async (id, data) => {
          updates.push({ id, data });
          return true;
        }),
      }
    );

    expect(result.success).toBe(true);
    expect(result.failed).toEqual([]);
    expect(result.refreshed).toMatchObject([
      { id: "cached", refreshTokenRotated: false, tokenSource: "cached_after_refresh_reuse" },
    ]);
    expect(updates).toMatchObject([
      { id: "cached", data: { testStatus: "active", lastError: null, errorCode: null } },
    ]);
  });
});
