import { describe, expect, it } from "vitest";

import {
  analyzeNetworkLogs,
  buildProjectNetworkSummary,
  redactProxyUrl,
} from "../../src/lib/network/networkDiagnostics.js";

describe("network diagnostics", () => {
  it("classifies local route loss before blaming the project", () => {
    const logs = [
      "[16:10:39] ❌ [MITM] Passthrough error: connect EADDRNOTAVAIL 216.239.38.223:443 - Local (0.0.0.0:0)",
      "[16:12:33] ❌ [MITM] Passthrough error: Client network socket disconnected before secure TLS connection was established",
      "[16:30:49] 🔍 [RETRY] network \"fetch failed\" retry 1/3 after 3s",
    ].join("\n");

    const result = analyzeNetworkLogs(logs, { now: new Date("2026-05-09T08:40:00.000Z") });

    expect(result.errorCounts.EADDRNOTAVAIL).toBe(1);
    expect(result.errorCounts.TLS_DISCONNECTED).toBe(1);
    expect(result.errorCounts.FETCH_FAILED).toBe(1);
    expect(result.verdict).toBe("external_or_route_instability");
    expect(result.findings[0].severity).toBe("warning");
  });

  it("marks unmanaged app settings as scoped when system proxy is empty", () => {
    const summary = buildProjectNetworkSummary({
      settings: {
        outboundProxyEnabled: true,
        outboundProxyUrl: "socks5://user:secret@example.com:1080",
        outboundProxyTargets: ["api.openai.com", "chatgpt.com"],
        mitmEnabled: true,
        dnsToolEnabled: { antigravity: true, openrouter: false },
        tunnelEnabled: false,
        tailscaleEnabled: false,
      },
      systemProxyText: "<dictionary> {\n}",
      dnsStatus: { antigravity: true, openrouter: false },
    });

    expect(summary.systemProxyManagedByProject).toBe(false);
    expect(summary.outboundProxy.scope).toBe("targeted");
    expect(summary.outboundProxy.url).toBe("socks5://user:***@example.com:1080");
    expect(summary.mitm.enabledTools).toEqual(["antigravity"]);
    expect(summary.riskLevel).toBe("medium");
  });

  it("redacts proxy credentials", () => {
    expect(redactProxyUrl("http://name:pass@proxy.local:8080")).toBe("http://name:***@proxy.local:8080");
    expect(redactProxyUrl("not a url")).toBe("not a url");
  });

  it("defaults network log analysis to a 24 hour window and supports narrower windows", () => {
    const logs = [
      "[15:00:00] ❌ [MITM] Passthrough error: connect EADDRNOTAVAIL 216.239.38.223:443 - Local (0.0.0.0:0)",
      "[17:15:00] ❌ [MITM] Passthrough error: connect EADDRNOTAVAIL 216.239.38.223:443 - Local (0.0.0.0:0)",
    ].join("\n");

    const now = new Date(2026, 4, 9, 17, 30, 0);
    const result = analyzeNetworkLogs(logs, { now });
    const narrow = analyzeNetworkLogs(logs, { now, windowHours: 1 });

    expect(result.windowHours).toBe(24);
    expect(result.errorCounts.EADDRNOTAVAIL).toBe(2);
    expect(narrow.errorCounts.EADDRNOTAVAIL).toBe(1);
    expect(narrow.timeline[0].time).toBe("17:15:00");
  });
});
