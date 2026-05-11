import { describe, expect, it } from "vitest";
import {
  DEFAULT_VISIBLE_MITM_TOOL_IDS,
  createDefaultMitmToolVisibility,
  normalizeMitmToolVisibility,
} from "../../src/app/(dashboard)/dashboard/focus-ui/providerVisibility.js";

describe("Focus UI MITM provider visibility", () => {
  const toolIds = ["antigravity", "copilot", "kiro", "openrouter"];

  it("shows only Antigravity by default", () => {
    expect(DEFAULT_VISIBLE_MITM_TOOL_IDS).toEqual(["antigravity"]);
    expect(createDefaultMitmToolVisibility(toolIds)).toEqual({
      antigravity: true,
      copilot: false,
      kiro: false,
      openrouter: false,
    });
  });

  it("normalizes saved visibility and keeps unknown tools hidden", () => {
    expect(normalizeMitmToolVisibility(toolIds, { copilot: true, missing: true })).toEqual({
      antigravity: false,
      copilot: true,
      kiro: false,
      openrouter: false,
    });
  });
});
