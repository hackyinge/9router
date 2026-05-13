import { describe, expect, it } from "vitest";
import { OAUTH_PROVIDERS, THINKING_CONFIG } from "../../src/shared/constants/providers.js";

describe("provider thinking configuration", () => {
  it("exposes all Codex reasoning effort levels for backend configuration", () => {
    expect(OAUTH_PROVIDERS.codex.thinkingConfig).toBe(THINKING_CONFIG.codexEffort);
    expect(THINKING_CONFIG.codexEffort.options).toEqual([
      "auto",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });
});
