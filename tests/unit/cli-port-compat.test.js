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
  it("locks legacy default port, conflict messaging, banner, and chooser options", () => {
    expect(getPreferredPort({ PORT: undefined })).toBe("5020");

    const conflictMessage = getPortConflictMessage("5020");
    expect(conflictMessage).toContain("9router");
    expect(conflictMessage).toContain("PORT");

    const banner = formatChooserBanner("http://localhost:5020");
    expect(banner).toContain("Choose Interface");
    expect(banner).toContain("http://localhost:5020");

    expect(getChooserOptions()).toEqual([
      "Web UI",
      "Terminal UI",
      "Hide to Tray",
      "Exit",
    ]);
  });

  it("starts from the published source package instead of requiring hidden dot-build artifacts", () => {
    const cliSource = readFileSync(cliPath, "utf8");

    expect(cliSource).toContain("npmCmd");
    expect(cliSource).toContain('["run", "dev"]');
    expect(cliSource).not.toContain("standalone/server.js");
  });

  it("keeps the dev script aligned with the CLI-selected PORT", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    );

    expect(pkg.scripts.dev).toBe("next dev --webpack");
    expect(pkg.scripts["dev:bun"]).toBe("bun --bun next dev --webpack");
  });
});
