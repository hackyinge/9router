import { describe, expect, it } from "vitest";
import { collectCodexImportRecords } from "../../src/lib/oauth/codexImport.js";

function jwt(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload))
    .toString("base64url");
  return `header.${encodedPayload}.signature`;
}

describe("Codex account JSON import", () => {
  it("normalizes existing ChatGPT session JSON", () => {
    const result = collectCodexImportRecords({
      filename: "session.json",
      data: {
        accessToken: "session-access",
        sessionToken: "session-refresh",
        expires: "2026-06-01T00:00:00.000Z",
        user: { email: "codex@example.com", name: "Codex User" },
        account: { id: "acc_session", planType: "plus" },
      },
    });

    expect(result.skipped).toEqual([]);
    expect(result.records).toMatchObject([
      {
        sourceFormat: "codex_session",
        accessToken: "session-access",
        refreshToken: "session-refresh",
        expiresAt: "2026-06-01T00:00:00.000Z",
        email: "codex@example.com",
        displayName: "Codex User",
        providerSpecificData: {
          chatgptAccountId: "acc_session",
          chatgptPlanType: "plus",
          authMethod: "imported_codex_session",
          sourceFilename: "session.json",
        },
      },
    ]);
  });

  it("detects CLI Proxy API Codex auth JSON and skips non-Codex auth files", () => {
    const idToken = jwt({
      email: "cpa@example.com",
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acc_cpa",
        chatgpt_plan_type: "pro",
      },
    });

    const result = collectCodexImportRecords([
      {
        filename: "codex-cpa.json",
        data: {
          type: "codex",
          access_token: "cpa-access",
          refresh_token: "cpa-refresh",
          id_token: idToken,
          expired: "2026-06-02T00:00:00.000Z",
          priority: 3,
        },
      },
      {
        filename: "gemini.json",
        data: {
          type: "gemini",
          access_token: "gemini-access",
          refresh_token: "gemini-refresh",
        },
      },
    ]);

    expect(result.records).toMatchObject([
      {
        sourceFormat: "cli_proxy_api_auth",
        accessToken: "cpa-access",
        refreshToken: "cpa-refresh",
        expiresAt: "2026-06-02T00:00:00.000Z",
        email: "cpa@example.com",
        priority: 3,
        providerSpecificData: {
          chatgptAccountId: "acc_cpa",
          chatgptPlanType: "pro",
          authMethod: "imported_cli_proxy_api_auth",
        },
      },
    ]);
    expect(result.skipped).toEqual([
      { filename: "gemini.json", reason: "No supported Codex credentials found" },
    ]);
  });

  it("marks imports without expiry for immediate proactive refresh", () => {
    const result = collectCodexImportRecords({
      filename: "codex-no-expiry.json",
      data: {
        type: "codex",
        access_token: "short-lived-access",
        refresh_token: "refresh-token",
      },
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0].expiresAt).toBe("1970-01-01T00:00:00.000Z");
  });

  it("detects Sub2API account packages and normalizes nested credentials", () => {
    const result = collectCodexImportRecords({
      filename: "sub2api.json",
      data: {
        accounts: [
          {
            name: "Work Codex",
            platform: "openai",
            account_type: "oauth",
            priority: 9,
            credentials: {
              access_token: "sub-access",
              refresh_token: "sub-refresh",
              email: "sub@example.com",
              expires_at: "1770000000",
              chatgpt_account_id: "acc_sub",
              plan_type: "team",
            },
          },
        ],
      },
    });

    expect(result.skipped).toEqual([]);
    expect(result.records).toMatchObject([
      {
        sourceFormat: "sub2api",
        name: "Work Codex",
        accessToken: "sub-access",
        refreshToken: "sub-refresh",
        expiresAt: "2026-02-02T02:40:00.000Z",
        email: "sub@example.com",
        priority: 9,
        providerSpecificData: {
          chatgptAccountId: "acc_sub",
          chatgptPlanType: "team",
          authMethod: "imported_sub2api",
          sourceFilename: "sub2api.json",
        },
      },
    ]);
  });
});
