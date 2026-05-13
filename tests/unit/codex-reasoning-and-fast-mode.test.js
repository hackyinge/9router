import { describe, expect, it } from "vitest";
import { CodexExecutor } from "../../open-sse/executors/codex.js";
import { applyProviderThinkingOverrides } from "../../open-sse/handlers/chatCore/providerOverrides.js";

describe("Codex reasoning defaults and Fast mode", () => {
  it("defaults Codex auto reasoning to medium", () => {
    const executor = new CodexExecutor();
    const body = executor.transformRequest("gpt-5.3-codex", {
      input: "hello",
    });

    expect(body.reasoning).toEqual({ effort: "medium", summary: "auto" });
    expect(body.include).toEqual(["reasoning.encrypted_content"]);
  });

  it("applies Fast mode as a service tier without lowering reasoning effort", () => {
    const body = applyProviderThinkingOverrides(
      { input: "hello" },
      "codex",
      { mode: "auto", fastMode: true },
    );

    expect(body.service_tier).toBe("priority");
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("combines explicit reasoning effort with Fast service tier", () => {
    const body = applyProviderThinkingOverrides(
      { input: "hello" },
      "codex",
      { mode: "high", fastMode: true },
    );

    expect(body.service_tier).toBe("priority");
    expect(body.reasoning_effort).toBe("high");
  });
});
