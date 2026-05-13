import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const originalDataDir = process.env.DATA_DIR;

function clearMitmRequireCache() {
  for (const mod of [
    "../../src/mitm/manager.js",
    "../../src/mitm/paths.js",
    "../../src/mitm/logger.js",
  ]) {
    try {
      delete require.cache[require.resolve(mod)];
    } catch {
      // ignore
    }
  }
}

function loadManager(dataDir) {
  process.env.DATA_DIR = dataDir;
  clearMitmRequireCache();
  return require("../../src/mitm/manager.js");
}

function listenLocal() {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

afterEach(() => {
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  clearMitmRequireCache();
});

describe("MITM router base resolution", () => {
  it("uses current server.json base when stored localhost port is stale", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openrouterx-mitm-router-"));
    const server = await listenLocal();
    const port = server.address().port;
    fs.writeFileSync(
      path.join(tempDir, "server.json"),
      JSON.stringify({ baseUrl: `http://127.0.0.1:${port}` }),
    );

    let persisted = null;
    const manager = loadManager(tempDir);
    manager.initDbHooks(
      async () => ({ mitmRouterBaseUrl: "http://127.0.0.1:65530" }),
      async (updates) => { persisted = updates; },
    );

    try {
      await expect(manager.resolveMitmRouterBaseUrl()).resolves.toBe(`http://127.0.0.1:${port}`);
      expect(persisted).toEqual({ mitmRouterBaseUrl: `http://127.0.0.1:${port}` });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
