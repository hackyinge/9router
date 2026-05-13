import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const {
  createLocalAliasResolutionError,
  parseMacRouteOutput,
  pickReachableAddress,
} = require("../../src/mitm/upstreamResolver.js");

describe("MITM upstream resolver", () => {
  it("跳过本机地址、重试规避地址和 lo0 本地路由地址", () => {
    const selected = pickReachableAddress(
      ["127.0.0.1", "216.239.32.223", "142.251.215.91"],
      {
        localAddresses: ["127.0.0.1"],
        avoidAddresses: ["216.239.32.223"],
        routeInspector: (address) => ({
          address,
          local: address === "142.251.215.91",
          reason: address === "142.251.215.91" ? "local_route" : "reachable_route",
          route: { interface: address === "142.251.215.91" ? "lo0" : "en0", flags: [] },
        }),
      }
    );

    expect(selected).toBeNull();
  });

  it("解析 macOS route 输出并生成可诊断的本地别名错误", () => {
    const route = parseMacRouteOutput(`
   route to: 216.239.32.223
destination: 216.239.32.223
  interface: lo0
      flags: <UP,HOST,DONE,LOCAL>
`);

    expect(route.interface).toBe("lo0");
    expect(route.flags).toContain("LOCAL");

    const error = createLocalAliasResolutionError("cloudcode-pa.googleapis.com", ["216.239.32.223"], {
      routeInspector: () => ({ local: true, reason: "local_route", route }),
    });

    expect(error.code).toBe("MITM_LOCAL_ALIAS_ROUTE");
    expect(error.message).toContain("cloudcode-pa.googleapis.com");
    expect(error.message).toContain("local_route");
  });
});
