import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const {
  getMissingHostsEntries,
  hostHasRequiredLoopbacks,
} = require("../../src/mitm/dns/dnsConfig.js");

describe("MITM DNS hosts entries", () => {
  const hosts = ["cloudcode-pa.googleapis.com"];
  const loopbacks = ["127.0.0.1", "::1"];

  it("requires IPv6 loopback when only the IPv4 hosts entry exists", () => {
    const content = "127.0.0.1 cloudcode-pa.googleapis.com\n";

    expect(hostHasRequiredLoopbacks(content, hosts[0], loopbacks)).toBe(false);
    expect(getMissingHostsEntries(content, hosts, loopbacks)).toEqual([
      "::1 cloudcode-pa.googleapis.com",
    ]);
  });

  it("treats a host as covered only when all required loopbacks exist", () => {
    const content = [
      "127.0.0.1 cloudcode-pa.googleapis.com",
      "::1 cloudcode-pa.googleapis.com",
      "",
    ].join("\n");

    expect(hostHasRequiredLoopbacks(content, hosts[0], loopbacks)).toBe(true);
    expect(getMissingHostsEntries(content, hosts, loopbacks)).toEqual([]);
  });
});
