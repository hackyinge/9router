import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const { MODEL_SYNONYMS } = require("../../src/mitm/config.js");

describe("Antigravity MITM default aliases", () => {
  it("内置默认别名覆盖可用模型列表中的 agent 模型", () => {
    expect(MODEL_SYNONYMS.antigravity["gemini-3-flash-agent"]).toBe("gemini-3-flash");
    expect(MODEL_SYNONYMS.antigravity["gemini-3.1-flash-lite"]).toBe("gemini-3-flash");
    expect(MODEL_SYNONYMS.antigravity.__defaults["gemini-3.1-pro-high"]).toBe("gemini-3.1-pro-high");
    expect(MODEL_SYNONYMS.antigravity.__defaults["gemini-3-flash-agent"]).toBe("cx/gpt-5.5");
    expect(MODEL_SYNONYMS.antigravity.__defaults["gemini-3-flash"]).toBe("cx/gpt-5.5");
    expect(MODEL_SYNONYMS.antigravity.__defaults["claude-sonnet-4-6"]).toBe("claude-sonnet-4-6");
  });
});
