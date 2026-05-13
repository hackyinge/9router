import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getPreferredPort,
  getPortConflictMessage,
  formatChooserBanner,
  getChooserOptions,
} from "../../cli.js";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const cliPath = path.join(projectRoot, "cli.js");

describe("CLI chooser compatibility", () => {
  it("locks default port, conflict messaging, banner, and chooser options", () => {
    expect(getPreferredPort({ PORT: undefined })).toBe("20502");

    const conflictMessage = getPortConflictMessage("20502");
    expect(conflictMessage).toContain("openrouterX");
    expect(conflictMessage).toContain("PORT");

    const banner = formatChooserBanner("http://localhost:20502");
    expect(banner).toContain("openrouterX");
    expect(banner).toContain("http://localhost:20502");

    expect(getChooserOptions()).toEqual([
      "Web UI",
      "Terminal UI",
      "Hide to Tray",
      "Exit",
    ]);
  });

  it("starts from the packaged app server instead of hidden dot-build artifacts", () => {
    const cliSource = readFileSync(cliPath, "utf8");

    expect(cliSource).toContain('path.join(projectRoot, "app")');
    expect(cliSource).toContain('path.join(appRoot, "server.js")');
    expect(cliSource).not.toContain("standalone/server.js");
  });

  it("keeps the dev script aligned with the CLI-selected PORT", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    );

    expect(pkg.scripts.dev).toBe("next dev --webpack --port 20502");
    expect(pkg.scripts["dev:bun"]).toBe("bun --bun next dev --webpack --port 20502");
  });
});
