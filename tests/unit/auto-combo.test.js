import { describe, expect, it } from "vitest";

import {
  buildAutoComboModelsFromConnections,
  parseAutoPrefix,
} from "../../open-sse/services/autoCombo.js";

describe("auto combo routing", () => {
  it("parses OmniRoute-style auto model prefixes", () => {
    expect(parseAutoPrefix("auto")).toEqual({ valid: true, isAuto: true, variant: null });
    expect(parseAutoPrefix("auto/coding")).toEqual({ valid: true, isAuto: true, variant: "coding" });
    expect(parseAutoPrefix("auto/")).toEqual({ valid: true, isAuto: true, variant: null });
    expect(parseAutoPrefix("auto/offline")).toEqual({
      valid: false,
      isAuto: true,
      error: "Invalid auto variant: offline",
    });
    expect(parseAutoPrefix("autocoding")).toEqual({
      valid: false,
      isAuto: true,
      error: "Invalid auto prefix format",
    });
    expect(parseAutoPrefix("openai/gpt-5.5").isAuto).toBe(false);
  });

  it("builds a fallback list from active provider connections", () => {
    const models = buildAutoComboModelsFromConnections([
      { id: "openai-1", provider: "openai", isActive: true, priority: 2, testStatus: "active" },
      { id: "codex-1", provider: "codex", isActive: true, priority: 1, testStatus: "active" },
      { id: "anthropic-1", provider: "anthropic", isActive: false, priority: 1, testStatus: "active" },
    ]);

    expect(models).toContain("codex/gpt-5.5");
    expect(models).toContain("openai/gpt-5.4");
    expect(models).not.toContain("anthropic/claude-opus-4-7");
  });

  it("skips unavailable and model-locked accounts", () => {
    const models = buildAutoComboModelsFromConnections([
      { id: "codex-1", provider: "codex", isActive: true, priority: 1, testStatus: "unavailable" },
      {
        id: "openai-1",
        provider: "openai",
        isActive: true,
        priority: 2,
        testStatus: "active",
        "modelLock_gpt-5.4": new Date(Date.now() + 60_000).toISOString(),
      },
      { id: "github-1", provider: "github", isActive: true, priority: 3, testStatus: "active" },
    ]);

    expect(models).toEqual(["github/gpt-3.5-turbo"]);
  });

  it("filters variants without requiring DB state and skips no-auth connections", () => {
    const connections = [
      { id: "codex-1", provider: "codex", isActive: true, priority: 1, testStatus: "active" },
      { id: "openai-1", provider: "openai", isActive: true, priority: 2, testStatus: "active" },
      { id: "opencode-free", provider: "opencode", isActive: true, priority: 4, testStatus: "active", authType: "none" },
    ];

    expect(buildAutoComboModelsFromConnections(connections, { variant: "coding" })).toContain("codex/gpt-5.5");
    expect(buildAutoComboModelsFromConnections(connections)).not.toContain("opencode/deepseek-v4-flash-free");
    expect(buildAutoComboModelsFromConnections(connections, { variant: "fast" })).toContain("openai/gpt-5.4-mini");
  });

  it("prioritizes coding OAuth candidates for default and last-known-good routes", () => {
    const connections = [
      { id: "alicode-1", provider: "alicode", isActive: true, priority: 1, testStatus: "active" },
      { id: "codex-1", provider: "codex", isActive: true, priority: 1, testStatus: "active", authType: "oauth" },
      { id: "siliconflow-1", provider: "siliconflow", isActive: true, priority: 2, testStatus: "active" },
    ];

    expect(buildAutoComboModelsFromConnections(connections)[0]).toBe("codex/gpt-5.5");
    expect(buildAutoComboModelsFromConnections(connections, { variant: "lkgp" })[0]).toBe("codex/gpt-5.5");
  });
});
