import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyOutboundProxyEnv } from "../../src/lib/network/outboundProxy.js";
import { shouldProxyByTargets } from "../../open-sse/utils/proxyFetch.js";

const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "NINE_ROUTER_PROXY_MANAGED",
  "NINE_ROUTER_PROXY_URL",
  "NINE_ROUTER_NO_PROXY",
  "NINE_ROUTER_PROXY_TARGETS",
];

const originalEnv = {};

beforeEach(() => {
  for (const key of PROXY_ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of PROXY_ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("outbound proxy target selection", () => {
  it("stores managed proxy as allowlist instead of global HTTP proxy env", () => {
    applyOutboundProxyEnv({
      outboundProxyEnabled: true,
      outboundProxyUrl: "socks5://user:pass@127.0.0.1:1080",
      outboundProxyTargets: ["api.openai.com", ".example.org"],
    });

    expect(process.env.NINE_ROUTER_PROXY_MANAGED).toBe("1");
    expect(process.env.NINE_ROUTER_PROXY_URL).toBe("socks5://user:pass@127.0.0.1:1080");
    expect(process.env.NINE_ROUTER_PROXY_TARGETS).toBe("api.openai.com,.example.org");
    expect(process.env.HTTP_PROXY).toBeUndefined();
    expect(process.env.HTTPS_PROXY).toBeUndefined();
    expect(process.env.ALL_PROXY).toBeUndefined();
  });

  it("matches only checked target hosts", () => {
    const targets = "api.openai.com,.example.org";

    expect(shouldProxyByTargets("https://api.openai.com/v1/responses", targets)).toBe(true);
    expect(shouldProxyByTargets("https://sub.example.org/v1", targets)).toBe(true);
    expect(shouldProxyByTargets("https://api.openai.com/v1/responses", "https://api.openai.com:443")).toBe(true);
    expect(shouldProxyByTargets("https://api.anthropic.com/v1/messages", targets)).toBe(false);
  });

  it("defaults to direct when no target is selected", () => {
    expect(shouldProxyByTargets("https://api.openai.com/v1/responses", "")).toBe(false);
  });
});
