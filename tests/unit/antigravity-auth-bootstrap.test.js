import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const {
  LOCAL_ANTIGRAVITY_PROJECT,
  createLocalAntigravityLoadCodeAssistPayload,
  createLocalAntigravityOnboardUserPayload,
} = require("../../src/mitm/antigravityBootstrap.js");

describe("Antigravity local auth bootstrap", () => {
  it("returns a loadCodeAssist payload compatible with fresh isolated profiles", () => {
    const payload = createLocalAntigravityLoadCodeAssistPayload();

    expect(payload.cloudaicompanionProject).toBe(LOCAL_ANTIGRAVITY_PROJECT);
    expect(payload.currentTier.userDefinedCloudaicompanionProject).toBe(true);
    expect(payload.currentTier.usesGcpTos).toBe(true);
    expect(payload.allowedTiers[0].isDefault).toBe(true);
    expect(payload.gcpManaged).toBe(false);
  });

  it("exposes the onboard project at every shape Antigravity checks", () => {
    const payload = createLocalAntigravityOnboardUserPayload();

    expect(payload.done).toBe(true);
    expect(payload.cloudaicompanionProject).toBe(LOCAL_ANTIGRAVITY_PROJECT);
    expect(payload.response.cloudaicompanionProject).toBe(LOCAL_ANTIGRAVITY_PROJECT);
    expect(payload.response.currentTier.userDefinedCloudaicompanionProject).toBe(true);
  });
});
