import { describe, expect, it } from "vitest";
import {
  buildAntigravityLaunchArgs,
  getAntigravityStateDbPath,
  getNewAntigravityUserDataDir,
} from "../../src/app/api/cli-tools/antigravity-mitm/launchHelpers.js";

describe("Antigravity new instance launch helpers", () => {
  it("keeps restart launches on the default profile", () => {
    expect(buildAntigravityLaunchArgs({ mode: "restart", userDataDir: "/tmp/ag-instance" })).toEqual([]);
  });

  it("uses an isolated user data directory for new Antigravity instances", () => {
    expect(buildAntigravityLaunchArgs({ mode: "new", userDataDir: "/tmp/ag-instance" })).toEqual([
      "--user-data-dir",
      "/tmp/ag-instance",
    ]);
  });

  it("stores new instance profiles under openrouterx and keeps the state DB layout compatible", () => {
    const userDataDir = getNewAntigravityUserDataDir("/Users/tester", "20260511-abc");

    expect(userDataDir).toBe("/Users/tester/.openrouterx/antigravity-instances/20260511-abc");
    expect(getAntigravityStateDbPath(userDataDir)).toBe(
      "/Users/tester/.openrouterx/antigravity-instances/20260511-abc/User/globalStorage/state.vscdb",
    );
  });
});
