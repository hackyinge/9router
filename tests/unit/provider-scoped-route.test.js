import { describe, expect, it } from "vitest";

import {
  normalizeProviderScopedBody,
  providerScopedRequest,
  resolveProviderScope,
  toProviderScopedModelList,
} from "../../src/app/api/v1/providers/providerScopedRouteUtils.js";

describe("provider scoped routes", () => {
  it("resolves provider ids and aliases to the canonical model prefix", () => {
    expect(resolveProviderScope("codex")).toMatchObject({
      providerId: "codex",
      providerAlias: "cx",
    });
    expect(resolveProviderScope("cx")).toMatchObject({
      providerId: "codex",
      providerAlias: "cx",
    });
  });

  it("prefixes unscoped model names with the selected provider", () => {
    expect(normalizeProviderScopedBody("codex", { model: "gpt-5.5" }).body).toEqual({
      model: "cx/gpt-5.5",
    });
  });

  it("keeps matching scoped model names and normalizes their prefix", () => {
    expect(normalizeProviderScopedBody("codex", { model: "codex/gpt-5.5" }).body.model).toBe("cx/gpt-5.5");
    expect(normalizeProviderScopedBody("cx", { model: "cx/gpt-5.5" }).body.model).toBe("cx/gpt-5.5");
  });

  it("rejects model names from a different provider scope", () => {
    const result = normalizeProviderScopedBody("codex", { model: "openai/gpt-5.4" });

    expect(result.error).toContain('Model "openai/gpt-5.4" does not belong to provider "codex"');
  });

  it("returns unprefixed models for one provider scope", () => {
    const result = toProviderScopedModelList("codex", [
      { id: "cx/gpt-5.5", object: "model", owned_by: "cx" },
      { id: "codex/gpt-5.4", object: "model", owned_by: "codex" },
      { id: "openai/gpt-5.4", object: "model", owned_by: "openai" },
    ]);

    expect(result.data).toEqual([
      { id: "gpt-5.5", object: "model", owned_by: "cx", parent: null },
      { id: "gpt-5.4", object: "model", owned_by: "cx", parent: null },
    ]);
  });

  it("preserves NextRequest extensions when forwarding to the existing handlers", async () => {
    const request = new Request("http://localhost/api/v1/providers/codex/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.5" }),
    });
    const cookies = { get: () => ({ value: "token" }) };
    const nextUrl = new URL(request.url);
    Object.defineProperty(request, "cookies", { value: cookies });
    Object.defineProperty(request, "nextUrl", { value: nextUrl });

    const response = await providerScopedRequest(
      request,
      { params: Promise.resolve({ provider: "codex" }) },
      async (forwarded) => Response.json({
        body: await forwarded.json(),
        hasCookies: forwarded.cookies === cookies,
        hasNextUrl: forwarded.nextUrl === nextUrl,
      })
    );

    await expect(response.json()).resolves.toEqual({
      body: { model: "cx/gpt-5.5" },
      hasCookies: true,
      hasNextUrl: true,
    });
  });
});
