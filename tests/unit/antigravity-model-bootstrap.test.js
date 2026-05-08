import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const { buildAntigravityAvailableModelsResponse } = require("../../src/mitm/antigravityModels.js");

describe("Antigravity MITM model bootstrap", () => {
  it("返回 Antigravity 可用模型列表，供未登录时客户端完成模型加载", () => {
    const payload = buildAntigravityAvailableModelsResponse();

    expect(payload.defaultAgentModelId).toBe("gemini-3.1-pro-high");
    expect(payload.models["gemini-3.1-pro-high"].displayName).toBe("Gemini 3.1 Pro (High)");
    expect(payload.models["claude-sonnet-4-6"].apiProvider).toBe("API_PROVIDER_ANTHROPIC_VERTEX");
    expect(payload.agentModelSorts[0].groups[0].modelIds).toContain("gemini-3.1-pro-high");
  });
});
