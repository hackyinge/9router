import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  filterConnectionsForSubUser,
  isConnectionAllowedForSubUser,
} from "../../src/lib/subUserAccess.js";

const connections = [
  { id: "openai-a", provider: "openai", name: "OpenAI A" },
  { id: "openai-b", provider: "openai", name: "OpenAI B" },
  { id: "codex-a", provider: "codex", name: "Codex A" },
];

describe("sub-user account access", () => {
  const originalDataDir = process.env.DATA_DIR;
  let tempDir = null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openrouterx-sub-user-access-"));
    process.env.DATA_DIR = tempDir;
  });

  afterEach(() => {
    vi.resetModules();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
  });

  it("filters provider connections down to explicitly allowed account IDs", () => {
    const context = {
      role: "sub_user",
      allowedProviders: ["openai", "codex"],
      allowedProviderConnectionIds: ["openai-b"],
    };

    expect(filterConnectionsForSubUser(connections, context)).toEqual([
      connections[1],
    ]);
    expect(isConnectionAllowedForSubUser(context, connections[0])).toBe(false);
    expect(isConnectionAllowedForSubUser(context, connections[1])).toBe(true);
    expect(isConnectionAllowedForSubUser(context, connections[2])).toBe(false);
  });

  it("keeps legacy provider-only users unrestricted within allowed providers", () => {
    const context = {
      role: "sub_user",
      allowedProviders: ["openai"],
      allowedProviderConnectionIds: null,
    };

    expect(filterConnectionsForSubUser(connections, context)).toEqual([
      connections[0],
      connections[1],
    ]);
  });

  it("selects credentials only from allowed account IDs", async () => {
    vi.resetModules();
    const { createProviderConnection } = await import("../../src/lib/localDb.js");
    const { getProviderCredentials } = await import("../../src/sse/services/auth.js");

    const first = await createProviderConnection({
      provider: "openai",
      authType: "apikey",
      name: "OpenAI A",
      apiKey: "key-a",
      priority: 1,
      isActive: true,
    });
    const second = await createProviderConnection({
      provider: "openai",
      authType: "apikey",
      name: "OpenAI B",
      apiKey: "key-b",
      priority: 2,
      isActive: true,
    });

    const credentials = await getProviderCredentials("openai", null, null, {
      allowedConnectionIds: [second.id],
    });

    expect(first.apiKey).toBe("key-a");
    expect(credentials.connectionId).toBe(second.id);
    expect(credentials.apiKey).toBe("key-b");
  });
});
