import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const packageJsonPath = path.join(projectRoot, "package.json");
const releaseScriptPath = path.join(projectRoot, "scripts", "release-npm.js");
const cliPath = path.join(projectRoot, "cli.js");

describe("npm publish CLI entry", () => {
  it("keeps the OpenrouterX source and publish package contracts aligned", () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));

    expect(pkg.name).toBe("9router-app");
    expect(pkg.private).toBe(true);
    expect(pkg.scripts["release:npm:dry"]).toBe("node scripts/release-npm.js --dry-run");
    expect(existsSync(cliPath)).toBe(true);
    expect(existsSync(releaseScriptPath)).toBe(true);

    const releaseScript = readFileSync(releaseScriptPath, "utf8");
    expect(releaseScript).toContain("name: \"@yina-npm/openrouterx\"");
    expect(releaseScript).toContain("openrouterX: \"./cli.js\"");
    expect(releaseScript).toContain("writePostinstallHook");
    expect(releaseScript).toContain("hooks/postinstall.js");
  });
});
