import { describe, expect, it } from "vitest";
import { buildThinkingOptions } from "../../src/shared/utils/thinkingOptions.js";

describe("thinking option labels", () => {
  it("labels Codex auto effort as medium", () => {
    expect(buildThinkingOptions({ options: ["auto", "low", "high", "xhigh"] }, "codex")).toEqual([
      { value: "auto", label: "Auto (Medium)" },
      { value: "low", label: "Low" },
      { value: "high", label: "High" },
      { value: "xhigh", label: "XHigh" },
    ]);
  });

  it("keeps OpenAI none effort literal", () => {
    expect(buildThinkingOptions({ options: ["auto", "none"] }, "openai")).toEqual([
      { value: "auto", label: "Auto" },
      { value: "none", label: "None" },
    ]);
  });
});
