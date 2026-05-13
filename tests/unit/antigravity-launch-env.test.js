import { describe, expect, it } from "vitest";
import { buildAntigravityLaunchEnv } from "../../src/app/api/cli-tools/antigravity-mitm/launchHelpers.js";

describe("Antigravity launch environment", () => {
  it("preserves user proxy env while bypassing the MITM target hosts", () => {
    const env = buildAntigravityLaunchEnv({
      baseEnv: {
        HTTP_PROXY: "http://127.0.0.1:7890",
        HTTPS_PROXY: "http://127.0.0.1:7890",
        NO_PROXY: "example.com",
        GODEBUG: "http2debug=1,netdns=go",
        NINE_ROUTER_PROXY_URL: "http://managed-proxy",
        NINE_ROUTER_PROXY_MANAGED: "1",
      },
      homeDir: "/Users/tester",
      rootCaExists: () => false,
    });

    expect(env.HTTP_PROXY).toBe("http://127.0.0.1:7890");
    expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:7890");
    expect(env.NINE_ROUTER_PROXY_URL).toBeUndefined();
    expect(env.NINE_ROUTER_PROXY_MANAGED).toBeUndefined();
    expect(env.NO_PROXY.split(",")).toEqual(expect.arrayContaining([
      "example.com",
      "localhost",
      "127.0.0.1",
      "::1",
      "cloudcode-pa.googleapis.com",
      "daily-cloudcode-pa.googleapis.com",
    ]));
    expect(env.no_proxy).toBe(env.NO_PROXY);
    expect(env.GODEBUG).toBe("http2debug=1,netdns=cgo");
    expect(env.NODE_EXTRA_CA_CERTS).toBeUndefined();
  });
});
